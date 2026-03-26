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
import * as ast from '../generated/ast-partial.js';
import type { ProjectManager } from '../workspace/project-manager.js';
import type { XsmpcfgPathResolver } from './xsmpcfg-path-resolver.js';
import type { XsmpcfgServices } from '../xsmpcfg-module.js';

export class XsmpcfgScopeProvider implements ScopeProvider {
    protected readonly descriptions: AstNodeDescriptionProvider;
    protected readonly globalScopeCache: WorkspaceCache<URI, Map<string, Scope>>;
    protected readonly indexManager: IndexManager;
    protected readonly pathResolver: XsmpcfgPathResolver;
    protected readonly projectManager: ProjectManager;
    protected readonly reflection: AstReflection;

    constructor(services: XsmpcfgServices) {
        this.descriptions = services.workspace.AstNodeDescriptionProvider;
        this.globalScopeCache = new WorkspaceCache<URI, Map<string, Scope>>(services.shared);
        this.indexManager = services.shared.workspace.IndexManager;
        this.pathResolver = services.shared.CfgPathResolver;
        this.projectManager = services.shared.workspace.ProjectManager;
        this.reflection = services.shared.AstReflection;
    }

    getScope(context: ReferenceInfo): Scope {
        if (ast.isConcretePathNamedSegment(context.container) && context.property === 'reference') {
            return this.getCfgPathScope(context.container);
        }
        return this.getGlobalScope(AstUtils.getDocument(context.container), this.reflection.getReferenceType(context));
    }

    protected getCfgPathScope(segment: ast.ConcretePathNamedSegment): Scope {
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
