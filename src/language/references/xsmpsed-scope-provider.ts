
import type { AstNode, AstNodeDescription, AstNodeDescriptionProvider, AstReflection, IndexManager, Reference, ReferenceInfo, Scope, ScopeOptions, ScopeProvider, Stream, URI } from 'langium';
import * as ast from '../generated/ast.js';
import { AstUtils, DocumentCache, EMPTY_SCOPE, MapScope, StreamScope, WorkspaceCache, stream } from 'langium';
import type { XsmpTypeProvider } from './type-provider.js';
import type { ProjectManager } from '../workspace/project-manager.js';
import { XsmpServices } from '../xsmp-module.js';

export class XsmpsedScopeProvider implements ScopeProvider {
    protected readonly visibleUris: WorkspaceCache<URI, Set<string>>;
    protected readonly reflection: AstReflection;
    protected readonly indexManager: IndexManager;
    protected readonly typeProvider: XsmpTypeProvider;
    protected readonly globalScopeCache: WorkspaceCache<string, Scope>;
    protected readonly contexts: Set<Reference> = new Set<Reference>();
    protected readonly precomputedCache: DocumentCache<AstNode, Map<string, AstNodeDescription>>;
    protected readonly projectManager: ProjectManager;

    protected readonly descriptions: AstNodeDescriptionProvider;

    constructor(services: XsmpServices) {
        this.visibleUris = new WorkspaceCache<URI, Set<string>>(services.shared);
        this.reflection = services.shared.AstReflection;
        this.indexManager = services.shared.workspace.IndexManager;
        this.typeProvider = services.shared.TypeProvider;
        this.globalScopeCache = new WorkspaceCache<string, Scope>(services.shared);
        this.precomputedCache = new DocumentCache<AstNode, Map<string, AstNodeDescription>>(services.shared);
        this.projectManager = services.shared.workspace.ProjectManager;
        this.descriptions = services.workspace.AstNodeDescriptionProvider;
    }
    protected createScopeForNodes(elements: Iterable<ast.TemplateParameter>, outerScope?: Scope, options?: ScopeOptions): Scope {
        const s = stream(elements).map(e => {
            const name = e.name;
            if (name) {
                return this.descriptions.createDescription(e, name);
            }
            return undefined;
        }).nonNullable();
        return new StreamScope(s, outerScope, options);
    }

    getScope(context: ReferenceInfo): Scope {
        const scopes: Array<Stream<AstNodeDescription>> = [];
        const referenceType = this.reflection.getReferenceType(context);
        if (ast.isTemplateArgument(context.container) && context.property === 'parameter') {
            const task = (context.container.$container as ast.ExecuteTask).task;

            const schedule = AstUtils.getContainerOfType(task.ref, ast.isSchedule);
            if (schedule) {

                return this.createScopeForNodes(schedule.parameters, EMPTY_SCOPE);

            }
            else {
                return EMPTY_SCOPE;
            }

        }

        const precomputed = AstUtils.getDocument(context.container).precomputedScopes;
        if (precomputed) {
            let currentNode: AstNode | undefined = context.container;
            do {
                const allDescriptions = precomputed.get(currentNode);
                if (allDescriptions.length > 0) {
                    scopes.push(stream(allDescriptions).filter(
                        desc => this.reflection.isSubtype(desc.type, referenceType)));
                }
                currentNode = currentNode.$container;
            } while (currentNode);
        }

        let result: Scope = this.getGlobalScope(referenceType, context);
        for (let i = scopes.length - 1; i >= 0; i--) {
            result = this.createScope(scopes[i], result);
        }
        return result;
    }

    /**
     * Create a scope for the given collection of AST node descriptions.
     */
    protected createScope(elements: Iterable<AstNodeDescription>, outerScope?: Scope, options?: ScopeOptions): Scope {
        return new StreamScope(stream(elements), outerScope, options);
    }

    /**
     * Create a global scope filtered for the given reference type.
     */
    protected getGlobalScope(referenceType: string, _context: ReferenceInfo): Scope {
        return this.globalScopeCache.get(referenceType, () => new MapScope(this.indexManager.allElements(referenceType)));
    }


}
