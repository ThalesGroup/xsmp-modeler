import type {
    AstNodeDescriptionProvider,
    AstReflection,
    IndexManager,
    LangiumDocument,
    ReferenceInfo,
    Scope,
    ScopeOptions,
    ScopeProvider,
    URI
} from 'langium';
import { AstUtils, EMPTY_SCOPE, MapScope, StreamScope, WorkspaceCache, stream } from 'langium';
import * as ast from '../generated/ast.js';
import type { Xsmpl2PathResolver } from './xsmpl2-path-resolver.js';
import type { ProjectManager } from '../workspace/project-manager.js';
import type { XsmplnkServices } from '../xsmplnk-module.js';

export class XsmplnkScopeProvider implements ScopeProvider {
    protected readonly descriptions: AstNodeDescriptionProvider;
    protected readonly globalScopeCache: WorkspaceCache<URI, Map<string, Scope>>;
    protected readonly indexManager: IndexManager;
    protected readonly pathResolver: Xsmpl2PathResolver;
    protected readonly projectManager: ProjectManager;
    protected readonly reflection: AstReflection;

    constructor(services: XsmplnkServices) {
        this.descriptions = services.workspace.AstNodeDescriptionProvider;
        this.globalScopeCache = new WorkspaceCache<URI, Map<string, Scope>>(services.shared);
        this.indexManager = services.shared.workspace.IndexManager;
        this.pathResolver = services.shared.L2PathResolver;
        this.projectManager = services.shared.workspace.ProjectManager;
        this.reflection = services.shared.AstReflection;
    }

    getScope(context: ReferenceInfo): Scope {
        if (ast.isConcretePathNamedSegment(context.container) && context.property === 'reference') {
            return this.getPathScope(context.container);
        }
        return this.getGlobalScope(AstUtils.getDocument(context.container), this.reflection.getReferenceType(context));
    }

    protected getPathScope(segment: ast.ConcretePathNamedSegment): Scope {
        const candidates = this.pathResolver.getNamedSegmentCandidates(segment);
        return candidates.length > 0 ? this.createScope(candidates) : EMPTY_SCOPE;
    }

    protected createScope(elements: Iterable<ast.NamedElement>, outerScope?: Scope, options?: ScopeOptions): Scope {
        return new StreamScope(
            stream(elements)
                .filter((element): element is ast.NamedElement => Boolean(element.name))
                .map(element => this.descriptions.createDescription(element, element.name)),
            outerScope,
            options
        );
    }

    protected getGlobalScope(document: LangiumDocument, referenceType: string): Scope {
        const globalScopes = this.globalScopeCache.get(document.uri, () => new Map<string, Scope>());
        let scope = globalScopes.get(referenceType);
        if (!scope) {
            scope = new MapScope(this.indexManager.allElements(referenceType, this.projectManager.getVisibleUris(document)));
            globalScopes.set(referenceType, scope);
        }
        return scope;
    }
}
