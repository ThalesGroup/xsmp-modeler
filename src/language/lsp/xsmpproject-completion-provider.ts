import type { AstNodeDescription, MaybePromise, ReferenceInfo, Stream } from 'langium';
import { AstUtils, UriUtils, type GrammarAST } from 'langium';
import type { CompletionAcceptor, CompletionContext, NextFeature } from 'langium/lsp';
import * as ast from '../generated/ast-partial.js';
import type { XsmpprojectServices } from '../xsmpproject-module.js';
import { XsmpCompletionProviderBase } from './xsmp-completion-provider-base.js';
import { SmpStandards, type ProjectManager } from '../workspace/project-manager.js';

export class XsmpprojectCompletionProvider extends XsmpCompletionProviderBase {
    protected readonly projectManager: ProjectManager;

    constructor(services: XsmpprojectServices) {
        super(services);
        this.projectManager = services.shared.workspace.ProjectManager;
    }

    protected override getReferenceCandidates(refInfo: ReferenceInfo, _context: CompletionContext): Stream<AstNodeDescription> {
        const refId = `${refInfo.container.$type}:${refInfo.property}`;
        const project = AstUtils.getContainerOfType(refInfo.container, ast.isProject);
        if (project) {
            switch (refId) {
                case 'Dependency:project':
                    return this.scopeProvider.getScope(refInfo).getAllElements().filter(d => ast.isProject(d.node)
                        && !this.projectManager.getDependencies(d.node).has(project)
                        && !this.projectManager.getDependencies(project).has(d.node));
                case 'ToolReference:tool':
                    return this.scopeProvider.getScope(refInfo).getAllElements().filter(d =>
                        !project.elements.filter(ast.isToolReference).some(r => r.tool?.$refText === d.name));
                case 'ProfileReference:profile':
                    return this.scopeProvider.getScope(refInfo).getAllElements().filter(d =>
                        !project.elements.filter(ast.isProfileReference).some(r => r.profile?.$refText === d.name));
            }
        }
        return this.scopeProvider.getScope(refInfo).getAllElements();
    }

    protected override createEnrichedReferenceCompletionItem(
        refInfo: ReferenceInfo,
        _context: CompletionContext,
        nodeDescription: AstNodeDescription,
    ) {
        const refId = `${refInfo.container.$type}:${refInfo.property}`;
        switch (refId) {
            case 'Dependency:project':
                return this.createReferenceLikeItem(nodeDescription, `"${nodeDescription.name}"`, 'Project dependency.');
            case 'ToolReference:tool':
                return this.createReferenceLikeItem(nodeDescription, `"${nodeDescription.name}"`, 'Enabled XSMP tool.');
            case 'ProfileReference:profile':
                return this.createReferenceLikeItem(nodeDescription, `"${nodeDescription.name}"`, 'Activated XSMP profile.');
            default:
                return undefined;
        }
    }

    protected override filterKeyword(context: CompletionContext, keyword: GrammarAST.Keyword): boolean {
        if (!context.node) {
            const kind = this.getDocumentKind(context);
            switch (keyword.value) {
                case 'project':
                case 'profile':
                case 'tool':
                    return kind === keyword.value;
            }
        }
        return super.filterKeyword(context, keyword);
    }

    protected override completionFor(context: CompletionContext, next: NextFeature, acceptor: CompletionAcceptor): MaybePromise<void> {
        if (next.property === 'standard') {
            for (const standard of SmpStandards) {
                acceptor(context, this.createValueItem(standard, `"${standard}"`, 'SMP standard revision.'));
            }
            return;
        }
        super.completionFor(context, next, acceptor);
    }

    protected override createKeywordSnippets(context: CompletionContext, keyword: GrammarAST.Keyword, acceptor: CompletionAcceptor): void {
        switch (keyword.value) {
            case 'project':
                acceptor(context, this.createKeywordSnippet(
                    keyword,
                    'project "${1:MissionDemo}"\nsource "${2:smdl}"\n$0',
                    'Project Definition'
                ));
                break;
            case 'profile':
                acceptor(context, this.createKeywordSnippet(
                    keyword,
                    'profile "${1:esa-cdk}"',
                    'Profile Reference'
                ));
                break;
            case 'tool':
                acceptor(context, this.createKeywordSnippet(
                    keyword,
                    'tool "${1:adoc}"',
                    'Tool Reference'
                ));
                break;
            case 'dependency':
                acceptor(context, this.createKeywordSnippet(
                    keyword,
                    `dependency "${this.createPlaceholder(1, 'project')}"`,
                    'Project Dependency'
                ));
                break;
            case 'source':
                acceptor(context, this.createKeywordSnippet(
                    keyword,
                    'source "${1:smdl}"',
                    'Project Source Root'
                ));
                break;
        }
    }

    protected override addContextualCompletions(context: CompletionContext, _next: NextFeature, acceptor: CompletionAcceptor): void {
        this.addStandaloneCompletions(context, acceptor);
    }

    protected override addStandaloneCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        if (!this.isAtStatementStart(context)) {
            return;
        }

        const kind = this.getDocumentKind(context);
        const project = this.getRecoveryContainerOfType(context, ast.isProject);

        if (!project) {
            if (kind === 'project') {
                acceptor(context, this.createSnippetItem(
                    'Project',
                    'project "${1:MissionDemo}"\nsource "${2:smdl}"\n$0',
                    'Project Definition'
                ));
            } else if (kind === 'profile') {
                acceptor(context, this.createSnippetItem(
                    'Profile',
                    'profile "${1:esa-cdk}"',
                    'Profile Definition'
                ));
            } else if (kind === 'tool') {
                acceptor(context, this.createSnippetItem(
                    'Tool',
                    'tool "${1:adoc}"',
                    'Tool Definition'
                ));
            }
            return;
        }

        acceptor(context, this.createSnippetItem(
            'Source',
            'source "${1:smdl}"',
            'Project Source Root'
        ));
        acceptor(context, this.createSnippetItem(
            'Dependency',
            `dependency "${this.createPlaceholder(1, 'foundation')}"`,
            'Project Dependency'
        ));
        acceptor(context, this.createSnippetItem(
            'Profile',
            `profile "${this.createChoicePlaceholder(1, this.getCrossReferenceNames(context, ast.ProfileReference, 'profile'), 'esa-cdk')}"`,
            'Profile Reference'
        ));
        acceptor(context, this.createSnippetItem(
            'Tool',
            `tool "${this.createChoicePlaceholder(1, this.getCrossReferenceNames(context, ast.ToolReference, 'tool'), 'adoc')}"`,
            'Tool Reference'
        ));
    }

    protected getDocumentKind(context: CompletionContext): 'project' | 'profile' | 'tool' | undefined {
        const basename = UriUtils.basename(context.document.uri);
        if (basename === 'xsmp.project') {
            return 'project';
        }
        switch (UriUtils.extname(context.document.uri)) {
            case '.xsmpprofile':
                return 'profile';
            case '.xsmptool':
                return 'tool';
            default:
                return undefined;
        }
    }
}
