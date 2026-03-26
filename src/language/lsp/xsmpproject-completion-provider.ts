import type { AstNodeDescription, MaybePromise, ReferenceInfo, Stream } from 'langium';
import { AstUtils, UriUtils, stream, type GrammarAST } from 'langium';
import type { CompletionAcceptor, CompletionContext, NextFeature } from 'langium/lsp';
import * as ast from '../generated/ast-partial.js';
import type { XsmpprojectServices } from '../xsmpproject-module.js';
import { XsmpCompletionProviderBase } from './xsmp-completion-provider-base.js';
import { SmpStandards, type ProjectManager } from '../workspace/project-manager.js';
import type { XsmpContributionRegistry } from '../contributions/xsmp-contribution-registry.js';
import type { XsmpContributionKind } from '../contributions/xsmp-extension-types.js';

export class XsmpprojectCompletionProvider extends XsmpCompletionProviderBase {
    protected readonly projectManager: ProjectManager;
    protected readonly contributionRegistry: XsmpContributionRegistry;
    protected readonly snippetOnlyKeywords = new Set([
        'project',
        'profile',
        'tool',
        'dependency',
        'source',
    ]);

    constructor(services: XsmpprojectServices) {
        super(services);
        this.projectManager = services.shared.workspace.ProjectManager;
        this.contributionRegistry = services.shared.ContributionRegistry;
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

    protected override getReferenceCandidates(refInfo: ReferenceInfo, _context: CompletionContext): Stream<AstNodeDescription> {
        const project = AstUtils.getContainerOfType(refInfo.container, ast.isProject);
        if (project) {
            if (this.isReferenceProperty(refInfo, ast.Dependency, ast.Dependency.project)) {
                return this.scopeProvider.getScope(refInfo).getAllElements().filter(d => ast.isProject(d.node)
                    && !this.projectManager.getDependencies(d.node).has(project)
                    && !this.projectManager.getDependencies(project).has(d.node));
            }
            if (this.isReferenceProperty(refInfo, ast.ToolReference, ast.ToolReference.tool)) {
                const used = new Set(
                    project.elements
                        .filter(ast.isToolReference)
                        .map(reference => this.contributionRegistry.resolveContribution('tool', reference.tool?.$refText ?? reference.tool?.ref?.name)?.contribution.id)
                        .filter((name): name is string => Boolean(name))
                );
                const descriptions = this.contributionRegistry
                    .getContributionDescriptions('tool', false)
                    .filter(description => !used.has(description.name));
                return stream(descriptions);
            }
            if (this.isReferenceProperty(refInfo, ast.ProfileReference, ast.ProfileReference.profile)) {
                const used = new Set(
                    project.elements
                        .filter(ast.isProfileReference)
                        .map(reference => this.contributionRegistry.resolveContribution('profile', reference.profile?.$refText ?? reference.profile?.ref?.name)?.contribution.id)
                        .filter((name): name is string => Boolean(name))
                );
                const descriptions = this.contributionRegistry
                    .getContributionDescriptions('profile', false)
                    .filter(description => !used.has(description.name));
                return stream(descriptions);
            }
        }
        return this.scopeProvider.getScope(refInfo).getAllElements();
    }

    protected override createEnrichedReferenceCompletionItem(
        refInfo: ReferenceInfo,
        _context: CompletionContext,
        nodeDescription: AstNodeDescription,
    ) {
        if (this.isReferenceProperty(refInfo, ast.Dependency, ast.Dependency.project)) {
            return this.createReferenceLikeItem(nodeDescription, `"${nodeDescription.name}"`, 'Project dependency.');
        }
        if (this.isReferenceProperty(refInfo, ast.ToolReference, ast.ToolReference.tool)) {
            return this.createReferenceLikeItem(nodeDescription, `"${nodeDescription.name}"`, 'Enabled XSMP tool.');
        }
        if (this.isReferenceProperty(refInfo, ast.ProfileReference, ast.ProfileReference.profile)) {
            return this.createReferenceLikeItem(nodeDescription, `"${nodeDescription.name}"`, 'Activated XSMP profile.');
        }
        return undefined;
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
        if (next.property === ast.Project.standard) {
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
                    `profile "${this.createPlaceholder(1, this.getContributionSnippetDefault('profile', 'profile'))}"`,
                    'Profile Reference'
                ));
                break;
            case 'tool':
                acceptor(context, this.createKeywordSnippet(
                    keyword,
                    `tool "${this.createPlaceholder(1, this.getContributionSnippetDefault('tool', 'tool'))}"`,
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
                    `profile "${this.createPlaceholder(1, this.getContributionSnippetDefault('profile', 'profile'))}"`,
                    'Profile Definition'
                ));
            } else if (kind === 'tool') {
                acceptor(context, this.createSnippetItem(
                    'Tool',
                    `tool "${this.createPlaceholder(1, this.getContributionSnippetDefault('tool', 'tool'))}"`,
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
            `profile "${this.createChoicePlaceholder(1, this.contributionRegistry.getCanonicalNames('profile'), this.getContributionSnippetDefault('profile', 'profile'))}"`,
            'Profile Reference'
        ));
        acceptor(context, this.createSnippetItem(
            'Tool',
            `tool "${this.createChoicePlaceholder(1, this.contributionRegistry.getCanonicalNames('tool'), this.getContributionSnippetDefault('tool', 'tool'))}"`,
            'Tool Reference'
        ));
    }

    protected getContributionSnippetDefault(kind: XsmpContributionKind, fallback: string): string {
        return this.contributionRegistry.getPreferredContributionId(kind) ?? fallback;
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
