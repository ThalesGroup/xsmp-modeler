import { AstUtils, WorkspaceCache } from 'langium';
import * as ast from '../generated/ast-partial.js';
import type { XsmpSharedServices } from '../xsmp-module.js';
import {
    componentModeFieldPathMessages,
    type TypedComponentPathResolution,
    type TypedFieldPathResolution,
    type XsmpTypedPathResolver
} from './xsmp-typed-path-resolver.js';

type RecoverableType = ast.Type;

export type CfgComponentPathResolution = TypedComponentPathResolution;
export type CfgFieldPathResolution = TypedFieldPathResolution;

export class XsmpcfgPathResolver {
    protected readonly componentPathCache: WorkspaceCache<ast.Path, CfgComponentPathResolution>;
    protected readonly fieldPathCache: WorkspaceCache<ast.Path, CfgFieldPathResolution>;
    protected readonly componentStackCache: WorkspaceCache<ast.ComponentConfiguration, readonly ast.Component[] | undefined>;
    protected readonly typedPathResolver: XsmpTypedPathResolver;

    constructor(services: XsmpSharedServices) {
        this.componentPathCache = new WorkspaceCache<ast.Path, CfgComponentPathResolution>(services);
        this.fieldPathCache = new WorkspaceCache<ast.Path, CfgFieldPathResolution>(services);
        this.componentStackCache = new WorkspaceCache<ast.ComponentConfiguration, readonly ast.Component[] | undefined>(services);
        this.typedPathResolver = services.TypedPathResolver;
    }

    getNamedSegmentCandidates(segment: ast.PathNamedSegment | undefined): readonly ast.NamedElement[] {
        if (!segment) {
            return [];
        }
        const path = AstUtils.getContainerOfType(segment, ast.isPath);
        if (!path) {
            return [];
        }
        if (ast.isFieldValue(path.$container)) {
            return this.getFieldPathResolution(path).namedSegments.get(segment) ?? [];
        }
        return this.getComponentPathResolution(path).namedSegments.get(segment) ?? [];
    }

    getConfigurationComponentStack(configuration: ast.ComponentConfiguration): readonly ast.Component[] | undefined {
        return this.componentStackCache.get(configuration, () => this.computeConfigurationComponentStack(configuration));
    }

    getComponentPathResolution(path: ast.Path): CfgComponentPathResolution {
        return this.componentPathCache.get(path, () => this.computeComponentPathResolution(path));
    }

    getFieldPathResolution(path: ast.Path): CfgFieldPathResolution {
        return this.fieldPathCache.get(path, () => this.computeFieldPathResolution(path));
    }

    getFieldCandidatesForType(type: RecoverableType | undefined): readonly ast.Field[] {
        return this.typedPathResolver.getFieldCandidatesForType(type);
    }

    protected computeConfigurationComponentStack(configuration: ast.ComponentConfiguration): readonly ast.Component[] | undefined {
        const parent = ast.isComponentConfiguration(configuration.$container) ? configuration.$container : undefined;
        const parentStack = parent ? this.getConfigurationComponentStack(parent) : undefined;
        const explicitComponent = ast.isComponent(configuration.component?.ref) ? configuration.component.ref : undefined;
        const resolution = parentStack && configuration.name ? this.typedPathResolver.resolveComponentPath(configuration.name, parentStack) : undefined;

        if (explicitComponent) {
            if (resolution?.finalStack && resolution.finalStack.length > 0) {
                return [...resolution.finalStack.slice(0, -1), explicitComponent];
            }
            if (resolution?.parentStackForUntypedTarget) {
                return [...resolution.parentStackForUntypedTarget, explicitComponent];
            }
            return parentStack ? [...parentStack, explicitComponent] : [explicitComponent];
        }

        return resolution?.finalStack;
    }

    protected computeComponentPathResolution(path: ast.Path): CfgComponentPathResolution {
        return this.typedPathResolver.resolveComponentPath(path, this.getBaseComponentStackForComponentPath(path));
    }

    protected computeFieldPathResolution(path: ast.Path): CfgFieldPathResolution {
        const configuration = AstUtils.getContainerOfType(path, ast.isComponentConfiguration);
        const component = configuration ? this.getConfigurationComponentStack(configuration)?.at(-1) : undefined;
        return this.typedPathResolver.resolveFieldPath(path, component, componentModeFieldPathMessages);
    }

    protected getBaseComponentStackForComponentPath(path: ast.Path): readonly ast.Component[] | undefined {
        if (ast.isConfigurationUsage(path.$container)) {
            const configuration = AstUtils.getContainerOfType(path.$container, ast.isComponentConfiguration);
            return configuration ? this.getConfigurationComponentStack(configuration) : undefined;
        }
        if (ast.isComponentConfiguration(path.$container)) {
            return ast.isComponentConfiguration(path.$container.$container)
                ? this.getConfigurationComponentStack(path.$container.$container)
                : undefined;
        }
        return undefined;
    }
}
