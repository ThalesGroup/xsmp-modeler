import type { AstNodeDescription, MaybePromise, ReferenceInfo, Stream } from 'langium';
import { AstUtils, GrammarAST } from 'langium';
import type { CompletionAcceptor, CompletionContext, NextFeature } from 'langium/lsp';
import { randomUUID } from 'node:crypto';
import * as ast from '../generated/ast-partial.js';
import * as Solver from '../utils/solver.js';
import { PTK } from '../utils/primitive-type-kind.js';
import { VisibilityKind } from '../utils/visibility-kind.js';
import * as XsmpUtils from '../utils/xsmp-utils.js';
import type { XsmpcatServices } from '../xsmpcat-module.js';
import { XsmpCompletionProviderBase } from './xsmp-completion-provider-base.js';

export class XsmpcatCompletionProvider extends XsmpCompletionProviderBase {
    private readonly floatRegex = /^(Smp\.)?Float(32|64)$/;
    private readonly intRegex = /^(Smp\.)?U?Int(8|16|32|64)$/;
    private readonly snippetOnlyKeywords = new Set([
        'catalogue',
        'namespace',
        'struct',
        'class',
        'exception',
        'interface',
        'model',
        'service',
        'array',
        'using',
        'integer',
        'float',
        'event',
        'string',
        'primitive',
        'native',
        'attribute',
        'enum',
        'constant',
        'field',
        'property',
        'def',
        'association',
        'container',
        'reference',
        'entrypoint',
        'eventsink',
        'eventsource',
    ]);

    constructor(services: XsmpcatServices) {
        super(services);
    }

    protected override completionForKeyword(context: CompletionContext, keyword: GrammarAST.Keyword, acceptor: CompletionAcceptor): MaybePromise<void> {
        if (this.snippetOnlyKeywords.has(keyword.value)) {
            return;
        }
        return super.completionForKeyword(context, keyword, acceptor);
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
        if (!type) {
            return false;
        }
        if (ast.isEnumeration(type)) {
            return desc.node?.$container === type;
        }
        return ast.isConstant(desc.node) && XsmpUtils.isConstantVisibleFrom(expression, desc.node);
    }

    protected getFilter(refInfo: ReferenceInfo): ((desc: AstNodeDescription) => boolean) | undefined {
        if (this.isReferenceProperty(refInfo, ast.Attribute, ast.Attribute.type)) {
            return desc => this.isValidAttributeType(desc, refInfo.container as ast.Attribute);
        }
        if (this.isReferenceProperty(refInfo, ast.Class, ast.Class.base)) {
            return desc => ast.isClass(desc.node)
                && !XsmpUtils.isBaseOfClass(refInfo.container as ast.Class, desc.node)
                && XsmpUtils.isTypeVisibleFrom(refInfo.container, desc.node);
        }
        if (this.isReferenceProperty(refInfo, ast.Interface, ast.Interface.base)) {
            return desc => ast.isInterface(desc.node)
                && !XsmpUtils.isBaseOfInterface(refInfo.container as ast.Interface, desc.node)
                && !(refInfo.container as ast.Interface).base.some(i => i.ref === desc.node)
                && XsmpUtils.isTypeVisibleFrom(refInfo.container, desc.node);
        }
        if (this.isReferenceProperty(refInfo, ast.Model, ast.Component.interface) || this.isReferenceProperty(refInfo, ast.Service, ast.Component.interface)) {
            return desc => ast.isInterface(desc.node)
                && !(refInfo.container as ast.Component).interface.some(i => i.ref === desc.node)
                && XsmpUtils.isTypeVisibleFrom(refInfo.container, desc.node);
        }
        if (this.isReferenceProperty(refInfo, ast.Reference, ast.Reference.interface)) {
            return desc => ast.isInterface(desc.node) && XsmpUtils.isTypeVisibleFrom(refInfo.container, desc.node);
        }
        if (this.isReferenceProperty(refInfo, ast.Model, ast.Component.base)) {
            return desc => ast.isModel(desc.node)
                && !XsmpUtils.isBaseOfComponent(refInfo.container as ast.Component, desc.node)
                && XsmpUtils.isTypeVisibleFrom(refInfo.container, desc.node);
        }
        if (this.isReferenceProperty(refInfo, ast.Service, ast.Component.base)) {
            return desc => ast.isService(desc.node)
                && !XsmpUtils.isBaseOfComponent(refInfo.container as ast.Component, desc.node)
                && XsmpUtils.isTypeVisibleFrom(refInfo.container, desc.node);
        }
        if (this.isReferenceProperty(refInfo, ast.ArrayType, ast.ArrayType.itemType)) {
            return desc => ast.isValueType(desc.node)
                && XsmpUtils.isTypeVisibleFrom(refInfo.container, desc.node)
                && !XsmpUtils.isRecursiveType(refInfo.container as ast.ArrayType, desc.node);
        }
        if (this.isReferenceProperty(refInfo, ast.ValueReference, ast.ValueReference.type) || this.isReferenceProperty(refInfo, ast.AttributeType, ast.AttributeType.type)) {
            return desc => ast.isValueType(desc.node) && XsmpUtils.isTypeVisibleFrom(refInfo.container, desc.node);
        }
        if (this.isReferenceProperty(refInfo, ast.Field, ast.Field.type)) {
            return desc => ast.isValueType(desc.node)
                && XsmpUtils.isTypeVisibleFrom(refInfo.container, desc.node)
                && !XsmpUtils.isRecursiveType((refInfo.container as ast.Field).$container, desc.node);
        }
        if (this.isReferenceProperty(refInfo, ast.Property, ast.Property.attachedField)) {
            return desc => ast.isField(desc.node)
                && (desc.node.$container === refInfo.container.$container || XsmpUtils.getRealVisibility(desc.node) !== VisibilityKind.private);
        }
        if (this.isReferenceProperty(refInfo, ast.Integer, ast.Integer.primitiveType)) {
            return desc => desc.type === ast.PrimitiveType.$type
                && this.intRegex.test(desc.name)
                && XsmpUtils.isTypeVisibleFrom(refInfo.container, desc.node as ast.Type);
        }
        if (this.isReferenceProperty(refInfo, ast.Float, ast.Float.primitiveType)) {
            return desc => desc.type === ast.PrimitiveType.$type
                && this.floatRegex.test(desc.name)
                && XsmpUtils.isTypeVisibleFrom(refInfo.container, desc.node as ast.Type);
        }
        if (this.isReferenceProperty(refInfo, ast.EventType, ast.EventType.eventArgs) || this.isReferenceProperty(refInfo, ast.Constant, ast.Constant.type)) {
            return desc => ast.reflection.isSubtype(desc.type, ast.SimpleType.$type)
                && XsmpUtils.isTypeVisibleFrom(refInfo.container, desc.node as ast.Type);
        }
        if (
            this.isReferenceProperty(refInfo, ast.Parameter, ast.Parameter.type)
            || this.isReferenceProperty(refInfo, ast.ReturnParameter, ast.ReturnParameter.type)
            || this.isReferenceProperty(refInfo, ast.Association, ast.Association.type)
            || this.isReferenceProperty(refInfo, ast.Property, ast.Property.type)
        ) {
            return desc => ast.reflection.isSubtype(desc.type, ast.LanguageType.$type)
                && XsmpUtils.isTypeVisibleFrom(refInfo.container, desc.node as ast.Type);
        }
        if (this.isReferenceProperty(refInfo, ast.Container, ast.Container.type)) {
            return desc => ast.reflection.isSubtype(desc.type, ast.ReferenceType.$type)
                && XsmpUtils.isTypeVisibleFrom(refInfo.container, desc.node as ast.Type);
        }
        if (this.isReferenceProperty(refInfo, ast.Container, ast.Container.defaultComponent)) {
            return desc => ast.reflection.isSubtype(desc.type, ast.Component.$type)
                && XsmpUtils.isTypeVisibleFrom(refInfo.container, desc.node as ast.Type);
        }
        if (this.isReferenceProperty(refInfo, ast.EventSink, ast.EventSink.type) || this.isReferenceProperty(refInfo, ast.EventSource, ast.EventSource.type)) {
            return desc => ast.EventType.$type === desc.type && XsmpUtils.isTypeVisibleFrom(refInfo.container, desc.node as ast.Type);
        }
        if (this.isReferenceProperty(refInfo, ast.Operation, ast.Operation.raisedException)) {
            return desc => ast.Exception.$type === desc.type
                && !(refInfo.container as ast.Operation).raisedException.some(e => e.ref === desc.node)
                && XsmpUtils.isTypeVisibleFrom(refInfo.container, desc.node as ast.Type);
        }
        if (this.isReferenceProperty(refInfo, ast.Property, ast.Property.getRaises)) {
            return desc => ast.Exception.$type === desc.type
                && !(refInfo.container as ast.Property).getRaises.some(e => e.ref === desc.node)
                && XsmpUtils.isTypeVisibleFrom(refInfo.container, desc.node as ast.Type);
        }
        if (this.isReferenceProperty(refInfo, ast.Property, ast.Property.setRaises)) {
            return desc => ast.Exception.$type === desc.type
                && !(refInfo.container as ast.Property).setRaises.some(e => e.ref === desc.node)
                && XsmpUtils.isTypeVisibleFrom(refInfo.container, desc.node as ast.Type);
        }
        if (this.isReferenceProperty(refInfo, ast.Exception, ast.Class.base)) {
            return desc => ast.isException(desc.node)
                && !XsmpUtils.isBaseOfClass(refInfo.container as ast.Class, desc.node)
                && XsmpUtils.isTypeVisibleFrom(refInfo.container, desc.node as ast.Type);
        }
        if (this.isReferenceProperty(refInfo, ast.EntryPoint, ast.EntryPoint.input)) {
            return desc => ast.isField(desc.node)
                && XsmpUtils.isInput(desc.node)
                && (desc.node.$container === refInfo.container.$container || XsmpUtils.getRealVisibility(desc.node) !== VisibilityKind.private);
        }
        if (this.isReferenceProperty(refInfo, ast.EntryPoint, ast.EntryPoint.output)) {
            return desc => ast.isField(desc.node)
                && XsmpUtils.isOutput(desc.node)
                && (desc.node.$container === refInfo.container.$container || XsmpUtils.getRealVisibility(desc.node) !== VisibilityKind.private);
        }
        if (this.isReferenceProperty(refInfo, ast.NamedElementReference, ast.NamedElementReference.value)) {
            return desc => this.isValidNamedElementReference(desc, refInfo.container as ast.Expression);
        }
        return undefined;
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
        return {
            ...item,
            sortText: nodeDescription.name.split('.').length.toString().padStart(4, '0'),
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
            for (const item of this.getXsmpcatValueCompletions(type)) {
                acceptor(context, item);
            }
        }
        acceptor(context, this.createValueItem('nullptr', 'nullptr', 'Null pointer / null reference expression.'));
    }

    protected override createEnrichedReferenceCompletionItem(
        refInfo: ReferenceInfo,
        _context: CompletionContext,
        nodeDescription: AstNodeDescription,
    ) {
        if (this.isReferenceProperty(refInfo, ast.Field, ast.Field.type)) {
            return this.createTypedMemberSnippet(nodeDescription, 'field', 'Field Definition');
        }
        if (this.isReferenceProperty(refInfo, ast.Constant, ast.Constant.type)) {
            return this.createTypedMemberSnippet(nodeDescription, 'constant', 'Constant Definition', true);
        }
        if (this.isReferenceProperty(refInfo, ast.Property, ast.Property.type)) {
            return this.createTypedMemberSnippet(nodeDescription, 'property', 'Property Definition');
        }
        if (this.isReferenceProperty(refInfo, ast.Association, ast.Association.type)) {
            return this.createTypedMemberSnippet(nodeDescription, 'association', 'Association Definition');
        }
        if (this.isReferenceProperty(refInfo, ast.Container, ast.Container.type)) {
            return this.createTypedMemberSnippet(nodeDescription, 'container', 'Container Definition', false, '[*]');
        }
        if (this.isReferenceProperty(refInfo, ast.Reference, ast.Reference.interface)) {
            return this.createTypedMemberSnippet(nodeDescription, 'reference', 'Reference Definition', false, '[*]');
        }
        if (this.isReferenceProperty(refInfo, ast.EventSink, ast.EventSink.type)) {
            return this.createTypedMemberSnippet(nodeDescription, 'eventsink', 'Event Sink Definition');
        }
        if (this.isReferenceProperty(refInfo, ast.EventSource, ast.EventSource.type)) {
            return this.createTypedMemberSnippet(nodeDescription, 'eventsource', 'Event Source Definition');
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
        switch (keyword.value) {
            case 'catalogue':
                acceptor(context, this.createKeywordSnippet(keyword, 'catalogue ${1:foundation_catalogue}\n$0', 'Catalogue Definition'));
                break;
            case 'namespace':
                acceptor(context, this.createKeywordSnippet(keyword, 'namespace ${1:demo}\n{\n\t$0\n}', 'Namespace Definition'));
                break;
            case 'struct':
                acceptor(context, this.createTypeKeywordSnippet(keyword, 'struct ${1:Name}\n{\n\t$0\n}', 'Structure Definition'));
                break;
            case 'class':
                acceptor(context, this.createTypeKeywordSnippet(keyword, 'class ${1:Name}\n{\n\t$0\n}', 'Class Definition'));
                break;
            case 'exception':
                acceptor(context, this.createTypeKeywordSnippet(keyword, 'exception ${1:Name}\n{\n\t$0\n}', 'Exception Definition'));
                break;
            case 'interface':
                acceptor(context, this.createTypeKeywordSnippet(keyword, 'interface ${1:Name}\n{\n\t$0\n}', 'Interface Definition'));
                break;
            case 'model':
                acceptor(context, this.createTypeKeywordSnippet(keyword, 'model ${1:Name}\n{\n\t$0\n}', 'Model Definition'));
                break;
            case 'service':
                acceptor(context, this.createTypeKeywordSnippet(keyword, 'service ${1:Name}\n{\n\t$0\n}', 'Service Definition'));
                break;
            case 'array':
                acceptor(context, this.createTypeKeywordSnippet(
                    keyword,
                    `array ${this.createPlaceholder(1, 'Name')} = ${this.createChoicePlaceholder(2, this.getCrossReferenceNames(context, ast.ArrayType, ast.ArrayType.itemType), 'Smp.Float64')}[${this.createPlaceholder(3, '1')}]`,
                    'Array Definition'
                ));
                break;
            case 'using':
                acceptor(context, this.createTypeKeywordSnippet(
                    keyword,
                    `using ${this.createPlaceholder(1, 'Name')} = ${this.createChoicePlaceholder(2, this.getCrossReferenceNames(context, ast.ValueReference, ast.ValueReference.type), 'Smp.Float64')}*`,
                    'Value Reference Definition'
                ));
                break;
            case 'integer':
                acceptor(context, this.createTypeKeywordSnippet(keyword, 'integer ${1:Name} extends ${2:Smp.Int32}', 'Integer Definition'));
                break;
            case 'float':
                acceptor(context, this.createTypeKeywordSnippet(keyword, 'float ${1:Name} extends ${2:Smp.Float64}', 'Float Definition'));
                break;
            case 'event':
                acceptor(context, this.createTypeKeywordSnippet(keyword, 'event ${1:Name}', 'Event Type Definition'));
                break;
            case 'string':
                acceptor(context, this.createTypeKeywordSnippet(keyword, 'string ${1:Name}[${2:32}]', 'String Definition'));
                break;
            case 'primitive':
                acceptor(context, this.createTypeKeywordSnippet(keyword, 'primitive ${1:Name}', 'Primitive Type Definition'));
                break;
            case 'native':
                acceptor(context, this.createTypeKeywordSnippet(keyword, 'native ${1:Name}', 'Native Type Definition'));
                break;
            case 'attribute':
                acceptor(context, this.createTypeKeywordSnippet(
                    keyword,
                    `attribute ${this.createChoicePlaceholder(1, this.getCrossReferenceNames(context, ast.AttributeType, ast.AttributeType.type), 'Smp.Bool')} ${this.createPlaceholder(2, 'Name')} = ${this.createPlaceholder(3, 'false')}`,
                    'Attribute Type Definition'
                ));
                break;
            case 'enum':
                acceptor(context, this.createTypeKeywordSnippet(keyword, 'enum ${1:Name}\n{\n\t${2:Literal} = ${3:0}\n}', 'Enumeration Definition'));
                break;
            case 'constant':
                acceptor(context, this.createKeywordSnippet(
                    keyword,
                    `constant ${this.createChoicePlaceholder(1, this.getCrossReferenceNames(context, ast.Constant, ast.Constant.type), 'Smp.Int32')} ${this.createPlaceholder(2, 'name')} = ${this.createPlaceholder(3, '0')}`,
                    'Constant Definition'
                ));
                break;
            case 'field':
                acceptor(context, this.createKeywordSnippet(
                    keyword,
                    `field ${this.createChoicePlaceholder(1, this.getCrossReferenceNames(context, ast.Field, ast.Field.type), 'Smp.Int32')} ${this.createPlaceholder(2, 'name')}`,
                    'Field Definition'
                ));
                break;
            case 'property':
                acceptor(context, this.createKeywordSnippet(
                    keyword,
                    `property ${this.createChoicePlaceholder(1, this.getCrossReferenceNames(context, ast.Property, ast.Property.type), 'Smp.Int32')} ${this.createPlaceholder(2, 'name')}`,
                    'Property Definition'
                ));
                break;
            case 'def':
                acceptor(context, this.createKeywordSnippet(keyword, 'def void ${1:name}($0)', 'Operation Definition'));
                break;
            case 'association':
                acceptor(context, this.createKeywordSnippet(
                    keyword,
                    `association ${this.createChoicePlaceholder(1, this.getCrossReferenceNames(context, ast.Association, ast.Association.type), 'demo.Type')} ${this.createPlaceholder(2, 'name')}`,
                    'Association Definition'
                ));
                break;
            case 'container':
                acceptor(context, this.createKeywordSnippet(
                    keyword,
                    `container ${this.createChoicePlaceholder(1, this.getCrossReferenceNames(context, ast.Container, ast.Container.type), 'demo.Component')}[*] ${this.createPlaceholder(2, 'name')}`,
                    'Container Definition'
                ));
                break;
            case 'reference':
                acceptor(context, this.createKeywordSnippet(
                    keyword,
                    `reference ${this.createChoicePlaceholder(1, this.getCrossReferenceNames(context, ast.Reference, ast.Reference.interface), 'demo.Interface')}[*] ${this.createPlaceholder(2, 'name')}`,
                    'Reference Definition'
                ));
                break;
            case 'entrypoint':
                acceptor(context, this.createKeywordSnippet(keyword, 'entrypoint ${1:name}', 'Entry Point Definition'));
                break;
            case 'eventsink':
                acceptor(context, this.createKeywordSnippet(
                    keyword,
                    `eventsink ${this.createChoicePlaceholder(1, this.getCrossReferenceNames(context, ast.EventSink, ast.EventSink.type), 'demo.Event')} ${this.createPlaceholder(2, 'name')}`,
                    'Event Sink Definition'
                ));
                break;
            case 'eventsource':
                acceptor(context, this.createKeywordSnippet(
                    keyword,
                    `eventsource ${this.createChoicePlaceholder(1, this.getCrossReferenceNames(context, ast.EventSource, ast.EventSource.type), 'demo.Event')} ${this.createPlaceholder(2, 'name')}`,
                    'Event Source Definition'
                ));
                break;
        }
    }

    protected override addContextualCompletions(context: CompletionContext, _next: NextFeature, acceptor: CompletionAcceptor): void {
        this.addStandaloneCompletions(context, acceptor);
    }

    protected override addStandaloneCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        this.addStatementSnippets(context, acceptor);
    }

    protected addStatementSnippets(context: CompletionContext, acceptor: CompletionAcceptor): void {
        if (!this.isAtStatementStart(context)) {
            return;
        }

        if (context.document.textDocument.getText().trim().length === 0) {
            acceptor(context, this.createSnippetItem('Catalogue', 'catalogue ${1:foundation_catalogue}\n$0', 'Catalogue Definition'));
            return;
        }

        const catalogue = this.getRecoveryContainerOfType(context, ast.isCatalogue);
        const enumeration = this.getRecoveryContainerOfType(context, ast.isEnumeration);
        const structure = this.getRecoveryContainerOfType(context, ast.isStructure);
        const classifier = this.getRecoveryContainerOfType(context, ast.isWithBody);

        if (!catalogue) {
            acceptor(context, this.createSnippetItem('Catalogue', 'catalogue ${1:foundation_catalogue}\n$0', 'Catalogue Definition'));
            return;
        }

        if (enumeration) {
            acceptor(context, this.createSnippetItem('Enumeration Literal', '${1:Literal} = ${2:0}', 'Enumeration Literal'));
            return;
        }

        if (structure && !ast.isClass(structure) && !ast.isException(structure) && !ast.isModel(structure) && !ast.isService(structure)) {
            acceptor(context, this.createSnippetItem(
                'Field',
                `field ${this.createChoicePlaceholder(1, this.getCrossReferenceNames(context, ast.Field, ast.Field.type), 'Smp.Int32')} ${this.createPlaceholder(2, 'name')}`,
                'Field Definition'
            ));
            acceptor(context, this.createSnippetItem(
                'Constant',
                `constant ${this.createChoicePlaceholder(1, this.getCrossReferenceNames(context, ast.Constant, ast.Constant.type), 'Smp.Int32')} ${this.createPlaceholder(2, 'name')} = ${this.createPlaceholder(3, '0')}`,
                'Constant Definition'
            ));
            return;
        }

        if (classifier) {
            this.addClassifierMemberSnippets(context, classifier, acceptor);
            return;
        }

        this.addTypeDefinitionSnippets(context, acceptor);
    }

    protected addTypeDefinitionSnippets(context: CompletionContext, acceptor: CompletionAcceptor): void {
        acceptor(context, this.createSnippetItem('Namespace', 'namespace ${1:demo}\n{\n\t$0\n}', 'Namespace Definition'));
        acceptor(context, this.createTypeSnippetItem('Structure', 'struct ${1:Name}\n{\n\t$0\n}', 'Structure Definition'));
        acceptor(context, this.createTypeSnippetItem('Class', 'class ${1:Name}\n{\n\t$0\n}', 'Class Definition'));
        acceptor(context, this.createTypeSnippetItem('Exception', 'exception ${1:Name}\n{\n\t$0\n}', 'Exception Definition'));
        acceptor(context, this.createTypeSnippetItem('Interface', 'interface ${1:Name}\n{\n\t$0\n}', 'Interface Definition'));
        acceptor(context, this.createTypeSnippetItem('Model', 'model ${1:Name}\n{\n\t$0\n}', 'Model Definition'));
        acceptor(context, this.createTypeSnippetItem('Service', 'service ${1:Name}\n{\n\t$0\n}', 'Service Definition'));
        acceptor(context, this.createTypeSnippetItem(
            'Array',
            `array ${this.createPlaceholder(1, 'Name')} = ${this.createChoicePlaceholder(2, this.getCrossReferenceNames(context, ast.ArrayType, ast.ArrayType.itemType), 'Smp.Float64')}[${this.createPlaceholder(3, '1')}]`,
            'Array Definition'
        ));
        acceptor(context, this.createTypeSnippetItem(
            'Value Reference',
            `using ${this.createPlaceholder(1, 'Name')} = ${this.createChoicePlaceholder(2, this.getCrossReferenceNames(context, ast.ValueReference, ast.ValueReference.type), 'Smp.Float64')}*`,
            'Value Reference Definition'
        ));
        acceptor(context, this.createTypeSnippetItem('Integer', 'integer ${1:Name} extends ${2:Smp.Int32}', 'Integer Definition'));
        acceptor(context, this.createTypeSnippetItem('Float', 'float ${1:Name} extends ${2:Smp.Float64}', 'Float Definition'));
        acceptor(context, this.createTypeSnippetItem('Event Type', 'event ${1:Name}', 'Event Type Definition'));
        acceptor(context, this.createTypeSnippetItem('String', 'string ${1:Name}[${2:32}]', 'String Definition'));
        acceptor(context, this.createTypeSnippetItem('Primitive', 'primitive ${1:Name}', 'Primitive Type Definition'));
        acceptor(context, this.createTypeSnippetItem('Native', 'native ${1:Name}', 'Native Type Definition'));
        acceptor(context, this.createTypeSnippetItem(
            'Attribute Type',
            `attribute ${this.createChoicePlaceholder(1, this.getCrossReferenceNames(context, ast.AttributeType, ast.AttributeType.type), 'Smp.Bool')} ${this.createPlaceholder(2, 'Name')} = ${this.createPlaceholder(3, 'false')}`,
            'Attribute Type Definition'
        ));
        acceptor(context, this.createTypeSnippetItem('Enumeration', 'enum ${1:Name}\n{\n\t${2:Literal} = ${3:0}\n}', 'Enumeration Definition'));
    }

    protected createTypeKeywordSnippet(keyword: GrammarAST.Keyword, insertText: string, detail: string) {
        return this.createKeywordSnippet(keyword, `${this.createUuidComment()}\n${insertText}`, detail);
    }

    protected createTypeSnippetItem(label: string, insertText: string, detail: string) {
        return this.createSnippetItem(label, `${this.createUuidComment()}\n${insertText}`, detail);
    }

    protected createUuidComment(): string {
        return `/** @uuid ${randomUUID()} */`;
    }

    protected addClassifierMemberSnippets(context: CompletionContext, classifier: ast.WithBody, acceptor: CompletionAcceptor): void {
        acceptor(context, this.createSnippetItem(
            'Constant',
            `constant ${this.createChoicePlaceholder(1, this.getCrossReferenceNames(context, ast.Constant, ast.Constant.type), 'Smp.Int32')} ${this.createPlaceholder(2, 'name')} = ${this.createPlaceholder(3, '0')}`,
            'Constant Definition'
        ));

        if (ast.isStructure(classifier) || ast.isClass(classifier) || ast.isException(classifier) || ast.isModel(classifier) || ast.isService(classifier)) {
            acceptor(context, this.createSnippetItem(
                'Field',
                `field ${this.createChoicePlaceholder(1, this.getCrossReferenceNames(context, ast.Field, ast.Field.type), 'Smp.Int32')} ${this.createPlaceholder(2, 'name')}`,
                'Field Definition'
            ));
        }

        if (!ast.isStructure(classifier)) {
            acceptor(context, this.createSnippetItem(
                'Property',
                `property ${this.createChoicePlaceholder(1, this.getCrossReferenceNames(context, ast.Property, ast.Property.type), 'Smp.Int32')} ${this.createPlaceholder(2, 'name')}`,
                'Property Definition'
            ));
            acceptor(context, this.createSnippetItem('Operation', 'def void ${1:name}($0)', 'Operation Definition'));
        }

        if (ast.isClass(classifier) || ast.isException(classifier) || ast.isModel(classifier) || ast.isService(classifier)) {
            acceptor(context, this.createSnippetItem(
                'Association',
                `association ${this.createChoicePlaceholder(1, this.getCrossReferenceNames(context, ast.Association, ast.Association.type), 'demo.Type')} ${this.createPlaceholder(2, 'name')}`,
                'Association Definition'
            ));
        }

        if (ast.isModel(classifier) || ast.isService(classifier)) {
            acceptor(context, this.createSnippetItem(
                'Container',
                `container ${this.createChoicePlaceholder(1, this.getCrossReferenceNames(context, ast.Container, ast.Container.type), 'demo.Component')}[*] ${this.createPlaceholder(2, 'name')}`,
                'Container Definition'
            ));
            acceptor(context, this.createSnippetItem(
                'Reference',
                `reference ${this.createChoicePlaceholder(1, this.getCrossReferenceNames(context, ast.Reference, ast.Reference.interface), 'demo.Interface')}[*] ${this.createPlaceholder(2, 'name')}`,
                'Reference Definition'
            ));
            acceptor(context, this.createSnippetItem('Entry Point', 'entrypoint ${1:name}', 'Entry Point Definition'));
            acceptor(context, this.createSnippetItem(
                'Event Sink',
                `eventsink ${this.createChoicePlaceholder(1, this.getCrossReferenceNames(context, ast.EventSink, ast.EventSink.type), 'demo.Event')} ${this.createPlaceholder(2, 'name')}`,
                'Event Sink Definition'
            ));
            acceptor(context, this.createSnippetItem(
                'Event Source',
                `eventsource ${this.createChoicePlaceholder(1, this.getCrossReferenceNames(context, ast.EventSource, ast.EventSource.type), 'demo.Event')} ${this.createPlaceholder(2, 'name')}`,
                'Event Source Definition'
            ));
        }
    }

    protected createTypedMemberSnippet(
        nodeDescription: AstNodeDescription,
        keyword: string,
        detail: string,
        withValue = false,
        suffix = '',
    ) {
        if (!nodeDescription.name) {
            return undefined;
        }
        const type = ast.isType(nodeDescription.node) ? nodeDescription.node : undefined;
        const defaultValue = withValue ? (this.getXsmpcatDefaultValueForType(type) || '0') : undefined;
        const tail = withValue ? ` = ${this.createPlaceholder(2, defaultValue ?? '0')}` : '';
        return this.createReferenceLikeItem(
            nodeDescription,
            `${keyword} ${nodeDescription.name}${suffix} ${this.createPlaceholder(1, 'name')}${tail}`,
            detail
        );
    }

    protected getXsmpcatValueCompletions(type: ast.Type): Array<ReturnType<XsmpCompletionProviderBase['createValueItem']>> {
        const items: Array<ReturnType<XsmpCompletionProviderBase['createValueItem']>> = [];
        if (ast.isEnumeration(type)) {
            for (const literal of type.literal) {
                const literalName = XsmpUtils.fqn(literal);
                items.push(this.createValueItem(literalName, literalName, `Enumeration literal of ${XsmpUtils.fqn(type)}.`));
            }
        }

        switch (XsmpUtils.getPTK(type)) {
            case PTK.Bool:
                items.push(this.createValueItem('false', 'false', `Boolean value for ${XsmpUtils.fqn(type)}.`));
                items.push(this.createValueItem('true', 'true', `Boolean value for ${XsmpUtils.fqn(type)}.`));
                break;
            case PTK.Char8:
                items.push(this.createValueItem("'\\0'", "'\\0'", `Character value for ${XsmpUtils.fqn(type)}.`));
                break;
            case PTK.String8:
                items.push(this.createValueItem('""', '""', `String value for ${XsmpUtils.fqn(type)}.`));
                break;
            case PTK.Duration:
                items.push(this.createValueItem('"PT0S"', '"PT0S"', `Duration value for ${XsmpUtils.fqn(type)}.`));
                break;
            case PTK.DateTime:
                items.push(this.createValueItem('"1970-01-01T00:00:00Z"', '"1970-01-01T00:00:00Z"', `DateTime value for ${XsmpUtils.fqn(type)}.`));
                break;
            case PTK.Float32:
            case PTK.Float64:
                items.push(this.createValueItem('$PI', '$PI', 'Built-in constant PI.'));
                items.push(this.createValueItem('$E', '$E', 'Built-in constant E.'));
                break;
        }

        const defaultValue = this.getXsmpcatDefaultValueForType(type);
        if (defaultValue) {
            items.push(this.createValueItem('Default Value', defaultValue, `Default value for ${XsmpUtils.fqn(type)}.`));
        }
        return items;
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
                const currentField = field as ast.Field;
                return `.${currentField.name} = ${this.getXsmpcatDefaultValueForType(currentField.type?.ref)}`;
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
                return "'\\0'";
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
