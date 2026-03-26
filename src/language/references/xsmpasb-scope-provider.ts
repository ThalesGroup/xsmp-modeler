
import type {
    AstNode,
    AstNodeDescription,
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
import { AstUtils, DocumentCache, EMPTY_SCOPE, StreamScope, WorkspaceCache, stream } from 'langium';
import * as ast from '../generated/ast-partial.js';
import type { Xsmpl2PathResolver } from './xsmpl2-path-resolver.js';
import type { ProjectManager } from '../workspace/project-manager.js';
import type { XsmpServices } from '../xsmp-module.js';
import { XsmpGlobalScope, XsmpMapScope } from './xsmp-global-scope.js';

export class XsmpasbScopeProvider implements ScopeProvider {
    protected readonly reflection: AstReflection;
    protected readonly indexManager: IndexManager;
    protected readonly globalScopeCache: WorkspaceCache<URI, Map<string, Scope>>;
    protected readonly precomputedCache: DocumentCache<AstNode, Map<string, AstNodeDescription>>;
    protected readonly descriptions: AstNodeDescriptionProvider;
    protected readonly pathResolver: Xsmpl2PathResolver;
    protected readonly projectManager: ProjectManager;

    constructor(services: XsmpServices) {
        this.reflection = services.shared.AstReflection;
        this.indexManager = services.shared.workspace.IndexManager;
        this.globalScopeCache = new WorkspaceCache<URI, Map<string, Scope>>(services.shared);
        this.precomputedCache = new DocumentCache<AstNode, Map<string, AstNodeDescription>>(services.shared);
        this.descriptions = services.workspace.AstNodeDescriptionProvider;
        this.pathResolver = services.shared.L2PathResolver;
        this.projectManager = services.shared.workspace.ProjectManager;
    }

    protected collectScopesFromNode(node: AstNode, scopes: Array<Map<string, AstNodeDescription>>, document: LangiumDocument): void {
        const precomputed = this.getPrecomputedScope(node, document);
        if (precomputed.size > 0) {
            scopes.push(precomputed);
        }
    }

    getScope(context: ReferenceInfo): Scope {
        if (ast.isConcretePathNamedSegment(context.container) && context.property === ast.ConcretePathNamedSegment.reference) {
            return this.getPathScope(context.container);
        }
        if (ast.isLocalNamedReference(context.container) && context.property === ast.LocalNamedReference.reference) {
            return this.getLocalNamedReferenceScope(context.container);
        }
        if (ast.isTemplateArgument(context.container) && context.property === ast.TemplateArgument.parameter) {
            const assembly = ast.isAssemblyInstance(context.container.$container) && ast.isAssembly(context.container.$container.assembly?.ref)
                ? context.container.$container.assembly.ref
                : undefined;
            return assembly ? this.createTemplateScope(assembly.parameters) : EMPTY_SCOPE;
        }
        return this.computeScope(context);
    }

    private computeScope(context: ReferenceInfo): Scope {
        let parent: Scope;

        const scopes: Array<Map<string, AstNodeDescription>> = [];

        let currentNode = context.container.$container;
        const document = AstUtils.getDocument(context.container);
        parent = this.getGlobalScope(document, this.reflection.getReferenceType(context));
        while (currentNode) {
            this.collectScopesFromNode(currentNode, scopes, document);
            currentNode = currentNode.$container;
        }

        for (let i = scopes.length - 1; i >= 0; i--) {
            parent = new XsmpMapScope(scopes[i], parent);
        }

        return parent;
    }

    /**
     * Create a global scope filtered for the given referenceType and on visibles projects URIs
     */
    protected getGlobalScope(document: LangiumDocument, type:string): Scope {
        const globalScopes = this.globalScopeCache.get(document.uri, () => new Map<string, Scope>());
        const existingScope = globalScopes.get(type);
        if (existingScope) {
            return existingScope;
        }
        const scope = new XsmpGlobalScope(this.indexManager.allElements(type, this.projectManager.getVisibleUris(document)));
        globalScopes.set(type, scope);
        return scope;
    }

    protected getPrecomputedScope(node: AstNode, document: LangiumDocument): Map<string, AstNodeDescription> {
        return this.precomputedCache.get(document.uri, node, () => {
            const precomputed = new Map<string, AstNodeDescription>();
            if (document.localSymbols?.has(node)) {
                for (const element of document.localSymbols.getStream(node)) {
                    precomputed.set(element.name, element);
                }
            }
            return precomputed;
        });
    }

    protected getPathScope(segment: ast.ConcretePathNamedSegment): Scope {
        const candidates = this.pathResolver.getNamedSegmentCandidates(segment);
        return candidates.length > 0 ? this.createScope(candidates) : EMPTY_SCOPE;
    }

    protected getLocalNamedReferenceScope(reference: ast.LocalNamedReference): Scope {
        const candidates = this.pathResolver.getLocalNamedReferenceCandidates(reference);
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

    protected createTemplateScope(elements: Iterable<ast.TemplateParameter>, outerScope?: Scope, options?: ScopeOptions): Scope {
        return new StreamScope(
            stream(elements)
                .filter((element): element is ast.TemplateParameter => Boolean(element.name))
                .map(element => this.descriptions.createDescription(element, element.name)),
            outerScope,
            options
        );
    }
}
