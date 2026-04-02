import { type AstNode, type AstNodeDescription, type LangiumDocument, type ReferenceInfo, type Stream, AstUtils, GrammarAST, type MaybePromise } from 'langium';
import type { CompletionAcceptor, CompletionContext, NextFeature } from 'langium/lsp';
import { randomUUID } from 'node:crypto';
import { type CancellationToken, type CompletionItem, type CompletionParams, InsertTextFormat, TextEdit } from 'vscode-languageserver';
import * as ast from '../generated/ast-partial.js';
import * as Solver from '../utils/solver.js';
import { PTK } from '../utils/primitive-type-kind.js';
import { VisibilityKind } from '../utils/visibility-kind.js';
import * as XsmpUtils from '../utils/xsmp-utils.js';
import { XsmpcatValidator } from '../validation/xsmpcat-validator.js';
import type { XsmpcatServices } from '../xsmpcat-module.js';
import { XsmpCompletionProviderBase } from './xsmp-completion-provider-base.js';

type ClassifierCompletionScope = ast.Class | ast.Exception | ast.Interface | ast.Model | ast.Service;
type StatementCompletionScope =
    | { kind: 'catalogue' }
    | { kind: 'namespace' }
    | { kind: 'enumeration' }
    | { kind: 'structure' }
    | { kind: 'classifier'; node: ClassifierCompletionScope };
type ValueCompletionOwner = ast.Constant | ast.Field;
type ValueCompletionReferenceContext = {
    owner: ValueCompletionOwner;
    refInfo: ReferenceInfo;
};
type ValueCompletionItem = ReturnType<XsmpCompletionProviderBase['createValueItem']>;
type StatementSnippetSpec = {
    label: string;
    detail: string;
    buildInsertText: (context: CompletionContext) => string;
    typeScoped?: boolean;
};
type KeywordSnippetSpec = StatementSnippetSpec & {
    keyword: string;
};
type ClassifierSnippetSpec = KeywordSnippetSpec & {
    supports: (classifier: ClassifierCompletionScope) => boolean;
};

export class XsmpcatCompletionProvider extends XsmpCompletionProviderBase {
    private readonly floatRegex = /^(Smp\.)?Float(32|64)$/;
    private readonly intRegex = /^(Smp\.)?U?Int(8|16|32|64)$/;
    override readonly completionOptions = {
        triggerCharacters: ['=', '@'],
    };
    protected readonly catalogueSnippetSpec: KeywordSnippetSpec = {
        keyword: 'catalogue',
        label: 'Catalogue',
        detail: 'Catalogue Definition',
        buildInsertText: () => 'catalogue ${1:Catalogue}\n$0',
    };
    protected readonly enumerationLiteralSnippetSpec: StatementSnippetSpec = {
        label: 'Enumeration Literal',
        detail: 'Enumeration Literal',
        buildInsertText: () => '${1:Literal} = ${2:0}',
    };
    protected readonly typeDefinitionSnippetSpecs: readonly KeywordSnippetSpec[] = [
        {
            keyword: 'namespace',
            label: 'Namespace',
            detail: 'Namespace Definition',
            buildInsertText: () => 'namespace ${1:Namespace}\n{\n\t$0\n}',
        },
        {
            keyword: 'struct',
            label: 'Structure',
            detail: 'Structure Definition',
            buildInsertText: () => 'struct ${1:Name}\n{\n\t$0\n}',
            typeScoped: true,
        },
        {
            keyword: 'class',
            label: 'Class',
            detail: 'Class Definition',
            buildInsertText: () => 'class ${1:Name}\n{\n\t$0\n}',
            typeScoped: true,
        },
        {
            keyword: 'exception',
            label: 'Exception',
            detail: 'Exception Definition',
            buildInsertText: () => 'exception ${1:Name}\n{\n\t$0\n}',
            typeScoped: true,
        },
        {
            keyword: 'interface',
            label: 'Interface',
            detail: 'Interface Definition',
            buildInsertText: () => 'interface ${1:Name}\n{\n\t$0\n}',
            typeScoped: true,
        },
        {
            keyword: 'model',
            label: 'Model',
            detail: 'Model Definition',
            buildInsertText: () => 'model ${1:Name}\n{\n\t$0\n}',
            typeScoped: true,
        },
        {
            keyword: 'service',
            label: 'Service',
            detail: 'Service Definition',
            buildInsertText: () => 'service ${1:Name}\n{\n\t$0\n}',
            typeScoped: true,
        },
        {
            keyword: 'array',
            label: 'Array',
            detail: 'Array Definition',
            buildInsertText: context => this.buildArrayDefinitionSnippet(context),
            typeScoped: true,
        },
        {
            keyword: 'using',
            label: 'Value Reference',
            detail: 'Value Reference Definition',
            buildInsertText: context => this.buildValueReferenceDefinitionSnippet(context),
            typeScoped: true,
        },
        {
            keyword: 'integer',
            label: 'Integer',
            detail: 'Integer Definition',
            buildInsertText: () => 'integer ${1:Name} extends ${2:Smp.Int32}',
            typeScoped: true,
        },
        {
            keyword: 'float',
            label: 'Float',
            detail: 'Float Definition',
            buildInsertText: () => 'float ${1:Name} extends ${2:Smp.Float64}',
            typeScoped: true,
        },
        {
            keyword: 'event',
            label: 'Event Type',
            detail: 'Event Type Definition',
            buildInsertText: () => 'event ${1:Name}',
            typeScoped: true,
        },
        {
            keyword: 'string',
            label: 'String',
            detail: 'String Definition',
            buildInsertText: () => 'string ${1:Name}[${2:32}]',
            typeScoped: true,
        },
        {
            keyword: 'primitive',
            label: 'Primitive',
            detail: 'Primitive Type Definition',
            buildInsertText: () => 'primitive ${1:Name}',
            typeScoped: true,
        },
        {
            keyword: 'native',
            label: 'Native',
            detail: 'Native Type Definition',
            buildInsertText: () => 'native ${1:Name}',
            typeScoped: true,
        },
        {
            keyword: 'attribute',
            label: 'Attribute Type',
            detail: 'Attribute Type Definition',
            buildInsertText: context => this.buildAttributeTypeDefinitionSnippet(context),
            typeScoped: true,
        },
        {
            keyword: 'enum',
            label: 'Enumeration',
            detail: 'Enumeration Definition',
            buildInsertText: () => 'enum ${1:Name}\n{\n\t${2:Literal} = ${3:0}\n}',
            typeScoped: true,
        },
    ];
    protected readonly namespaceSnippetSpec = this.typeDefinitionSnippetSpecs.find(spec => spec.keyword === 'namespace')!;
    protected readonly classifierMemberSnippetSpecs: readonly ClassifierSnippetSpec[] = [
        {
            keyword: 'constant',
            label: 'Constant',
            detail: 'Constant Definition',
            buildInsertText: context => this.buildConstantDefinitionSnippet(context),
            supports: () => true,
        },
        {
            keyword: 'field',
            label: 'Field',
            detail: 'Field Definition',
            buildInsertText: context => this.buildFieldDefinitionSnippet(context),
            supports: classifier => this.isFieldOwner(classifier),
        },
        {
            keyword: 'property',
            label: 'Property',
            detail: 'Property Definition',
            buildInsertText: context => this.buildPropertyDefinitionSnippet(context),
            supports: classifier => this.isPropertyOwner(classifier),
        },
        {
            keyword: 'def',
            label: 'Operation',
            detail: 'Operation Definition',
            buildInsertText: () => 'def void ${1:name}($0)',
            supports: classifier => this.isPropertyOwner(classifier),
        },
        {
            keyword: 'association',
            label: 'Association',
            detail: 'Association Definition',
            buildInsertText: context => this.buildAssociationDefinitionSnippet(context),
            supports: classifier => this.isAssociationOwner(classifier),
        },
        {
            keyword: 'container',
            label: 'Container',
            detail: 'Container Definition',
            buildInsertText: context => this.buildContainerDefinitionSnippet(context),
            supports: classifier => this.isComponentCompletionScope(classifier),
        },
        {
            keyword: 'reference',
            label: 'Reference',
            detail: 'Reference Definition',
            buildInsertText: context => this.buildReferenceDefinitionSnippet(context),
            supports: classifier => this.isComponentCompletionScope(classifier),
        },
        {
            keyword: 'realization',
            label: 'Realization',
            detail: 'Realization Definition',
            buildInsertText: context => this.buildRealizationDefinitionSnippet(context),
            supports: classifier => this.isComponentCompletionScope(classifier),
        },
        {
            keyword: 'entrypoint',
            label: 'Entry Point',
            detail: 'Entry Point Definition',
            buildInsertText: () => 'entrypoint ${1:name}',
            supports: classifier => this.isComponentCompletionScope(classifier),
        },
        {
            keyword: 'eventsink',
            label: 'Event Sink',
            detail: 'Event Sink Definition',
            buildInsertText: context => this.buildEventSinkDefinitionSnippet(context),
            supports: classifier => this.isComponentCompletionScope(classifier),
        },
        {
            keyword: 'eventsource',
            label: 'Event Source',
            detail: 'Event Source Definition',
            buildInsertText: context => this.buildEventSourceDefinitionSnippet(context),
            supports: classifier => this.isComponentCompletionScope(classifier),
        },
    ];
    protected readonly keywordSnippetSpecs: readonly KeywordSnippetSpec[] = [
        this.catalogueSnippetSpec,
        ...this.typeDefinitionSnippetSpecs,
        ...this.classifierMemberSnippetSpecs,
    ];
    protected readonly namespaceLevelLabels = new Set(this.typeDefinitionSnippetSpecs.map(spec => spec.label));
    protected readonly structureMemberSnippetSpecs = this.classifierMemberSnippetSpecs.filter(spec =>
        spec.keyword === 'field' || spec.keyword === 'constant'
    );
    protected readonly structureLevelLabels = new Set(this.structureMemberSnippetSpecs.map(spec => spec.label));
    protected readonly enumerationLevelLabels = new Set([this.enumerationLiteralSnippetSpec.label]);
    protected completionSnippetUuids = new Map<string, string>();
    protected override readonly snippetOnlyKeywords = new Set(this.keywordSnippetSpecs.map(spec => spec.keyword));

    constructor(services: XsmpcatServices) {
        super(services);
    }

    override async getCompletion(document: LangiumDocument, params: CompletionParams, cancelToken?: CancellationToken) {
        this.completionSnippetUuids = new Map();
        try {
            const completion = await super.getCompletion(document, params, cancelToken);
            completion.items = this.prioritizeValueCompletions(document, params, completion.items);
            return completion;
        } finally {
            this.completionSnippetUuids.clear();
        }
    }

    protected isReferenceProperty(refInfo: ReferenceInfo, type: string | { readonly $type: string }, property: string): boolean {
        const expectedType = typeof type === 'string' ? type : type.$type;
        return refInfo.container.$type === expectedType && refInfo.property === property;
    }

    protected isValidAttributeType(desc: AstNodeDescription, attribute: ast.Attribute): boolean {
        if (!ast.isAttributeType(desc.node)) {
            return false;
        }

        const usages = this.docHelper.getUsages(desc.node);
        const elementType = XsmpUtils.getNodeType(attribute.$container);
        if (!usages?.find(u => ast.reflection.isSubtype(elementType, u.toString()))) {
            return false;
        }

        if (attribute.$container.attributes.some(a => a.type?.ref === desc.node) && !this.docHelper.allowMultiple(desc.node)) {
            return false;
        }
        return XsmpUtils.isTypeVisibleFrom(attribute, desc.node);
    }

    protected isValidNamedElementReference(desc: AstNodeDescription, expression: ast.Expression): boolean {
        const type = this.typeProvider.getType(expression);
        if (ast.isEnumerationLiteral(desc.node)) {
            return type ? desc.node.$container === type : true;
        }
        return ast.isConstant(desc.node)
            && XsmpUtils.isConstantVisibleFrom(expression, desc.node)
            && (type ? this.hasExpectedValueReferenceType(type, desc.node.type?.ref) : true);
    }

    protected getExpectedReferenceType(refInfo: ReferenceInfo): string | undefined {
        try {
            return XsmpcatValidator.getReferenceType(refInfo.container.$type, refInfo.property);
        } catch {
            return undefined;
        }
    }

    protected createExpectedTypeReferenceFilter(
        refInfo: ReferenceInfo,
        extra?: (desc: AstNodeDescription) => boolean,
    ): (desc: AstNodeDescription) => boolean {
        const expectedType = this.getExpectedReferenceType(refInfo);
        return desc => expectedType !== undefined
            && ast.isType(desc.node)
            && ast.reflection.isSubtype(desc.type, expectedType)
            && XsmpUtils.isTypeVisibleFrom(refInfo.container, desc.node)
            && (extra?.(desc) ?? true);
    }

    protected isAccessibleSiblingField(refInfo: ReferenceInfo, desc: AstNodeDescription): desc is AstNodeDescription & { node: ast.Field } {
        return ast.isField(desc.node)
            && (desc.node.$container === refInfo.container.$container || XsmpUtils.getRealVisibility(desc.node) !== VisibilityKind.private);
    }

    protected getFilter(refInfo: ReferenceInfo): ((desc: AstNodeDescription) => boolean) | undefined {
        if (this.isReferenceProperty(refInfo, ast.Attribute, ast.Attribute.type)) {
            return desc => this.isValidAttributeType(desc, refInfo.container as ast.Attribute);
        }
        if (this.isReferenceProperty(refInfo, ast.Class, ast.Class.base)) {
            return this.createExpectedTypeReferenceFilter(refInfo, desc => ast.isClass(desc.node)
                && !XsmpUtils.isBaseOfClass(refInfo.container as ast.Class, desc.node));
        }
        if (this.isReferenceProperty(refInfo, ast.Interface, ast.Interface.base)) {
            return this.createExpectedTypeReferenceFilter(refInfo, desc => ast.isInterface(desc.node)
                && !XsmpUtils.isBaseOfInterface(refInfo.container as ast.Interface, desc.node)
                && !(refInfo.container as ast.Interface).base.some(i => i.ref === desc.node));
        }
        if (this.isReferenceProperty(refInfo, ast.Model, ast.Component.interface) || this.isReferenceProperty(refInfo, ast.Service, ast.Component.interface)) {
            return this.createExpectedTypeReferenceFilter(refInfo, desc => ast.isInterface(desc.node)
                && !(refInfo.container as ast.Component).interface.some(i => i.ref === desc.node));
        }
        if (this.isReferenceProperty(refInfo, ast.Model, ast.Component.base)) {
            return this.createExpectedTypeReferenceFilter(refInfo, desc => ast.isModel(desc.node)
                && !XsmpUtils.isBaseOfComponent(refInfo.container as ast.Component, desc.node));
        }
        if (this.isReferenceProperty(refInfo, ast.Service, ast.Component.base)) {
            return this.createExpectedTypeReferenceFilter(refInfo, desc => ast.isService(desc.node)
                && !XsmpUtils.isBaseOfComponent(refInfo.container as ast.Component, desc.node));
        }
        if (this.isReferenceProperty(refInfo, ast.ArrayType, ast.ArrayType.itemType)) {
            return this.createExpectedTypeReferenceFilter(refInfo, desc => !XsmpUtils.isRecursiveType(refInfo.container as ast.ArrayType, desc.node as ast.Type));
        }
        if (this.isReferenceProperty(refInfo, ast.Field, ast.Field.type)) {
            return this.createExpectedTypeReferenceFilter(refInfo, desc => !XsmpUtils.isRecursiveType((refInfo.container as ast.Field).$container, desc.node as ast.Type));
        }
        if (this.isReferenceProperty(refInfo, ast.Property, ast.Property.attachedField)) {
            return desc => this.isAccessibleSiblingField(refInfo, desc);
        }
        if (this.isReferenceProperty(refInfo, ast.Integer, ast.Integer.primitiveType)) {
            return this.createExpectedTypeReferenceFilter(refInfo, desc => desc.type === ast.PrimitiveType.$type && this.intRegex.test(desc.name));
        }
        if (this.isReferenceProperty(refInfo, ast.Float, ast.Float.primitiveType)) {
            return this.createExpectedTypeReferenceFilter(refInfo, desc => desc.type === ast.PrimitiveType.$type && this.floatRegex.test(desc.name));
        }
        if (this.isReferenceProperty(refInfo, ast.Operation, ast.Operation.raisedException)) {
            return this.createExpectedTypeReferenceFilter(refInfo, desc => ast.isException(desc.node)
                && !(refInfo.container as ast.Operation).raisedException.some(e => e.ref === desc.node));
        }
        if (this.isReferenceProperty(refInfo, ast.Property, ast.Property.getRaises)) {
            return this.createExpectedTypeReferenceFilter(refInfo, desc => ast.isException(desc.node)
                && !(refInfo.container as ast.Property).getRaises.some(e => e.ref === desc.node));
        }
        if (this.isReferenceProperty(refInfo, ast.Property, ast.Property.setRaises)) {
            return this.createExpectedTypeReferenceFilter(refInfo, desc => ast.isException(desc.node)
                && !(refInfo.container as ast.Property).setRaises.some(e => e.ref === desc.node));
        }
        if (this.isReferenceProperty(refInfo, ast.Exception, ast.Class.base)) {
            return this.createExpectedTypeReferenceFilter(refInfo, desc => ast.isException(desc.node)
                && !XsmpUtils.isBaseOfClass(refInfo.container as ast.Class, desc.node));
        }
        if (this.isReferenceProperty(refInfo, ast.EntryPoint, ast.EntryPoint.input)) {
            return desc => this.isAccessibleSiblingField(refInfo, desc) && XsmpUtils.isInput(desc.node);
        }
        if (this.isReferenceProperty(refInfo, ast.EntryPoint, ast.EntryPoint.output)) {
            return desc => this.isAccessibleSiblingField(refInfo, desc) && XsmpUtils.isOutput(desc.node);
        }
        if (this.isReferenceProperty(refInfo, ast.NamedElementReference, ast.NamedElementReference.value)) {
            return desc => this.isValidNamedElementReference(desc, refInfo.container as ast.Expression);
        }
        return this.getExpectedReferenceType(refInfo)
            ? this.createExpectedTypeReferenceFilter(refInfo)
            : undefined;
    }

    protected override getReferenceCandidates(refInfo: ReferenceInfo, context: CompletionContext): Stream<AstNodeDescription> {
        const filter = this.getFilter(refInfo);
        if (filter) {
            return super.getReferenceCandidates(refInfo, context).filter(filter);
        }
        return super.getReferenceCandidates(refInfo, context);
    }

    protected override createReferenceCompletionItem(nodeDescription: AstNodeDescription) {
        const item = super.createReferenceCompletionItem(nodeDescription);
        const typeGroup = ast.isPrimitiveType(nodeDescription.node) ? '0000' : '1000';
        const depth = nodeDescription.name.split('.').length.toString().padStart(4, '0');
        return {
            ...item,
            sortText: this.createSortText(`${typeGroup}_${depth}`, nodeDescription.name),
        };
    }

    protected override completionForCrossReference(context: CompletionContext, next: NextFeature<GrammarAST.CrossReference>, acceptor: CompletionAcceptor): MaybePromise<void> {
        super.completionForCrossReference(context, next, acceptor);

        const assignment = AstUtils.getContainerOfType(next.feature, GrammarAST.isAssignment);
        let { node } = context;
        if (!assignment || !node) {
            return;
        }

        if (next.type) {
            node = {
                $type: next.type,
                $container: node,
                $containerProperty: next.property,
            };
            AstUtils.assignMandatoryProperties(this.astReflection, node);
        }

        if (node.$type !== ast.NamedElementReference.$type || assignment.feature !== ast.NamedElementReference.value) {
            return;
        }

        const type = this.typeProvider.getType(node as ast.Expression);
        if (type) {
            this.addValueCompletionsForType(type, context, acceptor);
        }
    }

    protected addTypedValueCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        const type = this.getValueCompletionTargetType(context);
        if (type) {
            this.addValueCompletionsForType(type, context, acceptor);
        }
    }

    protected addValueCompletionsForType(type: ast.Type, context: CompletionContext, acceptor: CompletionAcceptor): void {
        for (const item of this.getXsmpcatValueCompletions(type)) {
            acceptor(context, item);
        }
        if (this.isNullptrCompatibleType(type)) {
            acceptor(context, this.createValueItem('nullptr', 'nullptr', 'Null pointer / null reference expression.'));
        }
        for (const item of this.getConstantValueCompletions(type, context)) {
            acceptor(context, item);
        }
    }

    protected getConstantValueCompletions(type: ast.Type, context: CompletionContext): ValueCompletionItem[] {
        const valueContext = this.getValueCompletionReferenceContext(context);
        if (!valueContext) {
            return [];
        }
        return this.getConstantValueDescriptions(type, valueContext)
            .map(desc => this.createReferenceCompletionItemFor(valueContext.refInfo, context, desc) as ValueCompletionItem)
            .toArray();
    }

    protected getConstantValueCompletionLabels(type: ast.Type, context: CompletionContext): Set<string> {
        const valueContext = this.getValueCompletionReferenceContext(context);
        return new Set(valueContext ? this.getConstantValueDescriptions(type, valueContext).map(desc => desc.name).toArray() : []);
    }

    protected getValueCompletionReferenceContext(context: CompletionContext): ValueCompletionReferenceContext | undefined {
        const owner = this.getValueCompletionOwner(context);
        if (!owner) {
            return undefined;
        }
        return {
            owner,
            refInfo: {
                reference: {
                    $refText: '',
                    ref: undefined,
                },
                container: owner,
                property: ast.NamedElementReference.value,
            },
        };
    }

    protected getConstantValueDescriptions(
        type: ast.Type,
        valueContext: ValueCompletionReferenceContext,
    ): Stream<AstNodeDescription & { node: ast.Constant }> {
        return this.scopeProvider
            .getScope(valueContext.refInfo)
            .getAllElements()
            .filter((desc): desc is AstNodeDescription & { node: ast.Constant } => ast.isConstant(desc.node)
                && this.hasExpectedValueReferenceType(type, desc.node.type?.ref)
                && this.isValueConstantVisibleFromOwner(valueContext.owner, desc.node));
    }

    protected hasExpectedValueReferenceType(expectedType: ast.Type, candidateType: ast.Type | undefined): boolean {
        return candidateType === expectedType;
    }

    protected isValueConstantVisibleFromOwner(owner: ValueCompletionOwner, constant: ast.Constant): boolean {
        return constant.$container === owner.$container || XsmpUtils.getRealVisibility(constant) !== VisibilityKind.private;
    }

    protected isFieldOwner(node: AstNode): node is ast.Structure | ast.Class | ast.Exception | ast.Model | ast.Service {
        return ast.isStructure(node) || ast.isModel(node) || ast.isService(node);
    }

    protected isPropertyOwner(node: AstNode): node is ast.Class | ast.Exception | ast.Interface | ast.Model | ast.Service {
        return ast.isClass(node) || ast.isException(node) || ast.isInterface(node) || ast.isModel(node) || ast.isService(node);
    }

    protected isAssociationOwner(node: AstNode): node is ast.Class | ast.Exception | ast.Model | ast.Service {
        return ast.isClass(node) || ast.isException(node) || ast.isModel(node) || ast.isService(node);
    }

    protected isComponentCompletionScope(node: AstNode): node is ast.Model | ast.Service {
        return ast.isModel(node) || ast.isService(node);
    }

    protected getKeywordSnippetSpec(keyword: string): KeywordSnippetSpec | undefined {
        return this.keywordSnippetSpecs.find(spec => spec.keyword === keyword);
    }

    protected addStatementSnippetSpec(context: CompletionContext, acceptor: CompletionAcceptor, spec: StatementSnippetSpec): void {
        const item = spec.typeScoped
            ? this.createTypeSnippetItem(spec.label, spec.buildInsertText(context), spec.detail)
            : this.createSnippetItem(spec.label, spec.buildInsertText(context), spec.detail);
        acceptor(context, item);
    }

    protected addStatementSnippetSpecs(
        context: CompletionContext,
        acceptor: CompletionAcceptor,
        specs: readonly StatementSnippetSpec[],
    ): void {
        for (const spec of specs) {
            this.addStatementSnippetSpec(context, acceptor, spec);
        }
    }

    protected buildTypedDefinitionSnippet(
        context: CompletionContext,
        keyword: string,
        type: string | { readonly $type: string },
        property: string,
        fallbackType: string,
        options?: {
            suffix?: string;
            name?: string;
            defaultValue?: string;
        },
    ): string {
        const typeName = this.createChoicePlaceholder(1, this.getCrossReferenceNames(context, type, property), fallbackType);
        const name = this.createPlaceholder(2, options?.name ?? 'name');
        const suffix = options?.suffix ?? '';
        const defaultValue = options?.defaultValue;
        const valuePart = defaultValue === undefined ? '' : ` = ${this.createPlaceholder(3, defaultValue)}`;
        return `${keyword} ${typeName} ${name}${suffix}${valuePart}`;
    }

    protected buildArrayDefinitionSnippet(context: CompletionContext): string {
        return `array ${this.createPlaceholder(1, 'Name')} = ${this.createChoicePlaceholder(2, this.getCrossReferenceNames(context, ast.ArrayType, ast.ArrayType.itemType), 'Smp.Float64')}[${this.createPlaceholder(3, '1')}]`;
    }

    protected buildValueReferenceDefinitionSnippet(context: CompletionContext): string {
        return `using ${this.createPlaceholder(1, 'Name')} = ${this.createChoicePlaceholder(2, this.getCrossReferenceNames(context, ast.ValueReference, ast.ValueReference.type), 'Smp.Float64')}*`;
    }

    protected buildAttributeTypeDefinitionSnippet(context: CompletionContext): string {
        return this.buildTypedDefinitionSnippet(context, 'attribute', ast.AttributeType, ast.AttributeType.type, 'Smp.Bool', { name: 'Name', defaultValue: 'false' });
    }

    protected buildConstantDefinitionSnippet(context: CompletionContext): string {
        return this.buildTypedDefinitionSnippet(context, 'constant', ast.Constant, ast.Constant.type, 'Smp.Int32', { defaultValue: '0' });
    }

    protected buildFieldDefinitionSnippet(context: CompletionContext): string {
        return this.buildTypedDefinitionSnippet(context, 'field', ast.Field, ast.Field.type, 'Smp.Int32');
    }

    protected buildPropertyDefinitionSnippet(context: CompletionContext): string {
        return this.buildTypedDefinitionSnippet(context, 'property', ast.Property, ast.Property.type, 'Smp.Int32');
    }

    protected buildAssociationDefinitionSnippet(context: CompletionContext): string {
        return this.buildTypedDefinitionSnippet(context, 'association', ast.Association, ast.Association.type, 'Type');
    }

    protected buildContainerDefinitionSnippet(context: CompletionContext): string {
        return this.buildTypedDefinitionSnippet(context, 'container', ast.Container, ast.Container.type, 'Component', { suffix: '*' });
    }

    protected buildReferenceDefinitionSnippet(context: CompletionContext): string {
        return this.buildTypedDefinitionSnippet(context, 'reference', ast.Reference, ast.Reference.interface, 'Interface', { suffix: '*' });
    }

    protected buildRealizationDefinitionSnippet(context: CompletionContext): string {
        return this.buildTypedDefinitionSnippet(context, 'realization', ast.Realization, ast.Realization.interface, 'Interface');
    }

    protected buildEventSinkDefinitionSnippet(context: CompletionContext): string {
        return this.buildTypedDefinitionSnippet(context, 'eventsink', ast.EventSink, ast.EventSink.type, 'EventType');
    }

    protected buildEventSourceDefinitionSnippet(context: CompletionContext): string {
        return this.buildTypedDefinitionSnippet(context, 'eventsource', ast.EventSource, ast.EventSource.type, 'EventType');
    }

    protected override createEnrichedReferenceCompletionItem(
        refInfo: ReferenceInfo,
        context: CompletionContext,
        nodeDescription: AstNodeDescription,
    ) {
        if (this.isReferenceProperty(refInfo, ast.Field, ast.Field.type)) {
            return this.createTypedMemberSnippet(context, nodeDescription, 'Field Definition');
        }
        if (this.isReferenceProperty(refInfo, ast.Constant, ast.Constant.type)) {
            return this.createTypedMemberSnippet(context, nodeDescription, 'Constant Definition');
        }
        if (this.isReferenceProperty(refInfo, ast.Property, ast.Property.type)) {
            return this.createTypedMemberSnippet(context, nodeDescription, 'Property Definition');
        }
        if (this.isReferenceProperty(refInfo, ast.Association, ast.Association.type)) {
            return this.createTypedMemberSnippet(context, nodeDescription, 'Association Definition');
        }
        if (this.isReferenceProperty(refInfo, ast.Container, ast.Container.type)) {
            return this.createTypedMemberSnippet(context, nodeDescription, 'Container Definition', '*');
        }
        if (this.isReferenceProperty(refInfo, ast.Reference, ast.Reference.interface)) {
            return this.createTypedMemberSnippet(context, nodeDescription, 'Reference Definition', '*');
        }
        if (this.isReferenceProperty(refInfo, ast.Realization, ast.Realization.interface)) {
            return this.createTypedMemberSnippet(context, nodeDescription, 'Realization Definition');
        }
        if (this.isReferenceProperty(refInfo, ast.EventSink, ast.EventSink.type)) {
            return this.createTypedMemberSnippet(context, nodeDescription, 'Event Sink Definition');
        }
        if (this.isReferenceProperty(refInfo, ast.EventSource, ast.EventSource.type)) {
            return this.createTypedMemberSnippet(context, nodeDescription, 'Event Source Definition');
        }
        if (this.isReferenceProperty(refInfo, ast.ValueReference, ast.ValueReference.type)) {
            return this.createReferenceLikeItem(nodeDescription, `${this.createPlaceholder(1, 'Name')} = ${nodeDescription.name}*`, 'Value reference definition.');
        }
        if (this.isReferenceProperty(refInfo, ast.ArrayType, ast.ArrayType.itemType)) {
            return this.createReferenceLikeItem(nodeDescription, `${nodeDescription.name}[${this.createPlaceholder(1, '1')}]`, 'Array definition.');
        }
        if (
            this.isReferenceProperty(refInfo, ast.Property, ast.Property.attachedField)
            || this.isReferenceProperty(refInfo, ast.EntryPoint, ast.EntryPoint.input)
            || this.isReferenceProperty(refInfo, ast.EntryPoint, ast.EntryPoint.output)
        ) {
            return this.createReferenceLikeItem(nodeDescription, nodeDescription.name, nodeDescription.type);
        }
        return undefined;
    }

    protected override createKeywordSnippets(context: CompletionContext, keyword: GrammarAST.Keyword, acceptor: CompletionAcceptor): void {
        const spec = this.getKeywordSnippetSpec(keyword.value);
        if (!spec) {
            return;
        }
        const item = spec.typeScoped
            ? this.createTypeKeywordSnippet(keyword, spec.buildInsertText(context), spec.detail, spec.label)
            : this.createKeywordSnippet(keyword, spec.buildInsertText(context), spec.detail, spec.label);
        acceptor(context, item);
    }

    protected override addStandaloneCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        if (this.isAfterEquals(context)) {
            this.addTypedValueCompletions(context, acceptor);
            return;
        }
        this.addStatementSnippets(context, acceptor);
    }

    protected override filterCompletionItems(context: CompletionContext, items: CompletionItem[]): CompletionItem[] {
        const filtered = super.filterCompletionItems(context, items);
        if (!this.isAtStatementPrefix(context) || !this.isOutsideRecoveredBlock(context)) {
            return filtered;
        }
        const scope = this.getStatementCompletionScope(context);
        switch (scope?.kind) {
            case 'catalogue':
                return filtered.filter(item => item.label === 'Namespace');
            case 'namespace':
                return filtered.filter(item => this.namespaceLevelLabels.has(item.label));
            case 'enumeration':
                return filtered.filter(item => this.enumerationLevelLabels.has(item.label));
            case 'structure':
                return filtered.filter(item => this.structureLevelLabels.has(item.label));
            default:
                return filtered;
        }
    }

    protected addStatementSnippets(context: CompletionContext, acceptor: CompletionAcceptor): void {
        if (!this.isAtStatementPrefix(context)) {
            return;
        }

        if (context.document.textDocument.getText().trim().length === 0) {
            this.addStatementSnippetSpec(context, acceptor, this.catalogueSnippetSpec);
            return;
        }
        const scope = this.getStatementCompletionScope(context);
        switch (scope?.kind) {
            case undefined:
                this.addStatementSnippetSpec(context, acceptor, this.catalogueSnippetSpec);
                return;
            case 'catalogue':
                this.addStatementSnippetSpec(context, acceptor, this.namespaceSnippetSpec);
                return;
            case 'namespace':
                this.addTypeDefinitionSnippets(context, acceptor);
                return;
            case 'enumeration':
                this.addStatementSnippetSpec(context, acceptor, this.enumerationLiteralSnippetSpec);
                return;
            case 'structure':
                this.addStatementSnippetSpecs(context, acceptor, this.structureMemberSnippetSpecs);
                return;
            case 'classifier':
                this.addClassifierMemberSnippets(context, scope.node, acceptor);
                return;
        }
    }

    protected getStatementCompletionScope(context: CompletionContext): StatementCompletionScope | undefined {
        const catalogue = this.getActiveEnclosingContainerOfType(context, ast.isCatalogue);
        if (!catalogue) {
            return undefined;
        }
        if (this.getActiveEnclosingContainerOfType(context, ast.isEnumeration)) {
            return { kind: 'enumeration' };
        }
        const structure = this.getActiveEnclosingContainerOfType(context, ast.isStructure);
        if (structure && !this.isClassifierCompletionScope(structure)) {
            return { kind: 'structure' };
        }
        const classifier = this.getActiveEnclosingContainerOfType(context, this.isClassifierCompletionScope);
        if (classifier) {
            return { kind: 'classifier', node: classifier };
        }
        if (this.getActiveEnclosingContainerOfType(context, ast.isNamespace)) {
            return { kind: 'namespace' };
        }
        return { kind: 'catalogue' };
    }

    protected getActiveEnclosingContainerOfType<T extends AstNode>(
        context: CompletionContext,
        predicate: (node: AstNode) => node is T,
    ): T | undefined {
        const contained =
            this.findContainingNode(context, predicate)
            ?? this.findContainingTextBlockNode(context, predicate);
        if (contained && this.isInsideNodeBody(context, contained)) {
            return contained;
        }
        const root = context.document.parseResult.value;
        if (predicate(root)) {
            return root;
        }
        const recoveryNode = this.getRecoveryAstNode(context);
        const recovered = recoveryNode.$container ? AstUtils.getContainerOfType(recoveryNode.$container, predicate) : undefined;
        return recovered && this.isInsideNodeBody(context, recovered) ? recovered : undefined;
    }

    protected isClassifierCompletionScope(node: AstNode): node is ClassifierCompletionScope {
        return ast.isClass(node) || ast.isException(node) || ast.isInterface(node) || ast.isModel(node) || ast.isService(node);
    }

    protected override isInsideNodeBody(context: CompletionContext, node: AstNode): boolean {
        if (!node.$cstNode) {
            return true;
        }
        const text = context.textDocument.getText();
        const openBrace = this.findNodeBodyOpenBrace(text, node.$cstNode.offset);
        if (openBrace < 0) {
            return true;
        }
        const closeBrace = this.findMatchingClosingBrace(text, openBrace);
        return closeBrace < 0 || context.offset <= closeBrace;
    }

    protected prioritizeValueCompletions(
        document: LangiumDocument,
        params: CompletionParams,
        items: CompletionItem[],
    ): CompletionItem[] {
        const context = this.createFallbackStandaloneContext(document, params);
        if (!this.isAfterEquals(context)) {
            return items;
        }
        const spacedItems = this.shouldInsertLeadingSpaceForValueCompletion(context)
            ? items.map(item => this.withLeadingSpaceInsert(item))
            : items;

        const type = this.getValueCompletionTargetType(context);
        if (!type) {
            return spacedItems;
        }
        const directValueLabels = this.getCompletionItemLabels(this.getXsmpcatValueCompletions(type));
        const constantValueLabels = this.getConstantValueCompletionLabels(type, context);
        const filteredItems = this.filterValueCompletionItems(
            spacedItems,
            new Set([...directValueLabels, ...constantValueLabels]),
            this.isNullptrCompatibleType(type),
        );
        if (filteredItems.length === 0) {
            return spacedItems;
        }
        const prioritizedItems = directValueLabels
            .map(label => filteredItems.find(item => item.label === label))
            .filter((item): item is CompletionItem => item !== undefined);
        if (prioritizedItems.length > 0) {
            return this.prioritizeCompletionItems(filteredItems, prioritizedItems, 0);
        }

        return filteredItems;
    }

    protected prioritizeCompletionItems(
        items: CompletionItem[],
        prioritizedItems: CompletionItem[],
        preselectedIndex: number,
    ): CompletionItem[] {
        const prioritizedSet = new Set(prioritizedItems);
        const ordered = [...prioritizedItems, ...items.filter(item => !prioritizedSet.has(item))];
        for (const item of ordered) {
            delete item.preselect;
        }
        const preselectedItem = prioritizedItems.at(preselectedIndex);
        if (preselectedItem) {
            preselectedItem.preselect = true;
        }
        return ordered;
    }

    protected shouldInsertLeadingSpaceForValueCompletion(context: CompletionContext): boolean {
        return context.offset > 0 && context.textDocument.getText().charAt(context.offset - 1) === '=';
    }

    protected withLeadingSpaceInsert(item: CompletionItem): CompletionItem {
        if (typeof item.insertText === 'string') {
            return item.insertText.startsWith(' ')
                ? item
                : { ...item, insertText: ` ${item.insertText}` };
        }
        return item;
    }

    protected getCompletionItemLabels<T extends { label?: string }>(items: T[]): string[] {
        return items
            .map(item => item.label?.toString())
            .filter((label): label is string => label !== undefined);
    }

    protected filterValueCompletionItems(
        items: CompletionItem[],
        allowedLabels: ReadonlySet<string>,
        allowNullptr: boolean,
    ): CompletionItem[] {
        const filteredItems = items.filter(item => {
            if (item.label === 'nullptr') {
                return allowNullptr;
            }
            return allowedLabels.has(item.label.toString());
        });
        const deduplicatedItems = new Map<string, CompletionItem>();
        for (const item of filteredItems) {
            const label = item.label.toString();
            if (!deduplicatedItems.has(label)) {
                deduplicatedItems.set(label, item);
            }
        }
        return [...deduplicatedItems.values()];
    }

    protected getValueCompletionOwner(context: CompletionContext): ValueCompletionOwner | undefined {
        const node = context.node;
        if (!node) {
            return undefined;
        }
        if (ast.isConstant(node) || ast.isField(node)) {
            return node;
        }
        return AstUtils.getContainerOfType(node, candidate => ast.isConstant(candidate) || ast.isField(candidate));
    }

    protected getValueCompletionTargetType(context: CompletionContext): ast.Type | undefined {
        return this.getValueCompletionOwner(context)?.type?.ref;
    }

    protected isNullptrCompatibleType(type: ast.Type): boolean {
        return ast.isReferenceType(type) || ast.isValueReference(type);
    }

    protected isOutsideRecoveredBlock(context: CompletionContext): boolean {
        const recoveryNode = this.getRecoveryAstNode(context);
        if (!recoveryNode.$cstNode) {
            return false;
        }
        const text = context.textDocument.getText();
        const openBrace = this.findNodeBodyOpenBrace(text, recoveryNode.$cstNode.offset);
        if (openBrace < 0) {
            return false;
        }
        const closeBrace = this.findMatchingClosingBrace(text, openBrace);
        return closeBrace >= 0 && context.offset > closeBrace;
    }

    protected addTypeDefinitionSnippets(context: CompletionContext, acceptor: CompletionAcceptor): void {
        this.addStatementSnippetSpecs(context, acceptor, this.typeDefinitionSnippetSpecs);
    }

    protected createTypeKeywordSnippet(keyword: GrammarAST.Keyword, insertText: string, detail: string, label = keyword.value) {
        return this.createKeywordSnippet(keyword, `${this.createUuidComment(keyword.value)}\n${insertText}`, detail, label);
    }

    protected createTypeSnippetItem(label: string, insertText: string, detail: string) {
        return this.createSnippetItem(label, `${this.createUuidComment(label)}\n${insertText}`, detail);
    }

    protected createUuidComment(key: string): string {
        let uuid = this.completionSnippetUuids.get(key);
        if (!uuid) {
            uuid = randomUUID();
            this.completionSnippetUuids.set(key, uuid);
        }
        return `/** @uuid ${uuid} */`;
    }

    protected addClassifierMemberSnippets(context: CompletionContext, classifier: ClassifierCompletionScope, acceptor: CompletionAcceptor): void {
        this.addStatementSnippetSpecs(
            context,
            acceptor,
            this.classifierMemberSnippetSpecs.filter(spec => spec.supports(classifier)),
        );
    }

    protected createTypedMemberSnippet(
        context: CompletionContext,
        nodeDescription: AstNodeDescription,
        detail: string,
        suffix = '',
    ) {
        if (!nodeDescription.name) {
            return undefined;
        }
        return this.createContextualReferenceReplacementItem(context, nodeDescription, `${nodeDescription.name}${suffix}`, detail);
    }

    protected createContextualReferenceReplacementItem(
        context: CompletionContext,
        nodeDescription: AstNodeDescription,
        insertText: string,
        detail: string,
    ) {
        const item = this.createReferenceCompletionItem(nodeDescription);
        return {
            ...item,
            textEdit: TextEdit.replace({
                start: context.textDocument.positionAt(context.tokenOffset),
                end: context.textDocument.positionAt(context.tokenEndOffset),
            }, insertText),
            insertTextFormat: this.isSnippetInsertText(insertText) ? InsertTextFormat.Snippet : undefined,
            detail,
        };
    }

    protected getXsmpcatValueCompletions(type: ast.Type): ValueCompletionItem[] {
        const item = (value: string): ValueCompletionItem => ({
            ...this.createValueItem(value),
            sortText: this.createSortText('0500', value),
        });

        if (ast.isEnumeration(type)) {
            return type.literal.map(literal => item(XsmpUtils.fqn(literal)));
        }

        const defaultValue = this.getXsmpcatDefaultValueForType(type);
        if (!defaultValue) {
            return [];
        }

        switch (XsmpUtils.getPTK(type)) {
            case PTK.Bool:
                return [item('false'), item('true')];
            case PTK.Float32:
                return [item('0.f'), item('$PI'), item('$E')];
            case PTK.Float64:
                return [item('0.'), item('$PI'), item('$E')];
            default:
                return [item(defaultValue)];
        }
    }

    protected getXsmpcatDefaultValueForType(type: ast.Type | undefined): string {
        if (!type) {
            return '';
        }

        if (ast.isArrayType(type)) {
            const value = Solver.getValueAs(type.size, PTK.Int64)?.integralValue(PTK.Int64)?.getValue();
            return value
                ? `{${new Array(Number(value)).fill(this.getXsmpcatDefaultValueForType(type.itemType?.ref)).join(', ')}}`
                : '{}';
        }
        if (ast.isStructure(type)) {
            return `{${this.attrHelper.getAllFields(type).map(field => {
                return `.${field.name} = ${this.getXsmpcatDefaultValueForType(field.type?.ref)}`;
            }).join(', ')}}`;
        }
        if (ast.isEnumeration(type)) {
            return type.literal.length > 0 ? XsmpUtils.fqn(type.literal[0]) : '0';
        }

        switch (XsmpUtils.getPTK(type)) {
            case PTK.Bool:
                return 'false';
            case PTK.Float32:
                return '0.0f';
            case PTK.Float64:
                return '0.0';
            case PTK.Int8:
            case PTK.Int16:
            case PTK.Int32:
                return '0';
            case PTK.Int64:
                return '0L';
            case PTK.UInt8:
            case PTK.UInt16:
            case PTK.UInt32:
                return '0U';
            case PTK.UInt64:
                return '0UL';
            case PTK.Char8:
                return String.raw`'\0'`;
            case PTK.String8:
                return '""';
            case PTK.DateTime:
                return '"1970-01-01T00:00:00Z"';
            case PTK.Duration:
                return '"PT0S"';
            default:
                return '';
        }
    }
}
