import type { AstNodeDescription, GrammarAST, ReferenceInfo } from 'langium';
import type { CompletionAcceptor, CompletionContext, NextFeature } from 'langium/lsp';
import * as ast from '../generated/ast-partial.js';
import type { XsmplnkServices } from '../xsmplnk-module.js';
import { XsmpCompletionProviderBase } from './xsmp-completion-provider-base.js';

export class XsmplnkCompletionProvider extends XsmpCompletionProviderBase {
    protected readonly snippetOnlyKeywords = new Set([
        'link',
        'event',
        'field',
        'interface',
    ]);

    constructor(services: XsmplnkServices) {
        super(services);
    }

    protected override completionForKeyword(context: CompletionContext, keyword: GrammarAST.Keyword, acceptor: CompletionAcceptor) {
        if (this.snippetOnlyKeywords.has(keyword.value)) {
            return;
        }
        return super.completionForKeyword(context, keyword, acceptor);
    }

    protected override createKeywordSnippets(context: CompletionContext, keyword: GrammarAST.Keyword, acceptor: CompletionAcceptor): void {
        if (keyword.value === 'link') {
            const assemblies = this.getCrossReferenceNames(context, ast.LinkBase, ast.LinkBase.assembly);
            const assemblySnippet = assemblies.length > 0 ? ` for ${this.createChoicePlaceholder(2, assemblies, 'Assembly')}` : '';
            acceptor(context, this.createKeywordSnippet(
                keyword,
                `link ${this.createPlaceholder(1, 'Name')}${assemblySnippet}\n$0`,
                'Link Base Definition'
            ));
        }
    }

    protected override addContextualCompletions(context: CompletionContext, _next: NextFeature, acceptor: CompletionAcceptor): void {
        this.addStandaloneCompletions(context, acceptor);
    }

    protected override addStandaloneCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        const linkBase = this.getRecoveryContainerOfType(context, ast.isLinkBase);
        const componentLinkBase = this.getRecoveryContainerOfType(context, ast.isComponentLinkBase);

        if (this.isAtStatementPrefix(context) && !linkBase && !componentLinkBase) {
            const assemblies = this.getCrossReferenceNames(context, ast.LinkBase, ast.LinkBase.assembly);
            const assemblySnippet = assemblies.length > 0 ? ` for ${this.createChoicePlaceholder(2, assemblies, 'Assembly')}` : '';
            acceptor(context, this.createSnippetItem(
                'Link Base',
                `link ${this.createPlaceholder(1, 'Name')}${assemblySnippet}\n$0`,
                'Link Base Definition'
            ));
        } else if (this.isAtStatementPrefix(context) && componentLinkBase) {
            acceptor(context, this.createSnippetItem(
                'Component Link Base',
                `${this.createPlaceholder(1, 'path')}\n{\n\t$0\n}`,
                'Nested Component Link Base'
            ));
            acceptor(context, this.createSnippetItem('Event Link', 'event link ${1:owner} -> ${2:client}', 'Event Link'));
            acceptor(context, this.createSnippetItem('Field Link', 'field link ${1:owner} -> ${2:client}', 'Field Link'));
            acceptor(context, this.createSnippetItem('Interface Link', 'interface link ${1:sourcePath} -> ${2:client}${3::${4:backReference}}', 'Interface Link'));
        } else if (this.isAtStatementPrefix(context) && linkBase) {
            acceptor(context, this.createSnippetItem(
                'Root Component Link Base',
                '/\n{\n\t$0\n}',
                'Root Component Link Base'
            ));
        }

        this.addInterfaceReferenceCompletions(context, acceptor);
        this.addComponentLinkBaseCompletions(context, acceptor);
    }

    protected override createEnrichedReferenceCompletionItem(
        refInfo: ReferenceInfo,
        _context: CompletionContext,
        nodeDescription: AstNodeDescription,
    ) {
        if (ast.isLocalNamedReference(refInfo.container) && ast.isReference(nodeDescription.node)) {
            return this.createReferenceLikeItem(
                nodeDescription,
                nodeDescription.name,
                `Reference of ${nodeDescription.node.$container.name}.`
            );
        }
        return undefined;
    }

    protected addComponentLinkBaseCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        if (!this.isAtStatementPrefix(context)) {
            return;
        }
        const componentLinkBase = this.getRecoveryContainerOfType(context, ast.isComponentLinkBase);
        const component = componentLinkBase
            ? this.l2PathResolver.getEffectiveComponentLinkBaseComponent(componentLinkBase)
            : undefined;
        if (!component) {
            return;
        }

        for (const child of this.getDirectChildComponentContexts(component)) {
            acceptor(context, this.createContextualValueItem(
                context,
                child.path,
                `${child.path}\n{\n\t$0\n}`,
                'Nested Component Link Base'
            ));
        }

        this.addContextualEventLinkCompletions(context, acceptor, component);
        this.addContextualFieldLinkCompletions(context, acceptor, component);
        this.addContextualInterfaceLinkCompletions(context, acceptor, component);
    }

    protected addInterfaceReferenceCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        const linePrefix = this.getLinePrefix(context);
        if (!linePrefix.includes('interface link')) {
            return;
        }

        const arrowIndex = linePrefix.indexOf('->');
        const colonIndex = linePrefix.lastIndexOf(':');
        if (arrowIndex >= 0 && colonIndex > arrowIndex) {
            const fallbackComponent = this.getFallbackInterfaceComponent(context, true);
            for (const candidate of this.l2PathResolver.getComponentMembersByKind(fallbackComponent, ['reference'])) {
                if (ast.isReference(candidate) && candidate.name) {
                    acceptor(context, this.createContextualValueItem(
                        context,
                        candidate.name,
                        candidate.name,
                        `Reference of ${candidate.$container.name}.`
                    ));
                }
            }
            return;
        }

        const ownerComponent = this.getFallbackInterfaceComponent(context, false);
        for (const candidate of this.l2PathResolver.getComponentMembersByKind(ownerComponent, ['reference'])) {
            if (ast.isReference(candidate) && candidate.name) {
                acceptor(context, this.createContextualValueItem(
                    context,
                    candidate.name,
                    candidate.name,
                    `Reference of ${candidate.$container.name}.`
                ));
            }
        }
    }

    protected getFallbackInterfaceComponent(context: CompletionContext, afterArrow: boolean): ast.Component | undefined {
        const componentLinkBase = this.getRecoveryContainerOfType(context, ast.isComponentLinkBase);
        const rootComponent = componentLinkBase
            ? this.l2PathResolver.getEffectiveComponentLinkBaseComponent(componentLinkBase)
            : undefined;
        if (!rootComponent) {
            return undefined;
        }
        if (!afterArrow) {
            return rootComponent;
        }

        const linePrefix = this.getLinePrefix(context);
        const arrowIndex = linePrefix.indexOf('->');
        if (arrowIndex < 0) {
            return undefined;
        }
        const afterArrowText = linePrefix.slice(arrowIndex + 2);
        const clientPath = afterArrowText.split(':', 1)[0]?.trim();
        return this.resolveRelativeComponentPath(rootComponent, clientPath);
    }

    protected resolveRelativeComponentPath(component: ast.Component | undefined, pathText: string | undefined): ast.Component | undefined {
        if (!component || !pathText) {
            return component;
        }

        let current: ast.Component | undefined = component;
        const segments = pathText.split('.');
        for (const segment of segments) {
            const trimmed = segment.trim();
            if (!trimmed || trimmed === '.') {
                continue;
            }
            const member: ast.Container | ast.Reference | undefined = this.l2PathResolver
                .getComponentPathMembers(current)
                .find(candidate => candidate.name === trimmed);
            current = member ? this.typedPathResolver.getChildComponentForPathMember(member) : undefined;
            if (!current) {
                return undefined;
            }
        }
        return current;
    }
}
