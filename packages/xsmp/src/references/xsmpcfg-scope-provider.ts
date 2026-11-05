import { VisibilityCache } from '../workspace/visibility-cache.js';
import type {
    AstNodeDescriptionProvider,
    AstReflection,
    IndexManager,
    LangiumDocument,
    ReferenceInfo,
    Scope,
    ScopeOptions,
    ScopeProvider
} from 'langium';
import { AstUtils, EMPTY_SCOPE, MapScope, StreamScope, stream } from 'langium';
import * as ast from '../generated/ast-partial.js';
import type { ProjectManager } from '../workspace/project-manager.js';
import type { IdentifierPatternService, TemplateBindings } from './identifier-pattern-service.js';
import type { XsmpcfgPathResolver } from './xsmpcfg-path-resolver.js';
import type { XsmpcfgServices } from '../xsmpcfg-module.js';

export class XsmpcfgScopeProvider implements ScopeProvider {
    protected readonly descriptions: AstNodeDescriptionProvider;
    protected readonly globalScopeCache: VisibilityCache<Map<string, Scope>>;
    protected readonly indexManager: IndexManager;
    protected readonly pathResolver: XsmpcfgPathResolver;
    protected readonly projectManager: ProjectManager;
    protected readonly reflection: AstReflection;
    protected readonly identifierPatternService: IdentifierPatternService;

    constructor(services: XsmpcfgServices) {
        this.descriptions = services.workspace.AstNodeDescriptionProvider;
        this.globalScopeCache = new VisibilityCache<Map<string, Scope>>();
        this.indexManager = services.shared.workspace.IndexManager;
        this.pathResolver = services.shared.CfgPathResolver;
        this.projectManager = services.shared.workspace.ProjectManager;
        this.reflection = services.shared.AstReflection;
        this.identifierPatternService = services.shared.IdentifierPatternService;
    }

    getScope(context: ReferenceInfo): Scope {
        if (ast.isConcretePathNamedSegment(context.container) && context.property === ast.ConcretePathNamedSegment.reference) {
            return this.getCfgPathScope(context.container);
        }
        return this.getGlobalScope(AstUtils.getDocument(context.container), this.reflection.getReferenceType(context));
    }

    protected getCfgPathScope(segment: ast.ConcretePathNamedSegment): Scope {
        const { candidates, bindings } = this.pathResolver.getNamedSegmentContext(segment);
        return candidates.length > 0 ? this.createScope(candidates, undefined, undefined, bindings) : EMPTY_SCOPE;
    }

    protected createScope(
        elements: Iterable<ast.NamedElement>,
        outerScope?: Scope,
        options?: ScopeOptions,
        bindings?: TemplateBindings,
    ): Scope {
        return new StreamScope(
            stream(elements)
                .filter((element): element is ast.NamedElement => Boolean(element.name))
                .map(element => this.descriptions.createDescription(
                    element,
                    this.identifierPatternService.substitute(element.name, bindings) ?? element.name
                )),
            outerScope,
            options
        );
    }

    protected getGlobalScope(document: LangiumDocument, referenceType: string): Scope {
        const visibleUris = this.projectManager.getVisibleUris(document);
        const globalScopes = this.globalScopeCache.get(visibleUris, () => new Map<string, Scope>());
        let scope = globalScopes.get(referenceType);
        if (!scope) {
            scope = new MapScope(this.indexManager.allElements(referenceType, visibleUris));
            globalScopes.set(referenceType, scope);
        }
        return scope;
    }
}
