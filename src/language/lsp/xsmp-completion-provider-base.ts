import type { AstNodeDescription, LangiumDocument, MaybePromise, ReferenceInfo } from 'langium';
import { AstUtils, GrammarAST, type AstNode } from 'langium';
import type { CompletionAcceptor, CompletionContext, CompletionValueItem, NextFeature } from 'langium/lsp';
import { DefaultCompletionProvider } from 'langium/lsp';
import type { MarkupContent } from 'vscode-languageserver';
import {
    CompletionItemKind,
    CompletionItemTag,
    CompletionList,
    InsertTextFormat,
    TextEdit,
    type CompletionItem,
    type CompletionParams,
    type CancellationToken,
} from 'vscode-languageserver';
import * as ast from '../generated/ast-partial.js';
import type * as partialAst from '../generated/ast-partial.js';
import type { XsmpcfgPathResolver } from '../references/xsmpcfg-path-resolver.js';
import type { Xsmpl2PathResolver } from '../references/xsmpl2-path-resolver.js';
import type { XsmpPathService } from '../references/xsmp-path-service.js';
import type { XsmpTypedPathResolver } from '../references/xsmp-typed-path-resolver.js';
import type { XsmpTypeProvider } from '../references/type-provider.js';
import { PTK } from '../utils/primitive-type-kind.js';
import type { AttributeHelper } from '../utils/attribute-helper.js';
import type { DocumentationHelper } from '../utils/documentation-helper.js';
import * as XsmpUtils from '../utils/xsmp-utils.js';
import type { XsmpServices } from '../xsmp-module.js';

type CompletionValueMode = 'cfg' | 'l2';
type RecoverableXsmpNode = AstNode & partialAst.XsmpAstType;
type RelativeComponentContext = {
    path: string;
    component: ast.Component;
};

export class XsmpCompletionProviderBase extends DefaultCompletionProvider {
    protected readonly typeProvider: XsmpTypeProvider;
    protected readonly docHelper: DocumentationHelper;
    protected readonly attrHelper: AttributeHelper;
    protected readonly pathService: XsmpPathService;
    protected readonly typedPathResolver: XsmpTypedPathResolver;
    protected readonly cfgPathResolver: XsmpcfgPathResolver;
    protected readonly l2PathResolver: Xsmpl2PathResolver;

    constructor(services: XsmpServices) {
        super(services);
        this.typeProvider = services.shared.TypeProvider;
        this.docHelper = services.shared.DocumentationHelper;
        this.attrHelper = services.shared.AttributeHelper;
        this.pathService = services.shared.PathService;
        this.typedPathResolver = services.shared.TypedPathResolver;
        this.cfgPathResolver = services.shared.CfgPathResolver;
        this.l2PathResolver = services.shared.L2PathResolver;
    }

    override async getCompletion(document: LangiumDocument, params: CompletionParams, cancelToken?: CancellationToken) {
        const completion = await super.getCompletion(document, params, cancelToken);
        const items = completion?.items ?? [];
        const context = this.createStandaloneContext(document, params);
        const acceptor: CompletionAcceptor = (completionContext, value) => {
            const completionItem = this.fillCompletionItem(completionContext, value);
            if (completionItem) {
                items.push(completionItem);
            }
        };
        this.addStandaloneCompletions(context, acceptor);
        return CompletionList.create(this.deduplicateItems(items), true);
    }

    protected createStandaloneContext(document: LangiumDocument, params: CompletionParams): CompletionContext {
        const offset = document.textDocument.offsetAt(params.position);
        const context = [...this.buildContexts(document, params.position)].at(-1);
        if (context) {
            return context;
        }
        return {
            document,
            textDocument: document.textDocument,
            features: [],
            offset,
            position: params.position,
            tokenOffset: offset,
            tokenEndOffset: offset,
            node: document.parseResult.value,
        };
    }

    protected override deduplicateItems(items: CompletionItem[]): CompletionItem[] {
        const result = new Map<string, CompletionItem>();
        for (const item of items) {
            const key = [
                item.label,
                item.detail ?? '',
                item.insertText ?? item.textEditText ?? item.textEdit?.newText ?? '',
            ].join('_');
            if (!result.has(key)) {
                result.set(key, item);
            }
        }
        return [...result.values()];
    }

    protected override createReferenceCompletionItem(nodeDescription: AstNodeDescription): CompletionValueItem {
        const kind = this.nodeKindProvider.getCompletionItemKind(nodeDescription);
        const documentation = this.getReferenceDocumentation(nodeDescription);
        return {
            nodeDescription,
            kind,
            documentation,
            tags: this.getCompletionTags(nodeDescription),
            detail: nodeDescription.type,
            sortText: this.createSortText('1000', nodeDescription.name),
        };
    }

    protected getCompletionTags(nodeDescription: AstNodeDescription): CompletionItemTag[] | undefined {
        if (ast.isNamedElement(nodeDescription.node) && this.docHelper.IsDeprecated(nodeDescription.node)) {
            return [CompletionItemTag.Deprecated];
        }
        return undefined;
    }

    protected override completionFor(context: CompletionContext, next: NextFeature, acceptor: CompletionAcceptor): MaybePromise<void> {
        super.completionFor(context, next, acceptor);
        this.addContextualCompletions(context, next, acceptor);
    }

    protected override continueCompletion(_items: CompletionItem[]): boolean {
        return true;
    }

    protected override completionForCrossReference(context: CompletionContext, next: NextFeature<GrammarAST.CrossReference>, acceptor: CompletionAcceptor): MaybePromise<void> {
        const assignment = AstUtils.getContainerOfType(next.feature, GrammarAST.isAssignment);
        let { node } = context;
        if (assignment && node) {
            if (next.type) {
                node = {
                    $type: next.type,
                    $container: node,
                    $containerProperty: next.property,
                };
                AstUtils.assignMandatoryProperties(this.astReflection, node);
            }
            const refInfo: ReferenceInfo = {
                reference: {
                    $refText: '',
                    ref: undefined,
                },
                container: node,
                property: assignment.feature,
            };
            try {
                for (const candidate of this.getReferenceCandidates(refInfo, context)) {
                    acceptor(context, this.createReferenceCompletionItemFor(refInfo, context, candidate));
                }
            } catch (err) {
                console.error(err);
            }
        }
    }

    protected createReferenceCompletionItemFor(refInfo: ReferenceInfo, context: CompletionContext, nodeDescription: AstNodeDescription): CompletionValueItem {
        const item = this.createEnrichedReferenceCompletionItem(refInfo, context, nodeDescription);
        return item ?? this.createReferenceCompletionItem(nodeDescription);
    }

    protected createEnrichedReferenceCompletionItem(
        _refInfo: ReferenceInfo,
        _context: CompletionContext,
        _nodeDescription: AstNodeDescription,
    ): CompletionValueItem | undefined {
        return undefined;
    }

    protected override completionForKeyword(context: CompletionContext, keyword: GrammarAST.Keyword, acceptor: CompletionAcceptor): MaybePromise<void> {
        if (!this.filterKeyword(context, keyword)) {
            return;
        }
        acceptor(context, {
            label: keyword.value,
            documentation: this.getKeywordDocumentation(keyword),
            kind: this.getKeywordCompletionItemKind(keyword),
            detail: 'Keyword',
            sortText: this.createSortText('4000', keyword.value),
        });
        this.createKeywordSnippets(context, keyword, acceptor);
    }

    protected getKeywordDocumentation(keyword: GrammarAST.Keyword): MarkupContent | string | undefined {
        const documentationText = this.documentationProvider.getDocumentation(keyword);
        if (!documentationText) {
            return undefined;
        }
        return { kind: 'markdown', value: documentationText };
    }

    protected createKeywordSnippets(_context: CompletionContext, _keyword: GrammarAST.Keyword, _acceptor: CompletionAcceptor): void {
        // implemented by subclasses
    }

    protected addContextualCompletions(_context: CompletionContext, _next: NextFeature, _acceptor: CompletionAcceptor): void {
        // implemented by subclasses
    }

    protected addStandaloneCompletions(_context: CompletionContext, _acceptor: CompletionAcceptor): void {
        // implemented by subclasses
    }

    protected createSnippetItem(label: string, insertText: string, detail: string, documentation?: MarkupContent | string, sortText = '3000'): CompletionValueItem {
        return {
            label,
            insertText,
            insertTextFormat: InsertTextFormat.Snippet,
            documentation,
            kind: CompletionItemKind.Snippet,
            detail,
            sortText: this.createSortText(sortText, label),
        };
    }

    protected createKeywordSnippet(keyword: GrammarAST.Keyword, insertText: string, detail: string, label = keyword.value): CompletionValueItem {
        return this.createSnippetItem(label, insertText, detail, this.getKeywordDocumentation(keyword), '3000');
    }

    protected createValueItem(label: string, insertText = label, detail = 'Value', documentation?: MarkupContent | string): CompletionValueItem {
        return {
            label,
            insertText,
            documentation,
            kind: CompletionItemKind.Value,
            detail,
            sortText: this.createSortText('2000', label),
            insertTextFormat: this.isSnippetInsertText(insertText) ? InsertTextFormat.Snippet : undefined,
        };
    }

    protected createContextualValueItem(context: CompletionContext, label: string, insertText = label, detail = 'Value', documentation?: MarkupContent | string): CompletionValueItem {
        return {
            label,
            textEdit: TextEdit.replace(this.getReplacementRange(context), insertText),
            documentation,
            kind: CompletionItemKind.Value,
            detail,
            sortText: this.createSortText('2000', label),
            insertTextFormat: this.isSnippetInsertText(insertText) ? InsertTextFormat.Snippet : undefined,
        };
    }

    protected createReferenceLikeItem(
        nodeDescription: AstNodeDescription,
        insertText: string,
        detail: string,
        kind?: CompletionItemKind,
    ): CompletionValueItem {
        return {
            nodeDescription,
            insertText,
            insertTextFormat: this.isSnippetInsertText(insertText) ? InsertTextFormat.Snippet : undefined,
            kind: kind ?? this.nodeKindProvider.getCompletionItemKind(nodeDescription),
            documentation: this.getReferenceDocumentation(nodeDescription),
            tags: this.getCompletionTags(nodeDescription),
            detail,
            sortText: this.createSortText('1000', nodeDescription.name),
        };
    }

    protected createSortText(prefix: string, value: string): string {
        return `${prefix}_${value}`;
    }

    protected isSnippetInsertText(text: string | undefined): boolean {
        return Boolean(text && /\$(?:\d|\{)/.test(text));
    }

    protected escapeSnippetText(text: string): string {
        return text
            .replaceAll('\\', '\\\\')
            .replaceAll('$', '\\$')
            .replaceAll('}', '\\}');
    }

    protected escapeSnippetChoice(text: string): string {
        return text
            .replaceAll('\\', '\\\\')
            .replaceAll(',', '\\,')
            .replaceAll('|', '\\|');
    }

    protected createPlaceholder(index: number, defaultValue: string): string {
        return `\${${index}:${this.escapeSnippetText(defaultValue)}}`;
    }

    protected createChoicePlaceholder(index: number, choices: readonly string[], fallback: string): string {
        const uniqueChoices = [...new Set(choices.filter(choice => choice.length > 0))];
        if (uniqueChoices.length === 0) {
            return this.createPlaceholder(index, fallback);
        }
        return `\${${index}|${uniqueChoices.map(choice => this.escapeSnippetChoice(choice)).join(',')}|}`;
    }

    protected getCrossReferenceNames(context: CompletionContext, type: string | { readonly $type: string }, property: string): string[] {
        const container = this.getRecoveryAstNode(context);
        const refInfo: ReferenceInfo = {
            reference: { $refText: '', ref: undefined },
            container: {
                $container: container,
                $type: typeof type === 'string' ? type : type.$type,
            },
            property,
        };
        return [...new Set(this.getReferenceCandidates(refInfo, context).map(candidate => candidate.name))];
    }

    protected getLinePrefix(context: CompletionContext): string {
        return context.textDocument.getText({
            start: { line: context.position.line, character: 0 },
            end: context.position,
        });
    }

    protected getRecoveryNode(context: CompletionContext): partialAst.XsmpAstType {
        const node = this.getRecoveryAstNode(context);
        if (this.isRecoveryXsmpNode(node)) {
            return node;
        }
        const root = context.document.parseResult.value;
        if (this.isRecoveryXsmpNode(root)) {
            return root;
        }
        throw new Error('Unexpected non-XSMP AST node in completion context.');
    }

    protected getRecoveryAstNode(context: CompletionContext): AstNode {
        return context.node ?? context.document.parseResult.value;
    }

    protected isRecoveryXsmpNode(node: AstNode): node is RecoverableXsmpNode {
        return this.astReflection.isInstance(node, node.$type);
    }

    protected getRecoveryContainerOfType<T extends AstNode>(context: CompletionContext, predicate: (node: AstNode) => node is T): T | undefined {
        return this.findContainingNode(context, predicate) ?? AstUtils.getContainerOfType(this.getRecoveryAstNode(context), predicate);
    }

    protected findContainingNode<T extends AstNode>(context: CompletionContext, predicate: (node: AstNode) => node is T): T | undefined {
        const root = context.document.parseResult.value;
        let bestNode: T | undefined;
        let bestSpan = Number.POSITIVE_INFINITY;
        for (const node of AstUtils.streamAst(root).concat([root])) {
            if (!predicate(node) || !node.$cstNode) {
                continue;
            }
            if (node.$cstNode.offset <= context.offset && context.offset <= node.$cstNode.end) {
                const span = node.$cstNode.end - node.$cstNode.offset;
                if (span < bestSpan) {
                    bestSpan = span;
                    bestNode = node;
                }
            }
        }
        return bestNode;
    }

    protected isAtStatementStart(context: CompletionContext): boolean {
        return this.getLinePrefix(context).trim().length === 0;
    }

    protected isAfterEquals(context: CompletionContext): boolean {
        const prefix = this.getLinePrefix(context);
        const equalsIndex = prefix.lastIndexOf('=');
        return equalsIndex >= 0 && prefix.slice(equalsIndex + 1).trim().length === 0;
    }

    protected getReplacementRange(context: CompletionContext): { start: { line: number; character: number }; end: { line: number; character: number } } {
        const lineStartOffset = context.textDocument.offsetAt({ line: context.position.line, character: 0 });
        const content = context.textDocument.getText();
        let start = context.offset;
        while (start > lineStartOffset && /[_a-zA-Z0-9./{}]/.test(content[start - 1])) {
            start--;
        }
        return {
            start: context.textDocument.positionAt(start),
            end: context.position,
        };
    }

    protected getDirectChildComponentContexts(component: ast.Component | undefined): RelativeComponentContext[] {
        if (!component) {
            return [];
        }
        return this.typedPathResolver.getComponentPathMembers(component)
            .flatMap(member => {
                if (!member.name) {
                    return [];
                }
                const childComponent = this.typedPathResolver.getChildComponentForPathMember(member);
                return childComponent ? [{ path: member.name, component: childComponent }] : [];
            });
    }

    protected getRelativeComponentContexts(component: ast.Component | undefined): RelativeComponentContext[] {
        if (!component) {
            return [];
        }
        return [{ path: '.', component }, ...this.getDirectChildComponentContexts(component)];
    }

    protected qualifyRelativeMemberPath(basePath: string, memberName: string): string {
        return basePath === '.' ? memberName : `${basePath}.${memberName}`;
    }

    protected addContextualFieldLinkCompletions(
        context: CompletionContext,
        acceptor: CompletionAcceptor,
        component: ast.Component | undefined,
    ): void {
        for (const ownerContext of this.getRelativeComponentContexts(component)) {
            const outputs = this.l2PathResolver.getComponentMembersByKind(ownerContext.component, ['outputField']);
            for (const output of outputs) {
                if (!ast.isField(output) || !output.name) {
                    continue;
                }
                const ownerPath = this.qualifyRelativeMemberPath(ownerContext.path, output.name);
                for (const clientContext of this.getRelativeComponentContexts(component)) {
                    const inputs = this.l2PathResolver.getComponentMembersByKind(clientContext.component, ['inputField']);
                    for (const input of inputs) {
                        if (!ast.isField(input) || !input.name) {
                            continue;
                        }
                        const clientPath = this.qualifyRelativeMemberPath(clientContext.path, input.name);
                        const text = `field link ${ownerPath} -> ${clientPath}`;
                        acceptor(context, this.createContextualValueItem(
                            context,
                            text,
                            text,
                            'Field Link'
                        ));
                    }
                }
            }
        }
    }

    protected addContextualEventLinkCompletions(
        context: CompletionContext,
        acceptor: CompletionAcceptor,
        component: ast.Component | undefined,
    ): void {
        for (const ownerContext of this.getRelativeComponentContexts(component)) {
            const sources = this.l2PathResolver.getComponentMembersByKind(ownerContext.component, ['eventSource']);
            for (const source of sources) {
                if (!ast.isEventSource(source) || !source.name) {
                    continue;
                }
                const ownerPath = this.qualifyRelativeMemberPath(ownerContext.path, source.name);
                for (const clientContext of this.getRelativeComponentContexts(component)) {
                    const sinks = this.l2PathResolver.getComponentMembersByKind(clientContext.component, ['eventSink']);
                    for (const sink of sinks) {
                        if (!ast.isEventSink(sink) || !sink.name) {
                            continue;
                        }
                        const clientPath = this.qualifyRelativeMemberPath(clientContext.path, sink.name);
                        const text = `event link ${ownerPath} -> ${clientPath}`;
                        acceptor(context, this.createContextualValueItem(
                            context,
                            text,
                            text,
                            'Event Link'
                        ));
                    }
                }
            }
        }
    }

    protected addContextualInterfaceLinkCompletions(
        context: CompletionContext,
        acceptor: CompletionAcceptor,
        component: ast.Component | undefined,
    ): void {
        for (const ownerContext of this.getRelativeComponentContexts(component)) {
            const references = this.l2PathResolver.getComponentMembersByKind(ownerContext.component, ['reference']);
            for (const reference of references) {
                if (!ast.isReference(reference) || !reference.name) {
                    continue;
                }
                const expectedType = ast.isReferenceType(reference.interface?.ref) ? reference.interface.ref : undefined;
                for (const clientContext of this.getRelativeComponentContexts(component)) {
                    if (ownerContext.path === clientContext.path) {
                        continue;
                    }
                    if (expectedType && !XsmpUtils.isBaseOfReferenceType(expectedType, clientContext.component)) {
                        continue;
                    }
                    const backReference = this.l2PathResolver.getComponentMembersByKind(clientContext.component, ['reference'])
                        .find(candidate =>
                            ast.isReference(candidate)
                            && ast.isReferenceType(candidate.interface?.ref)
                            && XsmpUtils.isBaseOfReferenceType(candidate.interface.ref, ownerContext.component)
                        );
                    const backReferenceText = ast.isReference(backReference) && backReference.name ? `:${backReference.name}` : '';
                    const sourcePath = this.qualifyRelativeMemberPath(ownerContext.path, reference.name);
                    const text = `interface link ${sourcePath} -> ${clientContext.path}${backReferenceText}`;
                    acceptor(context, this.createContextualValueItem(
                        context,
                        text,
                        text,
                        'Interface Link'
                    ));
                }
            }
        }
    }

    protected getSimpleValueCompletions(type: ast.Type | undefined, mode: CompletionValueMode, allowComposite = false): CompletionValueItem[] {
        if (!type) {
            return [];
        }
        const items: CompletionValueItem[] = [];
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
                items.push(this.createValueItem("'A'", "'A'", `Character value for ${XsmpUtils.fqn(type)}.`));
                break;
            case PTK.String8:
                items.push(this.createValueItem('""', '""', `String value for ${XsmpUtils.fqn(type)}.`));
                break;
            case PTK.Duration:
                items.push(this.createValueItem('"PT0S"d', '"PT0S"d', `Duration value for ${XsmpUtils.fqn(type)}.`));
                break;
            case PTK.DateTime:
                items.push(this.createValueItem('"1970-01-01T00:00:00Z"dt', '"1970-01-01T00:00:00Z"dt', `DateTime value for ${XsmpUtils.fqn(type)}.`));
                break;
        }

        if (allowComposite) {
            if (ast.isArrayType(type)) {
                items.push(this.createValueItem('[]', '[]', `Array value for ${XsmpUtils.fqn(type)}.`));
            } else if (ast.isStructure(type)) {
                const structureValue = this.getDefaultValueForType(type, mode, true);
                items.push(this.createValueItem('{...}', structureValue, `Structure value for ${XsmpUtils.fqn(type)}.`));
            }
        }

        const defaultValue = this.getDefaultValueForType(type, mode, allowComposite);
        if (defaultValue) {
            items.push(this.createValueItem('Default Value', defaultValue, `Default value for ${XsmpUtils.fqn(type)}.`));
        }
        return items;
    }

    protected getDefaultValueForType(type: ast.Type | undefined, mode: CompletionValueMode, allowComposite = true, depth = 0): string {
        if (!type) {
            return '';
        }
        if (allowComposite && depth < 2) {
            if (ast.isArrayType(type)) {
                return '[]';
            }
            if (ast.isStructure(type)) {
                const fields = this.attrHelper.getAllFields(type).toArray();
                const elements = fields.flatMap(field => {
                    const currentField = field as ast.Field;
                    if (!currentField.name) {
                        return [];
                    }
                    const fieldDefault = this.getDefaultValueForType(currentField.type?.ref, mode, true, depth + 1) || '""';
                    return [`${currentField.name} = ${fieldDefault}`];
                });
                return `{ ${elements.join(', ')} }`;
            }
        }

        if (ast.isEnumeration(type)) {
            return type.literal.length > 0 ? XsmpUtils.fqn(type.literal[0]) : '';
        }

        switch (XsmpUtils.getPTK(type)) {
            case PTK.Bool:
                return 'false';
            case PTK.Float32:
                return mode === 'cfg' ? '0.0' : '0.0f32';
            case PTK.Float64:
                return mode === 'cfg' ? '0.0' : '0.0f64';
            case PTK.Int8:
                return mode === 'cfg' ? '0' : '0i8';
            case PTK.Int16:
                return mode === 'cfg' ? '0' : '0i16';
            case PTK.Int32:
                return mode === 'cfg' ? '0' : '0i32';
            case PTK.Int64:
                return mode === 'cfg' ? '0' : '0i64';
            case PTK.UInt8:
                return mode === 'cfg' ? '0' : '0u8';
            case PTK.UInt16:
                return mode === 'cfg' ? '0' : '0u16';
            case PTK.UInt32:
                return mode === 'cfg' ? '0' : '0u32';
            case PTK.UInt64:
                return mode === 'cfg' ? '0' : '0u64';
            case PTK.Char8:
                return "'A'";
            case PTK.String8:
                return '""';
            case PTK.DateTime:
                return '"1970-01-01T00:00:00Z"dt';
            case PTK.Duration:
                return '"PT0S"d';
            default:
                return '';
        }
    }
}
