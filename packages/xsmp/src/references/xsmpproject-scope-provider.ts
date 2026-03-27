import { EMPTY_SCOPE, MapScope, type IndexManager, type ReferenceInfo, type Scope, type ScopeProvider } from 'langium';
import * as ast from '../generated/ast-partial.js';
import type { XsmpContributionRegistry } from '../contributions/xsmp-contribution-registry.js';
import type { XsmpprojectServices } from '../xsmpproject-module.js';

export class XsmpprojectScopeProvider implements ScopeProvider {
    protected readonly indexManager: IndexManager;
    protected readonly contributionRegistry: XsmpContributionRegistry;

    constructor(services: XsmpprojectServices) {
        this.indexManager = services.shared.workspace.IndexManager;
        this.contributionRegistry = services.shared.ContributionRegistry;
    }

    getScope(context: ReferenceInfo): Scope {
        if (context.container.$type === ast.ProfileReference.$type && context.property === ast.ProfileReference.profile) {
            return new MapScope(this.contributionRegistry.getContributionDescriptions('profile', true), EMPTY_SCOPE);
        }
        if (context.container.$type === ast.ToolReference.$type && context.property === ast.ToolReference.tool) {
            return new MapScope(this.contributionRegistry.getContributionDescriptions('tool', true), EMPTY_SCOPE);
        }
        if (context.container.$type === ast.Dependency.$type && context.property === ast.Dependency.project) {
            return new MapScope(this.indexManager.allElements(ast.Project.$type), EMPTY_SCOPE);
        }
        return EMPTY_SCOPE;
    }
}

