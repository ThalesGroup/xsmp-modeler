import type { AstNode, AstNodeDescription, AstNodeDescriptionProvider, AstReflection, IndexManager, ReferenceInfo, Scope, ScopeOptions, ScopeProvider, Stream, URI } from 'langium';
import * as ast from '../generated/ast-partial.js';
import { AstUtils, EMPTY_SCOPE, MapScope, StreamScope, WorkspaceCache, stream } from 'langium';
import type { IdentifierPatternService, TemplateBindings } from './identifier-pattern-service.js';
import type { XsmpInstancePathResolver } from './xsmp-instance-path-resolver.js';
import type { ProjectManager } from '../workspace/project-manager.js';
import type { XsmpServices } from '../xsmp-module.js';

export class XsmpsedScopeProvider implements ScopeProvider {
    protected readonly reflection: AstReflection;
    protected readonly indexManager: IndexManager;
    protected readonly globalScopeCache: WorkspaceCache<URI, Map<string, Scope>>;
    protected readonly projectManager: ProjectManager;
    protected readonly descriptions: AstNodeDescriptionProvider;
    protected readonly pathResolver: XsmpInstancePathResolver;
    protected readonly identifierPatternService: IdentifierPatternService;

    constructor(services: XsmpServices) {
        this.reflection = services.shared.AstReflection;
        this.indexManager = services.shared.workspace.IndexManager;
        this.globalScopeCache = new WorkspaceCache<URI, Map<string, Scope>>(services.shared);
        this.projectManager = services.shared.workspace.ProjectManager;
        this.descriptions = services.workspace.AstNodeDescriptionProvider;
        this.pathResolver = services.shared.InstancePathResolver;
        this.identifierPatternService = services.shared.IdentifierPatternService;
    }

    protected createScopeForNodes(elements: Iterable<ast.TemplateParameter>, outerScope?: Scope, options?: ScopeOptions): Scope {
        return new StreamScope(
            stream(elements).map(element => element.name ? this.descriptions.createDescription(element, element.name) : undefined).nonNullable(),
            outerScope,
            options
        );
    }

    protected getLocalScopes(context: ReferenceInfo, referenceType: string): Array<Stream<AstNodeDescription>> {
        const scopes: Array<Stream<AstNodeDescription>> = [];
        const precomputed = AstUtils.getDocument(context.container).localSymbols;
        if (!precomputed) {
            return scopes;
        }

        let currentNode: AstNode | undefined = context.container;
        do {
            if (precomputed.has(currentNode)) {
                scopes.push(precomputed.getStream(currentNode).filter((desc): desc is AstNodeDescription => this.reflection.isSubtype(desc.type, referenceType)));
            }
            currentNode = currentNode.$container;
        } while (currentNode);
        return scopes;
    }

    getScope(context: ReferenceInfo): Scope {
        if (ast.isConcretePathNamedSegment(context.container) && context.property === ast.ConcretePathNamedSegment.reference) {
            return this.getPathScope(context.container);
        }
        const referenceType = this.reflection.getReferenceType(context);
        if (ast.isTemplateArgument(context.container) && context.property === ast.TemplateArgument.parameter) {
            const task = ast.isExecuteTask(context.container.$container) ? context.container.$container.task : undefined;
            const schedule = task?.ref ? AstUtils.getContainerOfType(task.ref, ast.isSchedule) : undefined;
            return schedule ? this.createScopeForNodes(schedule.parameters, EMPTY_SCOPE) : EMPTY_SCOPE;
        }

        const scopes = this.getLocalScopes(context, referenceType);
        let result: Scope = this.getGlobalScope(referenceType, context);
        for (let i = scopes.length - 1; i >= 0; i--) {
            result = this.createScope(scopes[i], result);
        }
        return result;
    }

    protected getPathScope(segment: ast.ConcretePathNamedSegment): Scope {
        const { candidates, bindings } = this.pathResolver.getNamedSegmentResolutionContext(segment);
        return candidates.length > 0 ? this.createScopeForNamedElements(candidates, undefined, undefined, bindings) : EMPTY_SCOPE;
    }

    /**
     * Create a scope for the given collection of AST node descriptions.
     */
    protected createScope(elements: Iterable<AstNodeDescription>, outerScope?: Scope, options?: ScopeOptions): Scope {
        return new StreamScope(stream(elements), outerScope, options);
    }

    protected createScopeForNamedElements(
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

    /**
     * Create a global scope filtered for the given reference type.
     */
    protected getGlobalScope(referenceType: string, context: ReferenceInfo): Scope {
        const document = AstUtils.getDocument(context.container);
        const globalScopes = this.globalScopeCache.get(document.uri, () => new Map<string, Scope>());
        let scope = globalScopes.get(referenceType);
        if (!scope) {
            scope = new MapScope(this.indexManager.allElements(referenceType, this.projectManager.getVisibleUris(document)));
            globalScopes.set(referenceType, scope);
        }
        return scope;
    }

}
