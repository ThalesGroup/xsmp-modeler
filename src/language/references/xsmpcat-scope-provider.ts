
import type { AstNode, AstNodeDescription, AstReflection, IndexManager, LangiumDocument, Reference, ReferenceInfo, Scope, ScopeProvider, URI } from 'langium';
import * as ast from '../generated/ast.js';
import { AstUtils, DocumentCache, EMPTY_SCOPE, WorkspaceCache } from 'langium';
import type { XsmpTypeProvider } from './type-provider.js';
import type { ProjectManager } from '../workspace/project-manager.js';
import type { XsmpServices } from '../xsmp-module.js';
import { XsmpGlobalScope, XsmpMapScope } from './xsmp-global-scope.js';

export class XsmpcatScopeProvider implements ScopeProvider {
    protected readonly reflection: AstReflection;
    protected readonly indexManager: IndexManager;
    protected readonly typeProvider: XsmpTypeProvider;
    protected readonly globalScopeCache: WorkspaceCache<URI, Scope>;
    protected readonly contexts: Set<Reference> = new Set<Reference>();
    protected readonly precomputedCache: DocumentCache<AstNode, Map<string, AstNodeDescription>>;
    protected readonly projectManager: ProjectManager;

    constructor(services: XsmpServices) {
        this.reflection = services.shared.AstReflection;
        this.indexManager = services.shared.workspace.IndexManager;
        this.typeProvider = services.shared.TypeProvider;
        this.globalScopeCache = new WorkspaceCache<URI, Scope>(services.shared);
        this.precomputedCache = new DocumentCache<AstNode, Map<string, AstNodeDescription>>(services.shared);
        this.projectManager = services.shared.workspace.ProjectManager;
    }

    protected collectScopesFromNode(node: AstNode, scopes: Array<Map<string, AstNodeDescription>>,
        document: LangiumDocument) {

        const precomputed = this.getPrecomputedScope(node, document);
        if (precomputed.size > 0) {
            scopes.push(precomputed);
        }
        switch (node.$type) {
            case ast.Model:
            case ast.Service: {
                const component = node as ast.Component;
                if (component.base) {
                    this.collectScopesFromReference(component.base, scopes);
                }
                component.interface.forEach(i => this.collectScopesFromReference(i, scopes));
                break;
            }
            case ast.Interface: {
                (node as ast.Interface).base.forEach(i => this.collectScopesFromReference(i, scopes));
                break;
            }
            case ast.Class:
            case ast.Exception: {
                const clazz = node as ast.Class;
                if (clazz.base)
                    this.collectScopesFromReference(clazz.base, scopes);
                break;
            }
        }
    }
    protected collectScopesFromReference(node: Reference, scopes: Array<Map<string, AstNodeDescription>>) {
        // Check if the node is currently processed to avoid cyclic dependency
        if (!this.contexts.has(node) && node.ref) {
            this.contexts.add(node);
            try {
                this.collectScopesFromNode(node.ref, scopes, AstUtils.getDocument(node.ref));
            }
            finally {
                // Remove the context
                this.contexts.delete(node);
            }
        }
    }

    getScope(context: ReferenceInfo): Scope {
        // Store the context
        this.contexts.add(context.reference);
        try {
            return this.computeScope(context);
        }
        finally {
            // Remove the context
            this.contexts.delete(context.reference);
        }
    }

    private computeScope(context: ReferenceInfo): Scope {
        let parent: Scope;

        const scopes: Array<Map<string, AstNodeDescription>> = [];

        if (ast.DesignatedInitializer === context.container.$type && context.property === 'field') {
            if (context.container.$container) {
                const type = this.typeProvider.getType(context.container.$container);
                switch (type?.$type) {
                    case ast.Structure:
                    case ast.Class:
                    case ast.Exception:
                        this.collectScopesFromNode(type, scopes, AstUtils.getDocument(type));
                        parent = EMPTY_SCOPE;
                        break;
                    default: return EMPTY_SCOPE;
                }
            }
            else {
                return EMPTY_SCOPE;
            }
        }
        else {
            let currentNode = context.container.$container;
            const document = AstUtils.getDocument(context.container);
            parent = this.getGlobalScope(document);
            while (currentNode) {
                this.collectScopesFromNode(currentNode, scopes, document);
                currentNode = currentNode.$container;
            }
        }

        for (let i = scopes.length - 1; i >= 0; i--) {
            parent = new XsmpMapScope(scopes[i], parent);
        }

        return parent;
    }

    /**
     * Create a global scope filtered for the given referenceType and on visibles projects URIs
     */
    protected getGlobalScope(document: LangiumDocument): Scope {
        return this.globalScopeCache.get(document.uri, () => new XsmpGlobalScope(this.indexManager.allElements(undefined, this.projectManager.getVisibleUris(document))));
    }

    protected getPrecomputedScope(node: AstNode, document: LangiumDocument): Map<string, AstNodeDescription> {
        return this.precomputedCache.get(document.uri, node, () => {
            const precomputed = new Map<string, AstNodeDescription>();
            if (document.precomputedScopes) {
                for (const element of document.precomputedScopes.get(node)) {
                    precomputed.set(element.name, element);
                }
            }
            return precomputed;
        });
    }
}
