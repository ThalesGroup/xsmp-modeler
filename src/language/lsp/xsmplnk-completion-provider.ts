import type { GrammarAST } from 'langium';
import type { AstNodeDescription, ReferenceInfo } from 'langium';
import type { CompletionAcceptor, CompletionContext, NextFeature } from 'langium/lsp';
import * as ast from '../generated/ast-partial.js';
import type { XsmplnkServices } from '../xsmplnk-module.js';
import { XsmpCompletionProviderBase } from './xsmp-completion-provider-base.js';

export class XsmplnkCompletionProvider extends XsmpCompletionProviderBase {
    constructor(services: XsmplnkServices) {
        super(services);
    }

    protected override createKeywordSnippets(context: CompletionContext, keyword: GrammarAST.Keyword, acceptor: CompletionAcceptor): void {
        switch (keyword.value) {
            case 'link': {
                const assemblies = this.getCrossReferenceNames(context, ast.LinkBase, 'assembly');
                acceptor(context, this.createKeywordSnippet(
                    keyword,
                    `link ${this.createPlaceholder(1, 'Name')}${assemblies.length > 0 ? ` for ${this.createChoicePlaceholder(2, assemblies, 'Assembly')}` : ''}\n$0`,
                    'Link Base Definition'
                ));
                break;
            }
            case 'event':
                acceptor(context, this.createSnippetItem('event link', 'event link ${1:owner} -> ${2:client}', 'Event Link'));
                break;
            case 'field':
                acceptor(context, this.createSnippetItem('field link', 'field link ${1:owner} -> ${2:client}', 'Field Link'));
                break;
            case 'interface':
                acceptor(context, this.createSnippetItem('interface link', 'interface link ${1:owner} : ${2:reference} -> ${3:client}${4:: ${5:backReference}}', 'Interface Link'));
                break;
        }
    }

    protected override addContextualCompletions(context: CompletionContext, _next: NextFeature, acceptor: CompletionAcceptor): void {
        this.addStandaloneCompletions(context, acceptor);
    }

    protected override addStandaloneCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        const linkBase = this.getRecoveryContainerOfType(context, ast.isLinkBase);
        const componentLinkBase = this.getRecoveryContainerOfType(context, ast.isComponentLinkBase);

        if (this.isAtStatementStart(context) && componentLinkBase) {
            acceptor(context, this.createSnippetItem(
                'Component Link Base',
                `${this.createPlaceholder(1, 'path')}\n{\n\t$0\n}`,
                'Nested Component Link Base'
            ));
            acceptor(context, this.createSnippetItem('Event Link', 'event link ${1:owner} -> ${2:client}', 'Event Link'));
            acceptor(context, this.createSnippetItem('Field Link', 'field link ${1:owner} -> ${2:client}', 'Field Link'));
            acceptor(context, this.createSnippetItem('Interface Link', 'interface link ${1:owner} : ${2:reference} -> ${3:client}${4:: ${5:backReference}}', 'Interface Link'));
        } else if (this.isAtStatementStart(context) && linkBase) {
            acceptor(context, this.createSnippetItem(
                'Root Component Link Base',
                '/\n{\n\t$0\n}',
                'Root Component Link Base'
            ));
        }

        if (this.getLinePrefix(context).includes('interface link')) {
            this.addInterfaceReferenceCompletions(context, acceptor);
        }

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

    protected addInterfaceReferenceCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        const linePrefix = this.getLinePrefix(context);
        if (!linePrefix.includes(':')) {
            return;
        }

        const afterArrow = linePrefix.includes('->') && linePrefix.lastIndexOf(':') > linePrefix.lastIndexOf('->');
        const fallbackComponent = this.getFallbackInterfaceComponent(context, afterArrow);
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
    }

    protected addComponentLinkBaseCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        if (!this.isAtStatementStart(context)) {
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

    protected getFallbackInterfaceComponent(context: CompletionContext, afterArrow: boolean): ast.Component | undefined {
        const linkBase = this.getRecoveryContainerOfType(context, ast.isLinkBase);
        const assembly = ast.isAssembly(linkBase?.assembly?.ref) ? linkBase.assembly.ref : undefined;
        const implementation = assembly?.model?.implementation?.ref;
        const rootComponent = ast.isComponent(implementation)
            ? implementation
            : undefined;
        if (!rootComponent) {
            return undefined;
        }
        if (!afterArrow) {
            return rootComponent;
        }
        const linePrefix = this.getLinePrefix(context);
        const clientMatch = /->\s*([_a-zA-Z]\w*)\s*:\s*[_a-zA-Z0-9]*$/.exec(linePrefix);
        const clientSegment = clientMatch?.[1];
        if (!clientSegment) {
            return undefined;
        }
        const child = this.l2PathResolver.getComponentPathMembers(rootComponent).find(member => member.name === clientSegment);
        return child ? this.typedPathResolver.getChildComponentForPathMember(child) : undefined;
    }
}
