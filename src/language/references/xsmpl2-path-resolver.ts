import type { AstNode } from 'langium';
import { AstUtils, WorkspaceCache } from 'langium';
import * as ast from '../generated/ast.js';
import type { XsmpSharedServices } from '../xsmp-module.js';
import type { XsmpPathService } from './xsmp-path-service.js';
import {
    componentModeFieldPathMessages,
    type TypedComponentPathResolution,
    type TypedFieldPathResolution,
    type TypedMemberPathResolution,
    type XsmpTypedPathResolver
} from './xsmp-typed-path-resolver.js';
import * as XsmpUtils from '../utils/xsmp-utils.js';

export interface L2PathResolution<T extends ast.NamedElement = ast.NamedElement> {
    active: boolean;
    finalElement?: T;
    finalType?: ast.Type;
    finalComponent?: ast.Component;
    invalidMessage?: string;
    invalidNode?: AstNode;
    namedSegments: ReadonlyMap<ast.PathNamedSegment, readonly ast.NamedElement[]>;
}

export interface AsbInstancePathResolution {
    active: boolean;
    finalComponent?: ast.Component;
    invalidMessage?: string;
    invalidNode?: AstNode;
    namedSegments: ReadonlyMap<ast.PathNamedSegment, readonly ast.NamedElement[]>;
}

interface AssemblyNodeChild {
    member: ast.Container;
    node: AssemblyNode;
}

interface AssemblyNode {
    component?: ast.Component;
    children: Map<string, AssemblyNodeChild>;
}

type MemberKind =
    | 'field'
    | 'inputField'
    | 'outputField'
    | 'property'
    | 'operation'
    | 'entryPoint'
    | 'eventSink'
    | 'eventSource';

export class Xsmpl2PathResolver {
    protected readonly pathService: XsmpPathService;
    protected readonly typedPathResolver: XsmpTypedPathResolver;
    protected readonly assemblyNodeCache: WorkspaceCache<ast.ModelInstance, AssemblyNode>;
    protected readonly assemblyConfigPathCache: WorkspaceCache<ast.Path, AsbInstancePathResolution>;
    protected readonly assemblyFieldPathCache: WorkspaceCache<ast.Path, L2PathResolution<ast.Field>>;
    protected readonly assemblyLinkPathCache: WorkspaceCache<ast.Path, L2PathResolution>;
    protected readonly linkBaseComponentPathCache: WorkspaceCache<ast.Path, L2PathResolution>;
    protected readonly linkBaseEndpointPathCache: WorkspaceCache<ast.Path, L2PathResolution>;
    protected readonly scheduleActivityPathCache: WorkspaceCache<ast.Path, L2PathResolution>;
    protected readonly componentLinkBaseStackCache: WorkspaceCache<ast.ComponentLinkBase, readonly ast.Component[] | undefined>;
    protected readonly taskStackCache: WorkspaceCache<ast.Task, readonly ast.Component[] | undefined>;

    constructor(services: XsmpSharedServices) {
        this.pathService = services.PathService;
        this.typedPathResolver = services.TypedPathResolver;
        this.assemblyNodeCache = new WorkspaceCache<ast.ModelInstance, AssemblyNode>(services);
        this.assemblyConfigPathCache = new WorkspaceCache<ast.Path, AsbInstancePathResolution>(services);
        this.assemblyFieldPathCache = new WorkspaceCache<ast.Path, L2PathResolution<ast.Field>>(services);
        this.assemblyLinkPathCache = new WorkspaceCache<ast.Path, L2PathResolution>(services);
        this.linkBaseComponentPathCache = new WorkspaceCache<ast.Path, L2PathResolution>(services);
        this.linkBaseEndpointPathCache = new WorkspaceCache<ast.Path, L2PathResolution>(services);
        this.scheduleActivityPathCache = new WorkspaceCache<ast.Path, L2PathResolution>(services);
        this.componentLinkBaseStackCache = new WorkspaceCache<ast.ComponentLinkBase, readonly ast.Component[] | undefined>(services);
        this.taskStackCache = new WorkspaceCache<ast.Task, readonly ast.Component[] | undefined>(services);
    }

    getNamedSegmentCandidates(segment: ast.PathNamedSegment): readonly ast.NamedElement[] {
        const path = AstUtils.getContainerOfType(segment, ast.isPath);
        if (!path) {
            return [];
        }

        if (ast.isAssemblyComponentConfiguration(path.$container)) {
            return this.getAssemblyComponentPathResolution(path).namedSegments.get(segment) ?? [];
        }
        if (ast.isComponentLinkBase(path.$container)) {
            return this.getLinkBaseComponentPathResolution(path).namedSegments.get(segment) ?? [];
        }
        if (ast.isFieldValue(path.$container)) {
            const assemblyConfiguration = AstUtils.getContainerOfType(path.$container, ast.isAssemblyComponentConfiguration);
            if (assemblyConfiguration || AstUtils.getContainerOfType(path.$container, ast.isModelInstance)) {
                return this.getAssemblyFieldPathResolution(path).namedSegments.get(segment) ?? [];
            }
        }
        if (ast.isEventLink(path.$container) || ast.isFieldLink(path.$container) || ast.isInterfaceLink(path.$container)) {
            if (AstUtils.getContainerOfType(path.$container, ast.isModelInstance)) {
                return this.getAssemblyLinkPathResolution(path).namedSegments.get(segment) ?? [];
            }
            if (AstUtils.getContainerOfType(path.$container, ast.isComponentLinkBase)) {
                return this.getLinkBaseEndpointPathResolution(path).namedSegments.get(segment) ?? [];
            }
        }
        if (
            ast.isCallOperation(path.$container)
            || ast.isSetProperty(path.$container)
            || ast.isTransfer(path.$container)
            || ast.isTrigger(path.$container)
            || ast.isExecuteTask(path.$container)
        ) {
            return this.getScheduleActivityPathResolution(path).namedSegments.get(segment) ?? [];
        }

        return [];
    }

    getComponentLinkBaseComponentStack(linkBase: ast.ComponentLinkBase): readonly ast.Component[] | undefined {
        return this.componentLinkBaseStackCache.get(linkBase, () => this.computeComponentLinkBaseComponentStack(linkBase));
    }

    getEffectiveComponentLinkBaseComponent(linkBase: ast.ComponentLinkBase): ast.Component | undefined {
        return this.getComponentLinkBaseComponentStack(linkBase)?.at(-1);
    }

    getTaskComponentStack(task: ast.Task): readonly ast.Component[] | undefined {
        return this.taskStackCache.get(task, () => {
            const component = ast.isComponent(task.component?.ref) ? task.component.ref : undefined;
            return component ? [component] : undefined;
        });
    }

    getEffectiveTaskComponent(task: ast.Task): ast.Component | undefined {
        return this.getTaskComponentStack(task)?.at(-1);
    }

    getAssemblyComponentPathResolution(path: ast.Path): AsbInstancePathResolution {
        return this.assemblyConfigPathCache.get(path, () => this.computeAssemblyComponentPathResolution(path));
    }

    getAssemblyFieldPathResolution(path: ast.Path): L2PathResolution<ast.Field> {
        return this.assemblyFieldPathCache.get(path, () => this.computeAssemblyFieldPathResolution(path));
    }

    getAssemblyLinkPathResolution(path: ast.Path): L2PathResolution {
        return this.assemblyLinkPathCache.get(path, () => this.computeAssemblyLinkPathResolution(path));
    }

    getLinkBaseComponentPathResolution(path: ast.Path): L2PathResolution {
        return this.linkBaseComponentPathCache.get(path, () => this.computeLinkBaseComponentPathResolution(path));
    }

    getLinkBaseEndpointPathResolution(path: ast.Path): L2PathResolution {
        return this.linkBaseEndpointPathCache.get(path, () => this.computeLinkBaseEndpointPathResolution(path));
    }

    getScheduleActivityPathResolution(path: ast.Path): L2PathResolution {
        return this.scheduleActivityPathCache.get(path, () => this.computeScheduleActivityPathResolution(path));
    }

    protected computeComponentLinkBaseComponentStack(linkBase: ast.ComponentLinkBase): readonly ast.Component[] | undefined {
        const parent = ast.isComponentLinkBase(linkBase.$container) ? linkBase.$container : undefined;
        const parentStack = parent ? this.getComponentLinkBaseComponentStack(parent) : undefined;
        const explicitComponent = ast.isComponent(linkBase.component?.ref) ? linkBase.component.ref : undefined;
        const resolution = parentStack ? this.typedPathResolver.resolveComponentPath(linkBase.name, parentStack) : undefined;

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

    protected computeAssemblyComponentPathResolution(path: ast.Path): AsbInstancePathResolution {
        const configuration = AstUtils.getContainerOfType(path, ast.isAssemblyComponentConfiguration);
        const baseNode = configuration ? this.getAssemblyConfigurationBaseNode(configuration) : undefined;
        return this.resolveAssemblyInstancePath(path, baseNode);
    }

    protected computeAssemblyFieldPathResolution(path: ast.Path): L2PathResolution<ast.Field> {
        const fieldValue = AstUtils.getContainerOfType(path, ast.isFieldValue);
        if (!fieldValue) {
            return this.inactiveResolution();
        }

        const configuration = AstUtils.getContainerOfType(fieldValue, ast.isAssemblyComponentConfiguration);
        if (configuration) {
            const target = this.getAssemblyComponentPathResolution(configuration.name);
            return this.typedFieldResolutionToL2(this.typedPathResolver.resolveFieldPath(path, target.finalComponent, componentModeFieldPathMessages));
        }

        const model = AstUtils.getContainerOfType(fieldValue, ast.isModelInstance);
        return this.typedFieldResolutionToL2(this.typedPathResolver.resolveFieldPath(path, this.getModelComponent(model), componentModeFieldPathMessages));
    }

    protected computeAssemblyLinkPathResolution(path: ast.Path): L2PathResolution {
        const link = AstUtils.getContainerOfType(path, ast.isLink);
        const model = link ? AstUtils.getContainerOfType(link, ast.isModelInstance) : undefined;
        const baseNode = model ? this.getAssemblyNode(model) : undefined;
        if (!link || !baseNode) {
            return this.inactiveResolution();
        }

        if (ast.isEventLink(link)) {
            const expectedKind = path === link.ownerPath ? 'eventSource' : 'eventSink';
            return this.resolveAssemblyMemberPath(path, baseNode, [expectedKind]);
        }
        if (ast.isFieldLink(link)) {
            const expectedKind = path === link.ownerPath ? 'outputField' : 'inputField';
            return this.resolveAssemblyFieldEndpointPath(path, baseNode, expectedKind);
        }
        if (ast.isInterfaceLink(link)) {
            return this.resolveAssemblyInstancePathAsMember(path, baseNode);
        }

        return this.inactiveResolution();
    }

    protected computeLinkBaseComponentPathResolution(path: ast.Path): L2PathResolution {
        const baseStack = this.getBaseStackForLinkBaseComponentPath(path);
        return this.typedComponentResolutionToL2(baseStack ? this.typedPathResolver.resolveComponentPath(path, baseStack) : undefined);
    }

    protected computeLinkBaseEndpointPathResolution(path: ast.Path): L2PathResolution {
        const link = AstUtils.getContainerOfType(path, ast.isLink);
        const componentLinkBase = link ? AstUtils.getContainerOfType(link, ast.isComponentLinkBase) : undefined;
        const baseStack = componentLinkBase ? this.getComponentLinkBaseComponentStack(componentLinkBase) : undefined;
        if (!link || !baseStack) {
            return this.inactiveResolution();
        }

        if (ast.isEventLink(link)) {
            return this.resolveComponentMemberPath(path, baseStack, [path === link.ownerPath ? 'eventSource' : 'eventSink']);
        }
        if (ast.isFieldLink(link)) {
            return this.resolveComponentFieldEndpointPath(path, baseStack, path === link.ownerPath ? 'outputField' : 'inputField');
        }
        if (ast.isInterfaceLink(link)) {
            return this.typedComponentResolutionToL2(this.typedPathResolver.resolveComponentPath(path, baseStack));
        }

        return this.inactiveResolution();
    }

    protected computeScheduleActivityPathResolution(path: ast.Path): L2PathResolution {
        if (ast.isExecuteTask(path.$container)) {
            const task = AstUtils.getContainerOfType(path.$container, ast.isTask);
            const baseStack = task ? this.getTaskComponentStack(task) : undefined;
            return this.typedComponentResolutionToL2(baseStack ? this.typedPathResolver.resolveComponentPath(path, baseStack) : undefined);
        }

        const task = AstUtils.getContainerOfType(path.$container, ast.isTask);
        const baseStack = task ? this.getTaskComponentStack(task) : undefined;
        if (!baseStack) {
            return this.inactiveResolution();
        }

        if (ast.isCallOperation(path.$container)) {
            return this.resolveComponentMemberPath(path, baseStack, ['operation']);
        }
        if (ast.isSetProperty(path.$container)) {
            return this.resolveComponentMemberPath(path, baseStack, ['property']);
        }
        if (ast.isTransfer(path.$container)) {
            return this.resolveComponentFieldEndpointPath(
                path,
                baseStack,
                path === path.$container.outputFieldPath ? 'outputField' : 'inputField'
            );
        }
        if (ast.isTrigger(path.$container)) {
            return this.resolveComponentMemberPath(path, baseStack, ['entryPoint']);
        }

        return this.inactiveResolution();
    }

    protected getBaseStackForLinkBaseComponentPath(path: ast.Path): readonly ast.Component[] | undefined {
        if (ast.isComponentLinkBase(path.$container)) {
            return ast.isComponentLinkBase(path.$container.$container)
                ? this.getComponentLinkBaseComponentStack(path.$container.$container)
                : undefined;
        }
        if (ast.isLink(path.$container)) {
            const componentLinkBase = AstUtils.getContainerOfType(path.$container, ast.isComponentLinkBase);
            return componentLinkBase ? this.getComponentLinkBaseComponentStack(componentLinkBase) : undefined;
        }
        return undefined;
    }

    protected resolveAssemblyInstancePath(path: ast.Path, baseNode: AssemblyNode | undefined): AsbInstancePathResolution {
        const namedSegments = new Map<ast.PathNamedSegment, readonly ast.NamedElement[]>();
        if (!baseNode) {
            return { active: false, namedSegments };
        }

        const segments = this.pathService.getPathSegments(path);
        if (segments.length === 0) {
            if (path.absolute) {
                return {
                    active: true,
                    finalComponent: baseNode.component,
                    namedSegments,
                };
            }
            return {
                active: true,
                invalidMessage: 'A path shall not be empty.',
                invalidNode: path,
                namedSegments,
            };
        }

        let currentNode = baseNode;
        for (const segment of segments) {
            if (ast.isPathIndex(segment)) {
                return {
                    active: true,
                    invalidMessage: 'Assembly instance paths shall only contain child instance names.',
                    invalidNode: segment,
                    namedSegments,
                };
            }

            const actualSegment = ast.isPathMember(segment) ? segment.segment : segment;
            if (ast.isPathSelfSegment(actualSegment)) {
                continue;
            }
            if (ast.isPathParentSegment(actualSegment)) {
                return {
                    active: true,
                    invalidMessage: 'Assembly instance paths shall not contain \'..\'.',
                    invalidNode: actualSegment,
                    namedSegments,
                };
            }

            const candidates = [...currentNode.children.values()].map(child => child.member);
            namedSegments.set(actualSegment, candidates);
            const segmentText = this.pathService.getSegmentText(actualSegment);
            const next = currentNode.children.get(segmentText);
            if (!next) {
                return {
                    active: true,
                    invalidMessage: `The path segment '${segmentText}' shall resolve to a child Model Instance or Assembly Instance.`,
                    invalidNode: actualSegment,
                    namedSegments,
                };
            }
            currentNode = next.node;
        }

        return {
            active: true,
            finalComponent: currentNode.component,
            namedSegments,
        };
    }

    protected resolveAssemblyInstancePathAsMember(path: ast.Path, baseNode: AssemblyNode | undefined): L2PathResolution {
        const resolution = this.resolveAssemblyInstancePath(path, baseNode);
        return {
            active: resolution.active,
            finalComponent: resolution.finalComponent,
            invalidMessage: resolution.invalidMessage,
            invalidNode: resolution.invalidNode,
            namedSegments: resolution.namedSegments,
        };
    }

    protected resolveAssemblyMemberPath(
        path: ast.Path,
        baseNode: AssemblyNode | undefined,
        memberKinds: MemberKind[],
    ): L2PathResolution {
        const namedSegments = new Map<ast.PathNamedSegment, readonly ast.NamedElement[]>();
        if (!baseNode) {
            return { active: false, namedSegments };
        }

        const segments = this.pathService.getPathSegments(path);
        if (segments.length === 0) {
            return {
                active: true,
                invalidMessage: 'A path shall not be empty.',
                invalidNode: path,
                namedSegments,
            };
        }

        let currentNode = baseNode;
        for (let index = 0; index < segments.length; index++) {
            const segment = segments[index];
            if (ast.isPathIndex(segment)) {
                return {
                    active: true,
                    invalidMessage: 'This path kind shall not use array indices.',
                    invalidNode: segment,
                    namedSegments,
                };
            }

            const actualSegment = ast.isPathMember(segment) ? segment.segment : segment;
            if (ast.isPathSelfSegment(actualSegment)) {
                continue;
            }
            if (ast.isPathParentSegment(actualSegment)) {
                return {
                    active: true,
                    invalidMessage: 'Assembly paths shall not contain \'..\'.',
                    invalidNode: actualSegment,
                    namedSegments,
                };
            }

            const isLast = index === segments.length - 1;
            if (isLast) {
                const candidates = this.getComponentMembers(currentNode.component, memberKinds);
                namedSegments.set(actualSegment, candidates);
                const resolved = this.typedPathResolver.resolveNamedElement(actualSegment, candidates);
                if (!resolved) {
                    return {
                        active: true,
                        finalComponent: currentNode.component,
                        invalidMessage: `The path segment '${this.pathService.getSegmentText(actualSegment)}' shall resolve to a supported member of the current Component.`,
                        invalidNode: actualSegment,
                        namedSegments,
                    };
                }
                return {
                    active: true,
                    finalElement: resolved,
                    finalType: this.getMemberType(resolved),
                    finalComponent: currentNode.component,
                    namedSegments,
                };
            }

            const candidates = [...currentNode.children.values()].map(child => child.member);
            namedSegments.set(actualSegment, candidates);
            const next = currentNode.children.get(this.pathService.getSegmentText(actualSegment));
            if (!next) {
                return {
                    active: true,
                    finalComponent: currentNode.component,
                    invalidMessage: `The path segment '${this.pathService.getSegmentText(actualSegment)}' shall resolve to a child Model Instance or Assembly Instance.`,
                    invalidNode: actualSegment,
                    namedSegments,
                };
            }
            currentNode = next.node;
        }

        return { active: true, finalComponent: currentNode.component, namedSegments };
    }

    protected resolveAssemblyFieldEndpointPath(
        path: ast.Path,
        baseNode: AssemblyNode | undefined,
        requiredKind: 'inputField' | 'outputField',
    ): L2PathResolution<ast.Field> {
        const namedSegments = new Map<ast.PathNamedSegment, readonly ast.NamedElement[]>();
        if (!baseNode) {
            return { active: false, namedSegments };
        }

        const segments = this.pathService.getPathSegments(path);
        if (segments.length === 0) {
            return {
                active: true,
                invalidMessage: 'A path shall not be empty.',
                invalidNode: path,
                namedSegments,
            };
        }

        let currentNode = baseNode;
        for (let index = 0; index < segments.length; index++) {
            const segment = segments[index];
            if (ast.isPathIndex(segment)) {
                return {
                    active: true,
                    invalidMessage: 'Field paths shall start with a Field.',
                    invalidNode: segment,
                    namedSegments,
                };
            }

            const actualSegment = ast.isPathMember(segment) ? segment.segment : segment;
            if (ast.isPathSelfSegment(actualSegment)) {
                continue;
            }
            if (ast.isPathParentSegment(actualSegment)) {
                return {
                    active: true,
                    invalidMessage: 'Assembly paths shall not contain \'..\'.',
                    invalidNode: actualSegment,
                    namedSegments,
                };
            }

            const child = currentNode.children.get(this.pathService.getSegmentText(actualSegment));
            const fieldCandidates = this.getComponentMembers(currentNode.component, [requiredKind]) as ast.Field[];
            const resolvedField = this.typedPathResolver.resolveNamedElement(actualSegment, fieldCandidates);
            if (!child || index === segments.length - 1) {
                namedSegments.set(actualSegment, fieldCandidates);
                if (!resolvedField) {
                    return {
                        active: true,
                        finalComponent: currentNode.component,
                        invalidMessage: `The path segment '${this.pathService.getSegmentText(actualSegment)}' shall resolve to a ${requiredKind === 'outputField' ? 'Field marked as Output' : 'Field marked as Input'} of the current Component.`,
                        invalidNode: actualSegment,
                        namedSegments,
                    };
                }
                const tail = this.typedPathResolver.resolveFieldTail(
                    segments,
                    index + 1,
                    resolvedField,
                    resolvedField.type.ref,
                    (fieldSegment, candidates) => namedSegments.set(fieldSegment, candidates),
                    'Field paths shall only use field names, "." member access and array indices.',
                    (segmentText) => `The path segment '${segmentText}' requires a Structure-typed parent value.`,
                    (segmentText) => `The path segment '${segmentText}' shall resolve to a Field of the current Structure value.`,
                );
                return {
                    active: true,
                    finalElement: tail.finalField,
                    finalType: tail.finalType,
                    finalComponent: currentNode.component,
                    invalidMessage: tail.invalidMessage,
                    invalidNode: tail.invalidNode,
                    namedSegments,
                };
            }

            namedSegments.set(actualSegment, [child.member]);
            currentNode = child.node;
        }

        return { active: true, finalComponent: currentNode.component, namedSegments };
    }

    protected resolveComponentMemberPath(
        path: ast.Path,
        baseStack: readonly ast.Component[] | undefined,
        memberKinds: MemberKind[],
    ): L2PathResolution {
        return this.typedMemberResolutionToL2(this.typedPathResolver.resolveComponentMemberPath(path, baseStack, {
            getFinalCandidates: (component) => this.getComponentMembers(component, memberKinds),
            getFinalType: (element) => this.getMemberType(element),
            indexMessage: 'This path kind shall not use array indices.',
            containerOrReferenceMessage: (segmentText) => `The path segment '${segmentText}' shall resolve to a Container or Reference of the current Component.`,
            finalMissingMessage: (segmentText) => `The path segment '${segmentText}' shall resolve to a supported member of the current Component.`,
            parentMessage: 'The path segment ".." shall not navigate above the typed component context.',
        }));
    }

    protected resolveComponentFieldEndpointPath(
        path: ast.Path,
        baseStack: readonly ast.Component[] | undefined,
        requiredKind: 'inputField' | 'outputField',
    ): L2PathResolution<ast.Field> {
        return this.typedMemberResolutionToL2(this.typedPathResolver.resolveComponentFieldPath(path, baseStack, {
            getFinalCandidates: (component) => this.getComponentMembers(component, [requiredKind]) as ast.Field[],
            indexMessage: 'Field paths shall start with a Field.',
            containerOrReferenceMessage: (segmentText) => `The path segment '${segmentText}' shall resolve to a Container or Reference of the current Component.`,
            finalMissingMessage: (segmentText) => `The path segment '${segmentText}' shall resolve to a ${requiredKind === 'outputField' ? 'Field marked as Output' : 'Field marked as Input'} of the current Component.`,
            pathRuleMessage: 'Field paths shall only use field names, "." member access and array indices.',
            structureRequiredMessage: (segmentText) => `The path segment '${segmentText}' requires a Structure-typed parent value.`,
            structureFieldMessage: (segmentText) => `The path segment '${segmentText}' shall resolve to a Field of the current Structure value.`,
            parentMessage: 'The path segment ".." shall not navigate above the typed component context.',
        }));
    }

    protected typedFieldResolutionToL2(resolution: TypedFieldPathResolution): L2PathResolution<ast.Field> {
        return {
            active: resolution.active,
            finalElement: resolution.finalField,
            finalType: resolution.finalType,
            invalidMessage: resolution.invalidMessage,
            invalidNode: resolution.invalidNode,
            namedSegments: resolution.namedSegments,
        };
    }

    protected typedComponentResolutionToL2(resolution: TypedComponentPathResolution | undefined): L2PathResolution {
        if (!resolution) {
            return this.inactiveResolution();
        }
        return {
            active: resolution.active,
            finalComponent: resolution.finalComponent,
            invalidMessage: resolution.invalidMessage,
            invalidNode: resolution.invalidNode,
            namedSegments: resolution.namedSegments,
        };
    }

    protected typedMemberResolutionToL2<T extends ast.NamedElement>(resolution: TypedMemberPathResolution<T>): L2PathResolution<T> {
        return {
            active: resolution.active,
            finalElement: resolution.finalElement,
            finalType: resolution.finalType,
            finalComponent: resolution.finalComponent,
            invalidMessage: resolution.invalidMessage,
            invalidNode: resolution.invalidNode,
            namedSegments: resolution.namedSegments,
        };
    }

    protected inactiveResolution<T extends ast.NamedElement>(): L2PathResolution<T> {
        return { active: false, namedSegments: new Map() };
    }

    protected getAssemblyConfigurationBaseNode(configuration: ast.AssemblyComponentConfiguration): AssemblyNode | undefined {
        if (ast.isAssembly(configuration.$container)) {
            return this.getAssemblyNode(configuration.$container.model);
        }
        if (ast.isAssemblyInstance(configuration.$container)) {
            return this.getAssemblyNodeForAssemblyInstance(configuration.$container);
        }
        return undefined;
    }

    protected getAssemblyNode(model: ast.ModelInstance | undefined): AssemblyNode | undefined {
        return model ? this.assemblyNodeCache.get(model, () => this.computeAssemblyNode(model)) : undefined;
    }

    protected getAssemblyNodeForAssemblyInstance(instance: ast.AssemblyInstance | undefined): AssemblyNode | undefined {
        return this.getAssemblyNode(instance?.assembly.ref?.model);
    }

    protected computeAssemblyNode(model: ast.ModelInstance): AssemblyNode {
        const component = this.getModelComponent(model);
        const children = new Map<string, AssemblyNodeChild>();
        for (const subInstance of model.elements.filter(ast.isSubInstance)) {
            if (!subInstance.container) {
                continue;
            }
            const childNode = ast.isModelInstance(subInstance.instance)
                ? this.getAssemblyNode(subInstance.instance)
                : ast.isAssemblyInstance(subInstance.instance)
                    ? this.getAssemblyNodeForAssemblyInstance(subInstance.instance)
                    : undefined;
            const member = this.typedPathResolver
                .getComponentPathMembers(component)
                .find((candidate): candidate is ast.Container => ast.isContainer(candidate) && candidate.name === subInstance.container);
            if (member && childNode) {
                children.set(subInstance.container, { member, node: childNode });
            }
        }
        return { component, children };
    }

    protected getModelComponent(model: ast.ModelInstance | undefined): ast.Component | undefined {
        return model && ast.isComponent(model.implementation?.ref) ? model.implementation.ref : undefined;
    }

    protected getComponentMembers(component: ast.Component | undefined, kinds: readonly MemberKind[]): readonly ast.NamedElement[] {
        const result = new Map<string, ast.NamedElement>();
        this.collectComponentMembers(component, result, new Set<ast.Type>(), kinds);
        return [...result.values()];
    }

    protected collectComponentMembers(
        type: ast.Type | undefined,
        members: Map<string, ast.NamedElement>,
        visited: Set<ast.Type>,
        kinds: readonly MemberKind[],
    ): void {
        if (!type || visited.has(type)) {
            return;
        }
        visited.add(type);

        if (ast.isComponent(type) || ast.isInterface(type)) {
            for (const element of type.elements) {
                if (element.name && this.matchesMemberKind(element, kinds) && !members.has(element.name)) {
                    members.set(element.name, element);
                }
            }
        }

        if (ast.isComponent(type)) {
            this.collectComponentMembers(type.base?.ref, members, visited, kinds);
            for (const base of type.interface) {
                this.collectComponentMembers(base.ref, members, visited, kinds);
            }
        } else if (ast.isInterface(type)) {
            for (const base of type.base) {
                this.collectComponentMembers(base.ref, members, visited, kinds);
            }
        }
    }

    protected matchesMemberKind(element: ast.NamedElement, kinds: readonly MemberKind[]): boolean {
        return kinds.some(kind => {
            switch (kind) {
                case 'field':
                    return ast.isField(element);
                case 'inputField':
                    return ast.isField(element) && XsmpUtils.isInput(element);
                case 'outputField':
                    return ast.isField(element) && XsmpUtils.isOutput(element);
                case 'property':
                    return ast.isProperty(element);
                case 'operation':
                    return ast.isOperation(element);
                case 'entryPoint':
                    return ast.isEntryPoint(element);
                case 'eventSink':
                    return ast.isEventSink(element);
                case 'eventSource':
                    return ast.isEventSource(element);
            }
        });
    }

    protected getMemberType(element: ast.NamedElement | undefined): ast.Type | undefined {
        if (!element) {
            return undefined;
        }
        if (ast.isField(element) || ast.isProperty(element) || ast.isEventSink(element) || ast.isEventSource(element)) {
            return element.type.ref;
        }
        return undefined;
    }

}
