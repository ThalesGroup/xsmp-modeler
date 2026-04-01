import { type AstNode, AstUtils, WorkspaceCache } from 'langium';
import * as ast from '../generated/ast-partial.js';
import type { XsmpSharedServices } from '../xsmp-module.js';
import type { TemplateBindings } from './identifier-pattern-service.js';
import {
    componentModeFieldPathMessages,
    type TypedFieldPathResolution,
    type XsmpTypedPathResolver
} from './xsmp-typed-path-resolver.js';
import type { AssemblyPathContext, XsmpInstancePathResolver } from './xsmp-instance-path-resolver.js';

type RecoverableType = ast.Type;

export type CfgFieldPathResolution = TypedFieldPathResolution;

export interface CfgComponentPathResolution {
    active: boolean;
    finalComponent?: ast.Component;
    finalBindings?: TemplateBindings;
    finalStack?: readonly ast.Component[];
    parentStackForUntypedTarget?: readonly ast.Component[];
    finalAssemblyContext?: AssemblyPathContext;
    invalidMessage?: string;
    invalidNode?: AstNode;
    namedSegments: ReadonlyMap<ast.PathNamedSegment, readonly ast.NamedElement[]>;
    segmentBindings?: ReadonlyMap<ast.PathNamedSegment, TemplateBindings | undefined>;
}

interface CfgConfigurationContext {
    component?: ast.Component;
    bindings?: TemplateBindings;
    componentStack?: readonly ast.Component[];
    assemblyContext?: AssemblyPathContext;
}

export class XsmpcfgPathResolver {
    protected readonly componentPathCache: WorkspaceCache<ast.Path, CfgComponentPathResolution>;
    protected readonly fieldPathCache: WorkspaceCache<ast.Path, CfgFieldPathResolution>;
    protected readonly configurationContextCache: WorkspaceCache<ast.ComponentConfiguration, CfgConfigurationContext | undefined>;
    protected readonly typedPathResolver: XsmpTypedPathResolver;
    protected readonly instancePathResolver: XsmpInstancePathResolver;

    constructor(services: XsmpSharedServices) {
        this.componentPathCache = new WorkspaceCache<ast.Path, CfgComponentPathResolution>(services);
        this.fieldPathCache = new WorkspaceCache<ast.Path, CfgFieldPathResolution>(services);
        this.configurationContextCache = new WorkspaceCache<ast.ComponentConfiguration, CfgConfigurationContext | undefined>(services);
        this.typedPathResolver = services.TypedPathResolver;
        this.instancePathResolver = services.InstancePathResolver;
    }

    getNamedSegmentCandidates(segment: ast.PathNamedSegment | undefined): readonly ast.NamedElement[] {
        return this.getNamedSegmentContext(segment).candidates;
    }

    getNamedSegmentContext(segment: ast.PathNamedSegment | undefined): {
        candidates: readonly ast.NamedElement[];
        bindings?: TemplateBindings;
    } {
        if (!segment) {
            return { candidates: [] };
        }
        const path = AstUtils.getContainerOfType(segment, ast.isPath);
        if (!path) {
            return { candidates: [] };
        }
        if (ast.isFieldValue(path.$container)) {
            return {
                candidates: this.getFieldPathResolution(path).namedSegments.get(segment) ?? [],
            };
        }
        const resolution = this.getComponentPathResolution(path);
        return {
            candidates: resolution.namedSegments.get(segment) ?? [],
            bindings: resolution.segmentBindings?.get(segment),
        };
    }

    getConfigurationComponentStack(configuration: ast.ComponentConfiguration): readonly ast.Component[] | undefined {
        return this.getConfigurationContext(configuration)?.componentStack;
    }

    getConfigurationComponentContext(configuration: ast.ComponentConfiguration): {
        component?: ast.Component;
        bindings?: TemplateBindings;
        assemblyContext?: AssemblyPathContext;
    } {
        const context = this.getConfigurationContext(configuration);
        return {
            component: context?.component,
            bindings: context?.bindings,
            assemblyContext: context?.assemblyContext,
        };
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

    protected getConfigurationContext(configuration: ast.ComponentConfiguration): CfgConfigurationContext | undefined {
        return this.configurationContextCache.get(configuration, () => this.computeConfigurationContext(configuration));
    }

    protected getParentConfigurationContext(configuration: ast.ComponentConfiguration): CfgConfigurationContext | undefined {
        return ast.isComponentConfiguration(configuration.$container)
            ? this.getConfigurationContext(configuration.$container)
            : undefined;
    }

    protected isAssemblyBackedContext(context: CfgConfigurationContext | undefined): boolean {
        return Boolean(context?.assemblyContext);
    }

    protected isComponentBackedContext(context: CfgConfigurationContext | undefined): boolean {
        return Boolean(context && !context.assemblyContext);
    }

    protected createInactiveComponentPathResolution(): CfgComponentPathResolution {
        return {
            active: false,
            namedSegments: new Map(),
        };
    }

    protected computeConfigurationContext(configuration: ast.ComponentConfiguration): CfgConfigurationContext | undefined {
        const parentContext = this.getParentConfigurationContext(configuration);
        const explicitContext = configuration.context?.ref;
        const explicitComponent = ast.isComponent(explicitContext) ? explicitContext : undefined;
        const explicitAssembly = ast.isAssembly(explicitContext) ? explicitContext : undefined;
        const useExplicitContext = !this.isAssemblyBackedContext(parentContext) || Boolean(configuration.name?.unsafe);
        const resolution = parentContext && configuration.name && (!explicitContext || (this.isAssemblyBackedContext(parentContext) && !configuration.name.unsafe))
            ? this.resolveComponentPathFromContext(configuration.name, parentContext)
            : undefined;

        if (explicitAssembly && useExplicitContext) {
            return this.toAssemblyConfigurationContext(
                this.instancePathResolver.getAssemblyPathContextForAssembly(explicitAssembly)
            );
        }

        if (explicitComponent && useExplicitContext) {
            const componentStack = this.getExplicitComponentStack(explicitComponent, resolution, parentContext);
            return { component: explicitComponent, componentStack };
        }

        if (resolution?.finalAssemblyContext) {
            return this.toAssemblyConfigurationContext(resolution.finalAssemblyContext);
        }

        if (resolution?.finalStack && resolution.finalStack.length > 0) {
            return {
                component: resolution.finalStack.at(-1),
                componentStack: resolution.finalStack,
            };
        }

        return undefined;
    }

    protected computeComponentPathResolution(path: ast.Path): CfgComponentPathResolution {
        if (ast.isComponentConfiguration(path.$container)) {
            const configuration = path.$container;
            const parentContext = this.getParentConfigurationContext(configuration);
            if (this.isComponentBackedContext(parentContext)) {
                if (configuration.context?.ref) {
                    return this.createInactiveComponentPathResolution();
                }
                return {
                    active: true,
                    invalidMessage: 'A safe Component Configuration inside a Component-backed context shall declare an explicit context.',
                    invalidNode: path,
                    namedSegments: new Map(),
                };
            }
        }
        if (ast.isConfigurationUsage(path.$container)) {
            const configuration = AstUtils.getContainerOfType(path.$container, ast.isComponentConfiguration);
            const context = configuration ? this.getConfigurationContext(configuration) : undefined;
            if (this.isComponentBackedContext(context)) {
                return this.createInactiveComponentPathResolution();
            }
        }
        return this.resolveComponentPathFromContext(path, this.getBaseConfigurationContextForComponentPath(path));
    }

    protected computeFieldPathResolution(path: ast.Path): CfgFieldPathResolution {
        const configuration = AstUtils.getContainerOfType(path, ast.isComponentConfiguration);
        const context = configuration ? this.getConfigurationContext(configuration) : undefined;
        return this.typedPathResolver.resolveFieldPath(path, context?.component, componentModeFieldPathMessages, context?.bindings);
    }

    protected resolveComponentPathFromContext(
        path: ast.Path,
        context: CfgConfigurationContext | undefined,
    ): CfgComponentPathResolution {
        if (context?.assemblyContext) {
            const resolution = this.instancePathResolver.resolveAssemblyComponentPathInContext(path, context.assemblyContext);
            return {
                active: resolution.active,
                finalComponent: resolution.finalComponent,
                finalBindings: resolution.finalBindings,
                finalAssemblyContext: resolution.finalContext,
                invalidMessage: resolution.invalidMessage,
                invalidNode: resolution.invalidNode,
                namedSegments: resolution.namedSegments,
                segmentBindings: resolution.segmentBindings,
            };
        }

        const resolution = this.typedPathResolver.resolveComponentPath(path, context?.componentStack);
        return {
            active: resolution.active,
            finalComponent: resolution.finalComponent,
            finalStack: resolution.finalStack,
            parentStackForUntypedTarget: resolution.parentStackForUntypedTarget,
            invalidMessage: resolution.invalidMessage,
            invalidNode: resolution.invalidNode,
            namedSegments: resolution.namedSegments,
        };
    }

    protected getBaseConfigurationContextForComponentPath(path: ast.Path): CfgConfigurationContext | undefined {
        if (ast.isConfigurationUsage(path.$container)) {
            const configuration = AstUtils.getContainerOfType(path.$container, ast.isComponentConfiguration);
            return configuration ? this.getConfigurationContext(configuration) : undefined;
        }
        if (ast.isComponentConfiguration(path.$container)) {
            return ast.isComponentConfiguration(path.$container.$container)
                ? this.getConfigurationContext(path.$container.$container)
                : undefined;
        }
        return undefined;
    }

    protected toAssemblyConfigurationContext(assemblyContext: AssemblyPathContext | undefined): CfgConfigurationContext | undefined {
        return assemblyContext
            ? {
                component: assemblyContext.component,
                bindings: assemblyContext.bindings,
                assemblyContext,
            }
            : undefined;
    }

    protected getExplicitComponentStack(
        explicitComponent: ast.Component,
        resolution: CfgComponentPathResolution | undefined,
        parentContext: CfgConfigurationContext | undefined,
    ): readonly ast.Component[] {
        if (resolution?.finalStack && resolution.finalStack.length > 0) {
            return [...resolution.finalStack.slice(0, -1), explicitComponent];
        }
        if (resolution?.parentStackForUntypedTarget) {
            return [...resolution.parentStackForUntypedTarget, explicitComponent];
        }
        return parentContext?.componentStack ? [...parentContext.componentStack, explicitComponent] : [explicitComponent];
    }
}
