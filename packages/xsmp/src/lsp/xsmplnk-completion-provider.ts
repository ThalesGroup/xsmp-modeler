import type { AstNodeDescription, GrammarAST, ReferenceInfo } from 'langium';
import type { CompletionAcceptor, CompletionContext } from 'langium/lsp';
import * as ast from '../generated/ast-partial.js';
import type { AssemblyPathContext } from '../references/xsmp-instance-path-resolver.js';
import type { XsmplnkServices } from '../xsmplnk-module.js';
import { type RelativeComponentContext, XsmpCompletionProviderBase } from './xsmp-completion-provider-base.js';

export class XsmplnkCompletionProvider extends XsmpCompletionProviderBase {
    protected override readonly snippetOnlyKeywords = new Set([
        'link',
        'event',
        'field',
        'interface',
    ]);

    constructor(services: XsmplnkServices) {
        super(services);
    }

    protected override createKeywordSnippets(context: CompletionContext, keyword: GrammarAST.Keyword, acceptor: CompletionAcceptor): void {
        if (keyword.value === 'link') {
            acceptor(context, this.createKeywordSnippet(keyword, this.createLinkBaseDefinitionSnippet(context), 'Link Base Definition'));
        }
    }

    protected override addStandaloneCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        const linkBase = this.getRecoveryContainerOfType(context, ast.isLinkBase);
        const componentLinkBase = this.getRecoveryBlockContainerOfType(context, ast.isComponentLinkBase);

        if (this.isAtStatementPrefix(context) && !linkBase && !componentLinkBase) {
            acceptor(context, this.createSnippetItem('Link Base', this.createLinkBaseDefinitionSnippet(context), 'Link Base Definition'));
        } else if (this.isAtStatementPrefix(context) && componentLinkBase) {
            acceptor(context, this.createSnippetItem(
                'Component Link Base',
                `${this.createPlaceholder(1, 'path')}\n{\n\t$0\n}`,
                'Nested Component Link Base'
            ));
            this.addLinkStatementSnippets(context, acceptor);
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
        const componentLinkBase = this.getRecoveryBlockContainerOfType(context, ast.isComponentLinkBase);
        const assemblyContext = componentLinkBase
            ? this.instancePathResolver.getComponentLinkBaseAssemblyContext(componentLinkBase)
            : undefined;
        const component = componentLinkBase
            ? assemblyContext?.component ?? this.instancePathResolver.getEffectiveComponentLinkBaseComponent(componentLinkBase)
            : undefined;
        if (!component) {
            return;
        }

        const directChildren = assemblyContext
            ? this.instancePathResolver.getAssemblyChildComponentPathContexts(assemblyContext)
            : this.getDirectChildComponentContexts(component);
        for (const child of directChildren) {
            acceptor(context, this.createContextualValueItem(
                context,
                child.path,
                `${child.path}\n{\n\t$0\n}`,
                'Nested Component Link Base'
            ));
        }

        const relativeContexts = assemblyContext
            ? this.getAssemblyRelativeComponentContexts(assemblyContext)
            : this.getRelativeComponentContexts(component);
        this.addContextualEventLinkCompletionsForContexts(context, acceptor, relativeContexts);
        this.addContextualFieldLinkCompletionsForContexts(context, acceptor, relativeContexts);
        this.addContextualInterfaceLinkCompletionsForContexts(context, acceptor, relativeContexts);
    }

    protected addInterfaceReferenceCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        const linePrefix = this.getLinePrefix(context);
        if (!linePrefix.includes('interface link')) {
            return;
        }

        const arrowIndex = linePrefix.indexOf('->');
        const colonIndex = linePrefix.lastIndexOf(':');
        if (arrowIndex >= 0 && colonIndex > arrowIndex) {
            this.addReferenceMemberCompletions(context, acceptor, this.getFallbackInterfaceComponent(context, true));
            return;
        }

        this.addReferenceMemberCompletions(context, acceptor, this.getFallbackInterfaceComponent(context, false));
    }

    protected getFallbackInterfaceComponent(context: CompletionContext, afterArrow: boolean): ast.Component | undefined {
        const componentLinkBase = this.getRecoveryBlockContainerOfType(context, ast.isComponentLinkBase);
        const assemblyContext = componentLinkBase
            ? this.instancePathResolver.getComponentLinkBaseAssemblyContext(componentLinkBase)
            : undefined;
        const rootComponent = componentLinkBase
            ? assemblyContext?.component ?? this.instancePathResolver.getEffectiveComponentLinkBaseComponent(componentLinkBase)
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
        if (assemblyContext) {
            return this.resolveRelativeAssemblyComponentPath(assemblyContext, clientPath);
        }
        return this.resolveRelativeComponentPath(rootComponent, clientPath);
    }

    protected getAssemblyRelativeComponentContexts(assemblyContext: AssemblyPathContext | undefined): RelativeComponentContext[] {
        const root = assemblyContext?.component
            ? [{ path: '.', component: assemblyContext.component }]
            : [];
        return [
            ...root,
            ...this.instancePathResolver.getAssemblyChildComponentPathContexts(assemblyContext),
        ];
    }

    protected resolveRelativeAssemblyComponentPath(
        assemblyContext: AssemblyPathContext,
        pathText: string | undefined,
    ): ast.Component | undefined {
        if (!pathText || pathText === '.') {
            return assemblyContext.component;
        }

        let currentContext = assemblyContext;
        for (const segment of pathText.replace(/^\//, '').split(/[./]/)) {
            const trimmed = segment.trim();
            if (!trimmed || trimmed === '.') {
                continue;
            }
            const child = this.instancePathResolver
                .getAssemblyChildComponentPathContexts(currentContext)
                .find(candidate => candidate.path === trimmed);
            if (!child) {
                return undefined;
            }
            currentContext = child.context;
        }
        return currentContext.component;
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
            const member: ast.Component | undefined = this.instancePathResolver
                .getComponentPathMembers(current)
                .find(candidate => candidate.name === trimmed);
            current = member;
            if (!current) {
                return undefined;
            }
        }
        return current;
    }

    protected createLinkBaseDefinitionSnippet(context: CompletionContext): string {
        const assemblies = this.getCrossReferenceNames(context, ast.LinkBase, ast.LinkBase.assembly);
        const assemblySnippet = assemblies.length > 0 ? ` for ${this.createChoicePlaceholder(2, assemblies, 'Assembly')}` : '';
        return `link ${this.createPlaceholder(1, 'Name')}${assemblySnippet}\n$0`;
    }

    protected addReferenceMemberCompletions(
        context: CompletionContext,
        acceptor: CompletionAcceptor,
        component: ast.Component | undefined,
    ): void {
        this.addNamedContextualValueCompletions(
            context,
            acceptor,
            this.instancePathResolver.getComponentMembersByKind(component, ['reference']).filter(ast.isReference),
            (candidate, name) => ({
                label: name,
                detail: `Reference of ${candidate.$container.name}.`,
            }),
        );
    }
}
