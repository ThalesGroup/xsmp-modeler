import { type Cancellation, type LangiumDocument, type ValidationOptions, type URI, type MaybePromise, DefaultDocumentBuilder, Disposable, DocumentState, ValidationCategory } from 'langium';
import type { XsmpSharedServices } from '../xsmp-module.js';
import type { ProjectManager } from './project-manager.js';
import * as ast from '../generated/ast-partial.js';
import type { XsmpContributionRegistry } from '../contributions/xsmp-contribution-registry.js';
import type { XsmpIndexManager } from './index-manager.js';
import { isBuiltinLibrary } from '../builtins.js';

export class XsmpDocumentBuilder extends DefaultDocumentBuilder {

    private readonly invalidationListeners = new Set<(document: LangiumDocument) => void>();
    protected readonly projectManager: () => ProjectManager;
    protected readonly contributionRegistry: () => XsmpContributionRegistry;
    protected declare readonly indexManager: XsmpIndexManager;
    constructor(services: XsmpSharedServices) {
        super(services);
        this.projectManager = () => services.workspace.ProjectManager;
        this.contributionRegistry = () => services.ContributionRegistry;
    }

    /** Invalidate semantic caches before a changed or dependent document is relinked. */
    onInvalidateDocument(listener: (document: LangiumDocument) => void): Disposable {
        this.invalidationListeners.add(listener);
        return Disposable.create(() => this.invalidationListeners.delete(listener));
    }

    override resetToState(document: LangiumDocument, state: DocumentState): void {
        if (state <= DocumentState.ComputedScopes) {
            for (const listener of this.invalidationListeners) {
                listener(document);
            }
        }
        super.resetToState(document, state);
    }

    protected override shouldRelink(document: LangiumDocument, changedUris: Set<string>): boolean {
        // Compute the entire dependency closure before the first consumer loses its reference index.
        return this.indexManager.isAffected(document, changedUris)
            || document.references.some(reference => reference.error !== undefined);
    }

    protected override async emitUpdate(changed: URI[], deleted: URI[]): Promise<void> {
        const structural = this.indexManager.changesWorkspaceStructure(changed, deleted);
        this.indexManager.requiresFullRebuild ||= structural;
        this.projectManager().invalidate(new Set(changed.map(uri => uri.toString())), structural);
        await super.emitUpdate(changed, deleted);
    }

    protected override async runCancelable(
        documents: LangiumDocument[], state: DocumentState, token: Cancellation.CancellationToken,
        callback: (document: LangiumDocument) => MaybePromise<unknown>,
    ): Promise<void> {
        await super.runCancelable(documents, state, token, callback);
        if (state === DocumentState.IndexedContent && this.indexManager.requiresFullRebuild) {
            // Parsing/indexing may be interrupted. Consume this flag only once the whole phase
            // completes, so a resumed build cannot miss a previously indexed structural change.
            this.projectManager().invalidate(new Set(), true);
            const included = new Set(documents);
            const additional: LangiumDocument[] = [];
            for (const document of this.langiumDocuments.all) {
                if (document.state >= DocumentState.ComputedScopes
                    && (this.indexManager.requiresBuiltinRebuild || !isBuiltinLibrary(document.uri))) {
                    const options = included.has(document) ? this.getBuildOptions(document) : this.updateBuildOptions;
                    this.resetToState(document, DocumentState.ComputedScopes);
                    this.prepareBuild([document], options);
                    if (!included.has(document)) additional.push(document);
                }
            }
            documents.push(...additional);
            this.indexManager.requiresFullRebuild = false;
            this.indexManager.requiresBuiltinRebuild = false;
        }
    }

    protected override async validate(document: LangiumDocument, cancelToken: Cancellation.CancellationToken): Promise<void> {
        const validator = this.serviceRegistry.getServices(document.uri).validation.DocumentValidator;
        const options = this.getValidationOptions(document);
        const diagnostics = await validator.validateDocument(document, options, cancelToken);
        if (document.diagnostics) {
            document.diagnostics.push(...diagnostics);
        } else {
            document.diagnostics = diagnostics;
        }

        // Store information about the executed validation in the build state
        const state = this.buildState.get(document.uri.toString());
        if (state) {
            state.result ??= {};
            const newCategories = options.categories ?? ValidationCategory.defaults;
            if (state.result.validationChecks) {
                state.result.validationChecks.push(...newCategories);
            } else {
                state.result.validationChecks = [...newCategories];
            }
        }
    }
    protected getValidationOptions(document: LangiumDocument): ValidationOptions {
        const project = this.projectManager().getProject(document);
        const categories = ['fast', 'built-in'];
        if (project) {
            for (const profile of project.elements.filter(ast.isProfileReference)) {
                const rawName = profile.profile?.$refText ?? profile.profile?.ref?.name;
                const contribution = this.contributionRegistry().resolveContribution('profile', rawName)?.contribution;
                if (contribution) {
                    categories.push(contribution.validationCategory);
                }
            }
            for (const tool of project.elements.filter(ast.isToolReference)) {
                const rawName = tool.tool?.$refText ?? tool.tool?.ref?.name;
                const contribution = this.contributionRegistry().resolveContribution('tool', rawName)?.contribution;
                if (contribution) {
                    categories.push(contribution.validationCategory);
                }
            }
        }
        return { categories };
    }
}
