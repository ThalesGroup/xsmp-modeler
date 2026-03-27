import type { AstNode } from 'langium';
import { AstUtils, WorkspaceCache } from 'langium';
import * as ast from '../generated/ast-partial.js';
import type { XsmpSharedServices } from '../xsmp-module.js';
import type { XsmpPathService } from './xsmp-path-service.js';
import type { IdentifierPatternService, TemplateBindings } from './identifier-pattern-service.js';
import {
    componentModeFieldPathMessages,
    type TypedComponentPathResolution,
    type TypedFieldPathResolution,
    type TypedMemberPathResolution,
    type XsmpTypedPathResolver
} from './xsmp-typed-path-resolver.js';
import * as XsmpUtils from '../utils/xsmp-utils.js';

type RecoverableType = ast.Type;
type RecoverableComponent = ast.Component;

export interface L2PathResolution<T extends ast.NamedElement = ast.NamedElement> {
    active: boolean;
    finalElement?: T;
    finalType?: ast.Type;
    finalComponent?: ast.Component;
    finalBindings?: TemplateBindings;
    invalidMessage?: string;
    invalidNode?: AstNode;
    namedSegments: ReadonlyMap<ast.PathNamedSegment, readonly ast.NamedElement[]>;
    segmentBindings?: ReadonlyMap<ast.PathNamedSegment, TemplateBindings | undefined>;
}

export interface AsbInstancePathResolution {
    active: boolean;
    finalComponent?: ast.Component;
    finalBindings?: TemplateBindings;
    finalContext?: AssemblyPathContext;
    invalidMessage?: string;
    invalidNode?: AstNode;
    namedSegments: ReadonlyMap<ast.PathNamedSegment, readonly ast.NamedElement[]>;
    segmentBindings?: ReadonlyMap<ast.PathNamedSegment, TemplateBindings | undefined>;
}

export interface AssemblyPathContext {
    component?: ast.Component;
    bindings?: TemplateBindings;
    assembly?: ast.Assembly;
    instance?: ast.ModelInstance | ast.AssemblyInstance;
}

interface TaskExecutionContext {
    component?: ast.Component;
    bindings?: TemplateBindings;
    componentStack?: readonly ast.Component[];
    assemblyContext?: AssemblyPathContext;
}

export interface InterfaceLinkSourceResolution extends L2PathResolution<ast.Reference> {
    ownerPath?: ast.Path;
    ownerText: string;
    referenceText: string;
}

interface AssemblyNodeChild {
    member: ast.Container;
    instance: ast.ModelInstance | ast.AssemblyInstance;
    node: AssemblyNode;
}

interface AssemblyNode {
    component?: ast.Component;
    bindings?: TemplateBindings;
    children: AssemblyNodeChild[];
}

type MemberKind =
    | 'field'
    | 'inputField'
    | 'outputField'
    | 'property'
    | 'operation'
    | 'reference'
    | 'entryPoint'
    | 'eventSink'
    | 'eventSource';

export class Xsmpl2PathResolver {
    protected readonly pathService: XsmpPathService;
    protected readonly identifierPatternService: IdentifierPatternService;
    protected readonly typedPathResolver: XsmpTypedPathResolver;
    protected readonly assemblyNodeCache: WorkspaceCache<ast.ModelInstance, Map<string, AssemblyNode>>;
    protected readonly assemblyConfigPathCache: WorkspaceCache<ast.Path, AsbInstancePathResolution>;
    protected readonly assemblyFieldPathCache: WorkspaceCache<ast.Path, L2PathResolution<ast.Field>>;
    protected readonly assemblyLinkPathCache: WorkspaceCache<ast.Path, L2PathResolution>;
    protected readonly linkBaseComponentPathCache: WorkspaceCache<ast.Path, L2PathResolution>;
    protected readonly linkBaseEndpointPathCache: WorkspaceCache<ast.Path, L2PathResolution>;
    protected readonly scheduleActivityPathCache: WorkspaceCache<ast.Path, L2PathResolution>;
    protected readonly componentLinkBaseStackCache: WorkspaceCache<ast.ComponentLinkBase, readonly ast.Component[] | undefined>;
    protected readonly taskExecutionContextCache: WorkspaceCache<ast.Task, TaskExecutionContext | undefined>;

    constructor(services: XsmpSharedServices) {
        this.pathService = services.PathService;
        this.identifierPatternService = services.IdentifierPatternService;
        this.typedPathResolver = services.TypedPathResolver;
        this.assemblyNodeCache = new WorkspaceCache<ast.ModelInstance, Map<string, AssemblyNode>>(services);
        this.assemblyConfigPathCache = new WorkspaceCache<ast.Path, AsbInstancePathResolution>(services);
        this.assemblyFieldPathCache = new WorkspaceCache<ast.Path, L2PathResolution<ast.Field>>(services);
        this.assemblyLinkPathCache = new WorkspaceCache<ast.Path, L2PathResolution>(services);
        this.linkBaseComponentPathCache = new WorkspaceCache<ast.Path, L2PathResolution>(services);
        this.linkBaseEndpointPathCache = new WorkspaceCache<ast.Path, L2PathResolution>(services);
        this.scheduleActivityPathCache = new WorkspaceCache<ast.Path, L2PathResolution>(services);
        this.componentLinkBaseStackCache = new WorkspaceCache<ast.ComponentLinkBase, readonly ast.Component[] | undefined>(services);
        this.taskExecutionContextCache = new WorkspaceCache<ast.Task, TaskExecutionContext | undefined>(services);
    }

    getFieldCandidatesForType(type: RecoverableType | undefined): readonly ast.Field[] {
        return this.typedPathResolver.getFieldCandidatesForType(type);
    }

    getComponentPathMembers(component: RecoverableComponent | undefined): ReadonlyArray<ast.Container | ast.Reference> {
        return this.typedPathResolver.getComponentPathMembers(component);
    }

    getComponentMembersByKind(component: RecoverableComponent | undefined, kinds: readonly MemberKind[]): readonly ast.NamedElement[] {
        return this.getComponentMembers(component as ast.Component | undefined, kinds);
    }

    resolveReferenceSegmentTarget(
        segment: ast.PathNamedSegment | undefined,
        component: ast.Component | undefined,
        bindings?: TemplateBindings,
    ): ast.Reference | undefined {
        const candidates = this.getComponentMembers(component, ['reference']);
        const resolved = this.resolveNamedSegmentTarget(segment, candidates, bindings);
        return ast.isReference(resolved) ? resolved : undefined;
    }

    getNamedSegmentCandidates(segment: ast.PathNamedSegment | undefined): readonly ast.NamedElement[] {
        return this.getNamedSegmentContext(segment).candidates;
    }

    getNamedSegmentResolutionContext(segment: ast.PathNamedSegment | undefined): {
        candidates: readonly ast.NamedElement[];
        bindings?: TemplateBindings;
    } {
        return this.getNamedSegmentContext(segment);
    }

    getNamedSegmentTarget(segment: ast.PathNamedSegment | undefined): ast.NamedElement | undefined {
        const { candidates, bindings } = this.getNamedSegmentContext(segment);
        return this.resolveNamedSegmentTarget(segment, candidates, bindings);
    }

    getAssemblyLocalComponentContext(node: AstNode): {
        component?: ast.Component;
        bindings?: TemplateBindings;
    } {
        return this.getAssemblyLocalContext(node);
    }

    getInterfaceLinkEndpointContext(
        link: ast.InterfaceLink,
        side: 'owner' | 'client',
    ): {
        component?: ast.Component;
        bindings?: TemplateBindings;
    } {
        return this.getInterfaceLinkEndpointComponent(link, side);
    }

    getInterfaceLinkSourceResolution(link: ast.InterfaceLink): InterfaceLinkSourceResolution {
        if (!link.sourcePath) {
            return {
                active: false,
                ownerText: '.',
                referenceText: '',
                namedSegments: new Map(),
                segmentBindings: new Map(),
            };
        }
        if (AstUtils.getContainerOfType(link, ast.isModelInstance)) {
            return this.computeAssemblyInterfaceLinkSourceResolution(link.sourcePath);
        }
        if (AstUtils.getContainerOfType(link, ast.isComponentLinkBase)) {
            return this.computeLinkBaseInterfaceLinkSourceResolution(link.sourcePath);
        }
        return {
            active: false,
            ownerText: '.',
            referenceText: '',
            namedSegments: new Map(),
            segmentBindings: new Map(),
        };
    }

    getLocalNamedReferenceCandidates(reference: ast.LocalNamedReference): readonly ast.NamedElement[] {
        return this.getLocalNamedReferenceContext(reference).candidates;
    }

    getLocalNamedReferenceTarget(reference: ast.LocalNamedReference | undefined): ast.NamedElement | undefined {
        if (!reference) {
            return undefined;
        }
        const { candidates } = this.getLocalNamedReferenceContext(reference);
        const target = reference.reference?.ref;
        if (target && candidates.includes(target)) {
            return target;
        }
        const referenceText = this.pathService.getLocalNamedReferenceText(reference);
        return referenceText ? candidates.find(candidate => candidate.name === referenceText) : undefined;
    }

    protected getNamedSegmentContext(segment: ast.PathNamedSegment | undefined): {
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

        if (ast.isAssemblyComponentConfiguration(path.$container)) {
            const resolution = this.getAssemblyComponentPathResolution(path);
            return {
                candidates: resolution.namedSegments.get(segment) ?? [],
                bindings: resolution.segmentBindings?.get(segment),
            };
        }
        if (ast.isComponentLinkBase(path.$container)) {
            const resolution = this.getLinkBaseComponentPathResolution(path);
            return {
                candidates: resolution.namedSegments.get(segment) ?? [],
                bindings: resolution.segmentBindings?.get(segment),
            };
        }
        if (ast.isFieldValue(path.$container)) {
            const assemblyConfiguration = AstUtils.getContainerOfType(path.$container, ast.isAssemblyComponentConfiguration);
            if (assemblyConfiguration || AstUtils.getContainerOfType(path.$container, ast.isModelInstance)) {
                const resolution = this.getAssemblyFieldPathResolution(path);
                return {
                    candidates: resolution.namedSegments.get(segment) ?? [],
                    bindings: resolution.segmentBindings?.get(segment),
                };
            }
        }
        if (ast.isEventLink(path.$container) || ast.isFieldLink(path.$container) || ast.isInterfaceLink(path.$container)) {
            if (AstUtils.getContainerOfType(path.$container, ast.isModelInstance)) {
                const resolution = this.getAssemblyLinkPathResolution(path);
                return {
                    candidates: resolution.namedSegments.get(segment) ?? [],
                    bindings: resolution.segmentBindings?.get(segment),
                };
            }
            if (AstUtils.getContainerOfType(path.$container, ast.isComponentLinkBase)) {
                const resolution = this.getLinkBaseEndpointPathResolution(path);
                return {
                    candidates: resolution.namedSegments.get(segment) ?? [],
                    bindings: resolution.segmentBindings?.get(segment),
                };
            }
        }
        if (
            ast.isCallOperation(path.$container)
            || ast.isSetProperty(path.$container)
            || ast.isTransfer(path.$container)
            || ast.isTrigger(path.$container)
            || ast.isExecuteTask(path.$container)
        ) {
            const resolution = this.getScheduleActivityPathResolution(path);
            return {
                candidates: resolution.namedSegments.get(segment) ?? [],
                bindings: resolution.segmentBindings?.get(segment),
            };
        }

        return { candidates: [] };
    }

    protected getLocalNamedReferenceContext(reference: ast.LocalNamedReference | undefined): {
        candidates: readonly ast.NamedElement[];
        component?: ast.Component;
        bindings?: TemplateBindings;
    } {
        if (!reference) {
            return { candidates: [] };
        }
        const container = reference.$container;

        if (ast.isSubInstance(container) && container.container === reference) {
            const parent = ast.isModelInstance(container.$container) ? container.$container : undefined;
            const component = parent && ast.isComponent(parent.implementation?.ref) ? parent.implementation.ref : undefined;
            return {
                candidates: this.getComponentPathMembers(component).filter(ast.isContainer),
                component,
            };
        }

        if (ast.isGlobalEventHandler(container) && container.entryPoint === reference) {
            const context = this.getAssemblyLocalContext(container);
            return {
                candidates: this.getComponentMembers(context.component, ['entryPoint']),
                component: context.component,
                bindings: context.bindings,
            };
        }

        if (ast.isOperationCall(container) && container.operation === reference) {
            const context = this.getAssemblyLocalContext(container);
            return {
                candidates: this.getComponentMembers(context.component, ['operation']),
                component: context.component,
                bindings: context.bindings,
            };
        }

        if (ast.isPropertyValue(container) && container.property === reference) {
            const context = this.getAssemblyLocalContext(container);
            return {
                candidates: this.getComponentMembers(context.component, ['property']),
                component: context.component,
                bindings: context.bindings,
            };
        }

        if (ast.isInterfaceLink(container)) {
            const property = (reference as AstNode & { $containerProperty?: string }).$containerProperty;
            if (property === ast.InterfaceLink.backReference || container.backReference === reference) {
                const resolution = this.getInterfaceLinkEndpointComponent(container, 'client');
                return {
                    candidates: this.getComponentMembers(resolution.component, ['reference']),
                    component: resolution.component,
                    bindings: resolution.bindings,
                };
            }
        }

        return { candidates: [] };
    }

    getComponentLinkBaseComponentStack(linkBase: ast.ComponentLinkBase): readonly ast.Component[] | undefined {
        return this.componentLinkBaseStackCache.get(linkBase, () => this.computeComponentLinkBaseComponentStack(linkBase));
    }

    getEffectiveComponentLinkBaseComponent(linkBase: ast.ComponentLinkBase): ast.Component | undefined {
        return this.getComponentLinkBaseComponentStack(linkBase)?.at(-1);
    }

    getTaskExecutionContextStack(task: ast.Task): readonly ast.Component[] | undefined {
        return this.getTaskExecutionContext(task)?.componentStack;
    }

    getEffectiveTaskExecutionContext(task: ast.Task): ast.Component | undefined {
        return this.getTaskExecutionContext(task)?.component;
    }

    getAssemblyComponentPathResolution(path: ast.Path): AsbInstancePathResolution {
        return this.assemblyConfigPathCache.get(path, () => this.computeAssemblyComponentPathResolution(path));
    }

    getAssemblyPathContextForAssembly(
        assembly: ast.Assembly | undefined,
    ): AssemblyPathContext | undefined {
        if (!assembly) {
            return undefined;
        }
        const bindings = this.createTemplateBindings(assembly.parameters);
        const node = this.getAssemblyNode(assembly.model, bindings);
        return this.createAssemblyPathContext(node, { assembly });
    }

    getAssemblyPathContextForInstance(
        instance: ast.ModelInstance | ast.AssemblyInstance | undefined,
        bindings?: TemplateBindings,
    ): AssemblyPathContext | undefined {
        if (!instance) {
            return undefined;
        }
        const node = ast.isModelInstance(instance)
            ? this.getAssemblyNode(instance, bindings)
            : this.getAssemblyNodeForAssemblyInstance(instance);
        return this.createAssemblyPathContext(node, { instance });
    }

    resolveAssemblyComponentPathInContext(
        path: ast.Path,
        context: AssemblyPathContext | undefined,
        inheritedBindings?: TemplateBindings,
    ): AsbInstancePathResolution {
        return this.resolveAssemblyInstancePath(path, this.getAssemblyBaseNode(context), context, inheritedBindings);
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
        const parentStack = parent ? this.getComponentLinkBaseComponentStack(parent) : this.getRootLinkBaseComponentStack(linkBase);
        const bindings = this.getLinkBaseTemplateBindings(linkBase);
        const resolution = parentStack && linkBase.name ? this.typedPathResolver.resolveComponentPath(linkBase.name, parentStack, bindings) : undefined;
        return resolution?.finalStack;
    }

    protected computeAssemblyComponentPathResolution(path: ast.Path): AsbInstancePathResolution {
        const configuration = AstUtils.getContainerOfType(path, ast.isAssemblyComponentConfiguration);
        const baseContext = configuration ? this.getAssemblyConfigurationBaseContext(configuration) : undefined;
        return this.resolveAssemblyComponentPathInContext(path, baseContext);
    }

    protected computeAssemblyFieldPathResolution(path: ast.Path): L2PathResolution<ast.Field> {
        const fieldValue = AstUtils.getContainerOfType(path, ast.isFieldValue);
        if (!fieldValue) {
            return this.inactiveResolution();
        }

        const configuration = AstUtils.getContainerOfType(fieldValue, ast.isAssemblyComponentConfiguration);
        if (configuration?.name) {
            const target = this.getAssemblyComponentPathResolution(configuration.name);
            return this.typedFieldResolutionToL2(
                this.typedPathResolver.resolveFieldPath(path, target.finalComponent, componentModeFieldPathMessages, target.finalBindings),
                target.finalBindings
            );
        }

        const model = AstUtils.getContainerOfType(fieldValue, ast.isModelInstance);
        const assemblyNode = model ? this.getAssemblyNode(model, this.getAssemblyTemplateBindings(path)) : undefined;
        return this.typedFieldResolutionToL2(
            this.typedPathResolver.resolveFieldPath(path, assemblyNode?.component, componentModeFieldPathMessages, assemblyNode?.bindings),
            assemblyNode?.bindings
        );
    }

    protected getAssemblyLocalContext(node: AstNode): {
        component?: ast.Component;
        bindings?: TemplateBindings;
    } {
        const configuration = AstUtils.getContainerOfType(node, ast.isAssemblyComponentConfiguration);
        if (configuration?.name) {
            const resolution = this.getAssemblyComponentPathResolution(configuration.name);
            return {
                component: resolution.finalComponent,
                bindings: resolution.finalBindings,
            };
        }

        const model = AstUtils.getContainerOfType(node, ast.isModelInstance);
        const assemblyNode = model ? this.getAssemblyNode(model, this.getAssemblyTemplateBindings(node)) : undefined;
        return {
            component: assemblyNode?.component,
            bindings: assemblyNode?.bindings,
        };
    }

    protected getInterfaceLinkEndpointComponent(
        link: ast.InterfaceLink,
        side: 'owner' | 'client',
    ): {
        component?: ast.Component;
        bindings?: TemplateBindings;
    } {
        if (side === 'owner') {
            const source = this.getInterfaceLinkSourceResolution(link);
            return {
                component: source.finalComponent,
                bindings: source.finalBindings,
            };
        }
        const path = link.clientPath;
        if (!path) {
            return {};
        }
        if (AstUtils.getContainerOfType(link, ast.isModelInstance)) {
            const resolution = this.getAssemblyLinkPathResolution(path);
            return {
                component: resolution.finalComponent,
                bindings: resolution.finalBindings,
            };
        }
        if (AstUtils.getContainerOfType(link, ast.isComponentLinkBase)) {
            const resolution = this.getLinkBaseEndpointPathResolution(path);
            return {
                component: resolution.finalComponent,
                bindings: resolution.finalBindings,
            };
        }
        return {};
    }

    protected computeAssemblyLinkPathResolution(path: ast.Path): L2PathResolution {
        const link = AstUtils.getContainerOfType(path, ast.isLink);
        const model = link ? AstUtils.getContainerOfType(link, ast.isModelInstance) : undefined;
        const baseNode = model ? this.getAssemblyNode(model, this.getAssemblyTemplateBindings(path)) : undefined;
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
            if (path === link.sourcePath) {
                return this.computeAssemblyInterfaceLinkSourceResolution(path);
            }
            return this.resolveAssemblyInstancePathAsMember(path, baseNode);
        }

        return this.inactiveResolution();
    }

    protected computeLinkBaseComponentPathResolution(path: ast.Path): L2PathResolution {
        const baseStack = this.getBaseStackForLinkBaseComponentPath(path);
        const bindings = this.getLinkBaseTemplateBindings(path);
        return this.typedComponentResolutionToL2(baseStack ? this.typedPathResolver.resolveComponentPath(path, baseStack, bindings) : undefined, bindings);
    }

    protected computeLinkBaseEndpointPathResolution(path: ast.Path): L2PathResolution {
        const link = AstUtils.getContainerOfType(path, ast.isLink);
        const componentLinkBase = link ? AstUtils.getContainerOfType(link, ast.isComponentLinkBase) : undefined;
        const baseStack = componentLinkBase ? this.getComponentLinkBaseComponentStack(componentLinkBase) : undefined;
        const bindings = this.getLinkBaseTemplateBindings(path);
        if (!link || !baseStack) {
            return this.inactiveResolution();
        }

        if (ast.isEventLink(link)) {
            return this.resolveComponentMemberPath(path, baseStack, [path === link.ownerPath ? 'eventSource' : 'eventSink'], bindings);
        }
        if (ast.isFieldLink(link)) {
            return this.resolveComponentFieldEndpointPath(path, baseStack, path === link.ownerPath ? 'outputField' : 'inputField', bindings);
        }
        if (ast.isInterfaceLink(link)) {
            if (path === link.sourcePath) {
                return this.computeLinkBaseInterfaceLinkSourceResolution(path);
            }
            return this.typedComponentResolutionToL2(this.typedPathResolver.resolveComponentPath(path, baseStack, bindings), bindings);
        }

        return this.inactiveResolution();
    }

    protected computeAssemblyInterfaceLinkSourceResolution(path: ast.Path): InterfaceLinkSourceResolution {
        const link = AstUtils.getContainerOfType(path, ast.isInterfaceLink);
        const model = link ? AstUtils.getContainerOfType(link, ast.isModelInstance) : undefined;
        const baseNode = model ? this.getAssemblyNode(model, this.getAssemblyTemplateBindings(path)) : undefined;
        return this.resolveAssemblyInterfaceLinkSource(path, baseNode);
    }

    protected resolveAssemblyInterfaceLinkSource(path: ast.Path, baseNode: AssemblyNode | undefined): InterfaceLinkSourceResolution {
        const parts = this.pathService.splitInterfaceLinkSourcePath(path);
        const namedSegments = new Map<ast.PathNamedSegment, readonly ast.NamedElement[]>();
        const segmentBindings = new Map<ast.PathNamedSegment, TemplateBindings | undefined>();
        if (!baseNode) {
            return {
                active: false,
                ownerPath: parts?.ownerPath as ast.Path | undefined,
                ownerText: parts?.ownerText ?? '.',
                referenceText: parts?.referenceText ?? '',
                namedSegments,
                segmentBindings,
            };
        }
        if (!parts?.referenceSegment) {
            return {
                active: true,
                ownerPath: parts?.ownerPath as ast.Path | undefined,
                ownerText: parts?.ownerText ?? '.',
                referenceText: parts?.referenceText ?? '',
                invalidMessage: 'The interface source path shall end with a Reference name.',
                invalidNode: path,
                namedSegments,
                segmentBindings,
            };
        }

        let ownerComponent = baseNode.component;
        let ownerBindings = baseNode.bindings;
        if (parts.ownerPath) {
            const ownerResolution = this.resolveAssemblyInstancePath(parts.ownerPath as ast.Path, baseNode);
            this.mergeNamedSegments(namedSegments, ownerResolution.namedSegments);
            this.mergeSegmentBindings(segmentBindings, ownerResolution.segmentBindings);
            if (!ownerResolution.active || ownerResolution.invalidMessage || !ownerResolution.finalComponent) {
                return {
                    active: ownerResolution.active,
                    ownerPath: parts.ownerPath as ast.Path,
                    ownerText: parts.ownerText,
                    referenceText: parts.referenceText,
                    finalComponent: ownerResolution.finalComponent,
                    finalBindings: ownerResolution.finalBindings,
                    invalidMessage: ownerResolution.invalidMessage,
                    invalidNode: ownerResolution.invalidNode,
                    namedSegments,
                    segmentBindings,
                };
            }
            ownerComponent = ownerResolution.finalComponent;
            ownerBindings = ownerResolution.finalBindings;
        }

        const referenceCandidates = this.getComponentMembers(ownerComponent, ['reference']);
        namedSegments.set(parts.referenceSegment, referenceCandidates);
        segmentBindings.set(parts.referenceSegment, ownerBindings);
        const resolvedReference = this.typedPathResolver.resolveNamedElement(parts.referenceSegment, referenceCandidates, ownerBindings);
        if (!ast.isReference(resolvedReference)) {
            return {
                active: true,
                ownerPath: parts.ownerPath as ast.Path | undefined,
                ownerText: parts.ownerText,
                referenceText: parts.referenceText,
                finalComponent: ownerComponent,
                finalBindings: ownerBindings,
                invalidMessage: `The path segment '${this.pathService.getSegmentText(parts.referenceSegment)}' shall resolve to a Reference of the owner Component.`,
                invalidNode: parts.referenceSegment,
                namedSegments,
                segmentBindings,
            };
        }
        return {
            active: true,
            ownerPath: parts.ownerPath as ast.Path | undefined,
            ownerText: parts.ownerText,
            referenceText: parts.referenceText,
            finalElement: resolvedReference,
            finalComponent: ownerComponent,
            finalBindings: ownerBindings,
            namedSegments,
            segmentBindings,
        };
    }

    protected computeLinkBaseInterfaceLinkSourceResolution(path: ast.Path): InterfaceLinkSourceResolution {
        const parts = this.pathService.splitInterfaceLinkSourcePath(path);
        const namedSegments = new Map<ast.PathNamedSegment, readonly ast.NamedElement[]>();
        const segmentBindings = new Map<ast.PathNamedSegment, TemplateBindings | undefined>();
        const baseStack = this.getBaseStackForLinkBaseComponentPath(path);
        const bindings = this.getLinkBaseTemplateBindings(path);
        if (!baseStack) {
            return {
                active: false,
                ownerPath: parts?.ownerPath as ast.Path | undefined,
                ownerText: parts?.ownerText ?? '.',
                referenceText: parts?.referenceText ?? '',
                namedSegments,
                segmentBindings,
            };
        }
        if (!parts?.referenceSegment) {
            return {
                active: true,
                ownerPath: parts?.ownerPath as ast.Path | undefined,
                ownerText: parts?.ownerText ?? '.',
                referenceText: parts?.referenceText ?? '',
                invalidMessage: 'The interface source path shall end with a Reference name.',
                invalidNode: path,
                namedSegments,
                segmentBindings,
            };
        }

        let ownerComponent = baseStack.at(-1);
        const ownerBindings = bindings;
        if (parts.ownerPath) {
            const ownerResolution = this.typedPathResolver.resolveComponentPath(parts.ownerPath as ast.Path, baseStack, bindings);
            this.mergeNamedSegments(namedSegments, ownerResolution.namedSegments);
            if (!ownerResolution.active || ownerResolution.invalidMessage || !ownerResolution.finalComponent) {
                return {
                    active: ownerResolution.active,
                    ownerPath: parts.ownerPath as ast.Path,
                    ownerText: parts.ownerText,
                    referenceText: parts.referenceText,
                    finalComponent: ownerResolution.finalComponent,
                    finalBindings: ownerBindings,
                    invalidMessage: ownerResolution.invalidMessage,
                    invalidNode: ownerResolution.invalidNode,
                    namedSegments,
                    segmentBindings,
                };
            }
            ownerComponent = ownerResolution.finalComponent;
        }

        const referenceCandidates = this.getComponentMembers(ownerComponent, ['reference']);
        namedSegments.set(parts.referenceSegment, referenceCandidates);
        segmentBindings.set(parts.referenceSegment, ownerBindings);
        const resolvedReference = this.typedPathResolver.resolveNamedElement(parts.referenceSegment, referenceCandidates, ownerBindings);
        if (!ast.isReference(resolvedReference)) {
            return {
                active: true,
                ownerPath: parts.ownerPath as ast.Path | undefined,
                ownerText: parts.ownerText,
                referenceText: parts.referenceText,
                finalComponent: ownerComponent,
                finalBindings: ownerBindings,
                invalidMessage: `The path segment '${this.pathService.getSegmentText(parts.referenceSegment)}' shall resolve to a Reference of the owner Component.`,
                invalidNode: parts.referenceSegment,
                namedSegments,
                segmentBindings,
            };
        }

        return {
            active: true,
            ownerPath: parts.ownerPath as ast.Path | undefined,
            ownerText: parts.ownerText,
            referenceText: parts.referenceText,
            finalElement: resolvedReference,
            finalComponent: ownerComponent,
            finalBindings: ownerBindings,
            namedSegments,
            segmentBindings,
        };
    }

    protected computeScheduleActivityPathResolution(path: ast.Path): L2PathResolution {
        const task = AstUtils.getContainerOfType(path.$container, ast.isTask);
        const taskContext = task ? this.getTaskExecutionContext(task) : undefined;
        const bindings = this.mergeTemplateBindings(this.getScheduleTemplateBindings(path), taskContext?.bindings);
        if (ast.isExecuteTask(path.$container)) {
            if (taskContext?.assemblyContext) {
                return this.assemblyInstanceResolutionToL2(
                    this.resolveAssemblyComponentPathInContext(path, taskContext.assemblyContext, bindings)
                );
            }
            return this.typedComponentResolutionToL2(
                taskContext?.componentStack ? this.typedPathResolver.resolveComponentPath(path, taskContext.componentStack, bindings) : undefined,
                bindings
            );
        }

        if (!taskContext?.component && !taskContext?.assemblyContext) {
            return this.inactiveResolution();
        }

        if (ast.isCallOperation(path.$container)) {
            return taskContext.assemblyContext
                ? this.resolveAssemblyMemberPathInContext(path, taskContext.assemblyContext, ['operation'], bindings)
                : this.resolveComponentMemberPath(path, taskContext.componentStack, ['operation'], bindings);
        }
        if (ast.isSetProperty(path.$container)) {
            return taskContext.assemblyContext
                ? this.resolveAssemblyMemberPathInContext(path, taskContext.assemblyContext, ['property'], bindings)
                : this.resolveComponentMemberPath(path, taskContext.componentStack, ['property'], bindings);
        }
        if (ast.isTransfer(path.$container)) {
            return taskContext.assemblyContext
                ? this.resolveAssemblyFieldEndpointPathInContext(
                    path,
                    taskContext.assemblyContext,
                    path === path.$container.outputFieldPath ? 'outputField' : 'inputField',
                    bindings,
                )
                : this.resolveComponentFieldEndpointPath(
                    path,
                    taskContext.componentStack,
                    path === path.$container.outputFieldPath ? 'outputField' : 'inputField',
                    bindings
                );
        }
        if (ast.isTrigger(path.$container)) {
            return taskContext.assemblyContext
                ? this.resolveAssemblyMemberPathInContext(path, taskContext.assemblyContext, ['entryPoint'], bindings)
                : this.resolveComponentMemberPath(path, taskContext.componentStack, ['entryPoint'], bindings);
        }

        return this.inactiveResolution();
    }

    protected getBaseStackForLinkBaseComponentPath(path: ast.Path): readonly ast.Component[] | undefined {
        if (ast.isComponentLinkBase(path.$container)) {
            return ast.isComponentLinkBase(path.$container.$container)
                ? this.getComponentLinkBaseComponentStack(path.$container.$container)
                : this.getRootLinkBaseComponentStack(path.$container);
        }
        if (ast.isLink(path.$container)) {
            const componentLinkBase = AstUtils.getContainerOfType(path.$container, ast.isComponentLinkBase);
            return componentLinkBase ? this.getComponentLinkBaseComponentStack(componentLinkBase) : undefined;
        }
        return undefined;
    }

    protected resolveAssemblyInstancePath(
        path: ast.Path,
        baseNode: AssemblyNode | undefined,
        baseContext?: AssemblyPathContext,
        inheritedBindings?: TemplateBindings,
    ): AsbInstancePathResolution {
        const namedSegments = new Map<ast.PathNamedSegment, readonly ast.NamedElement[]>();
        const segmentBindings = new Map<ast.PathNamedSegment, TemplateBindings | undefined>();
        if (!baseNode) {
            return { active: false, namedSegments, segmentBindings };
        }

        const segments = this.pathService.getPathSegments(path);
        if (segments.length === 0) {
            if (path.absolute) {
                return {
                    active: true,
                    finalComponent: baseNode.component,
                    finalBindings: baseNode.bindings,
                    namedSegments,
                    segmentBindings,
                };
            }
            return {
                active: true,
                invalidMessage: 'A path shall not be empty.',
                invalidNode: path,
                namedSegments,
                segmentBindings,
            };
        }

        let currentNode = baseNode;
        let currentBindings = this.mergeTemplateBindings(inheritedBindings, baseNode.bindings);
        let currentContext = baseContext;
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
            if (!ast.isPathNamedSegment(actualSegment)) {
                return {
                    active: true,
                    invalidMessage: 'Assembly instance paths shall only contain child instance names.',
                    invalidNode: actualSegment,
                    namedSegments,
                    segmentBindings,
                };
            }

            const candidates = currentNode.children.map(child => child.instance);
            namedSegments.set(actualSegment, candidates);
            segmentBindings.set(actualSegment, currentBindings);
            const segmentText = this.pathService.getSegmentText(actualSegment);
            const next = this.resolveAssemblyChild(actualSegment, currentNode.children, currentBindings);
            if (!next) {
                return {
                    active: true,
                    invalidMessage: `The path segment '${segmentText}' shall resolve to a child Model Instance or Assembly Instance.`,
                    invalidNode: actualSegment,
                    namedSegments,
                    segmentBindings,
                };
            }
            if (Array.isArray(next)) {
                return {
                    active: true,
                    invalidMessage: `The path segment '${segmentText}' is ambiguous.`,
                    invalidNode: actualSegment,
                    namedSegments,
                    segmentBindings,
                };
            }
            const resolvedNext = next as AssemblyNodeChild;
            currentNode = resolvedNext.node;
            currentBindings = this.mergeTemplateBindings(inheritedBindings, resolvedNext.node.bindings);
            currentContext = this.getAssemblyPathContextForInstance(resolvedNext.instance, resolvedNext.node.bindings);
        }

        return {
            active: true,
            finalComponent: currentNode.component,
            finalBindings: currentBindings,
            finalContext: currentContext,
            namedSegments,
            segmentBindings,
        };
    }

    protected resolveAssemblyInstancePathAsMember(path: ast.Path, baseNode: AssemblyNode | undefined): L2PathResolution {
        const resolution = this.resolveAssemblyInstancePath(path, baseNode);
        return {
            active: resolution.active,
            finalComponent: resolution.finalComponent,
            finalBindings: resolution.finalBindings,
            invalidMessage: resolution.invalidMessage,
            invalidNode: resolution.invalidNode,
            namedSegments: resolution.namedSegments,
            segmentBindings: resolution.segmentBindings,
        };
    }

    protected resolveAssemblyMemberPathInContext(
        path: ast.Path,
        context: AssemblyPathContext | undefined,
        memberKinds: MemberKind[],
        inheritedBindings?: TemplateBindings,
    ): L2PathResolution {
        return this.resolveAssemblyMemberPath(path, this.getAssemblyBaseNode(context), memberKinds, inheritedBindings);
    }

    protected resolveAssemblyMemberPath(
        path: ast.Path,
        baseNode: AssemblyNode | undefined,
        memberKinds: MemberKind[],
        inheritedBindings?: TemplateBindings,
    ): L2PathResolution {
        const namedSegments = new Map<ast.PathNamedSegment, readonly ast.NamedElement[]>();
        const segmentBindings = new Map<ast.PathNamedSegment, TemplateBindings | undefined>();
        if (!baseNode) {
            return { active: false, namedSegments, segmentBindings };
        }

        const segments = this.pathService.getPathSegments(path);
        if (segments.length === 0) {
            return {
                active: true,
                invalidMessage: 'A path shall not be empty.',
                invalidNode: path,
                namedSegments,
                segmentBindings,
            };
        }

        let currentNode = baseNode;
        let currentBindings = this.mergeTemplateBindings(inheritedBindings, baseNode.bindings);
        for (let index = 0; index < segments.length; index++) {
            const segment = segments[index];
            if (ast.isPathIndex(segment)) {
                return {
                        active: true,
                        invalidMessage: 'This path kind shall not use array indices.',
                        invalidNode: segment,
                        namedSegments,
                        segmentBindings,
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
                        segmentBindings,
                    };
                }
            if (!ast.isPathNamedSegment(actualSegment)) {
                return {
                    active: true,
                    finalComponent: currentNode.component,
                    finalBindings: currentNode.bindings,
                    invalidMessage: 'This path kind shall only use named path segments.',
                    invalidNode: actualSegment,
                    namedSegments,
                    segmentBindings,
                };
            }

            const isLast = index === segments.length - 1;
            if (isLast) {
                const candidates = this.getComponentMembers(currentNode.component, memberKinds);
                namedSegments.set(actualSegment, candidates);
                segmentBindings.set(actualSegment, currentBindings);
                const resolved = this.typedPathResolver.resolveNamedElement(actualSegment, candidates, currentBindings);
                if (!resolved) {
                    return {
                        active: true,
                        finalComponent: currentNode.component,
                        finalBindings: currentBindings,
                        invalidMessage: `The path segment '${this.pathService.getSegmentText(actualSegment)}' shall resolve to a supported member of the current Component.`,
                        invalidNode: actualSegment,
                        namedSegments,
                        segmentBindings,
                    };
                }
                return {
                    active: true,
                    finalElement: resolved,
                    finalType: this.getMemberType(resolved),
                    finalComponent: currentNode.component,
                    finalBindings: currentBindings,
                    namedSegments,
                    segmentBindings,
                };
            }

            const candidates = currentNode.children.map(child => child.instance);
            namedSegments.set(actualSegment, candidates);
            segmentBindings.set(actualSegment, currentBindings);
            const next = this.resolveAssemblyChild(actualSegment, currentNode.children, currentBindings);
            if (!next) {
                return {
                    active: true,
                    finalComponent: currentNode.component,
                    finalBindings: currentBindings,
                    invalidMessage: `The path segment '${this.pathService.getSegmentText(actualSegment)}' shall resolve to a child Model Instance or Assembly Instance.`,
                    invalidNode: actualSegment,
                    namedSegments,
                    segmentBindings,
                };
            }
            if (Array.isArray(next)) {
                return {
                    active: true,
                    finalComponent: currentNode.component,
                    finalBindings: currentBindings,
                    invalidMessage: `The path segment '${this.pathService.getSegmentText(actualSegment)}' is ambiguous.`,
                    invalidNode: actualSegment,
                    namedSegments,
                    segmentBindings,
                };
            }
            const resolvedNext = next as AssemblyNodeChild;
            currentNode = resolvedNext.node;
            currentBindings = this.mergeTemplateBindings(inheritedBindings, resolvedNext.node.bindings);
        }

        return { active: true, finalComponent: currentNode.component, finalBindings: currentBindings, namedSegments, segmentBindings };
    }

    protected resolveAssemblyFieldEndpointPath(
        path: ast.Path,
        baseNode: AssemblyNode | undefined,
        requiredKind: 'inputField' | 'outputField',
        inheritedBindings?: TemplateBindings,
    ): L2PathResolution<ast.Field> {
        const namedSegments = new Map<ast.PathNamedSegment, readonly ast.NamedElement[]>();
        const segmentBindings = new Map<ast.PathNamedSegment, TemplateBindings | undefined>();
        if (!baseNode) {
            return { active: false, namedSegments, segmentBindings };
        }

        const segments = this.pathService.getPathSegments(path);
        if (segments.length === 0) {
            return {
                active: true,
                invalidMessage: 'A path shall not be empty.',
                invalidNode: path,
                namedSegments,
                segmentBindings,
            };
        }

        let currentNode = baseNode;
        let currentBindings = this.mergeTemplateBindings(inheritedBindings, baseNode.bindings);
        for (let index = 0; index < segments.length; index++) {
            const segment = segments[index];
            if (ast.isPathIndex(segment)) {
                return {
                    active: true,
                    invalidMessage: 'Field paths shall start with a Field.',
                    invalidNode: segment,
                    namedSegments,
                    segmentBindings,
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
                    segmentBindings,
                };
            }
            if (!ast.isPathNamedSegment(actualSegment)) {
                return {
                    active: true,
                    invalidMessage: 'Field paths shall start with a Field.',
                    invalidNode: actualSegment,
                    namedSegments,
                    segmentBindings,
                };
            }
            if (!ast.isPathNamedSegment(actualSegment)) {
                return {
                    active: true,
                    finalComponent: currentNode.component,
                    finalBindings: currentNode.bindings,
                    invalidMessage: 'Field paths shall start with a Field.',
                    invalidNode: actualSegment,
                    namedSegments,
                    segmentBindings,
                };
            }

            const child = this.resolveAssemblyChild(actualSegment, currentNode.children, currentBindings);
            const fieldCandidates = this.getComponentMembers(currentNode.component, [requiredKind]) as ast.Field[];
            const resolvedField = this.typedPathResolver.resolveNamedElement(actualSegment, fieldCandidates, currentBindings);
            if (!child || Array.isArray(child) || index === segments.length - 1) {
                namedSegments.set(actualSegment, fieldCandidates);
                segmentBindings.set(actualSegment, currentBindings);
                if (Array.isArray(child)) {
                    return {
                        active: true,
                        finalComponent: currentNode.component,
                        finalBindings: currentBindings,
                        invalidMessage: `The path segment '${this.pathService.getSegmentText(actualSegment)}' is ambiguous.`,
                        invalidNode: actualSegment,
                        namedSegments,
                        segmentBindings,
                    };
                }
                if (!resolvedField) {
                    return {
                        active: true,
                        finalComponent: currentNode.component,
                        finalBindings: currentBindings,
                        invalidMessage: `The path segment '${this.pathService.getSegmentText(actualSegment)}' shall resolve to a ${requiredKind === 'outputField' ? 'Field marked as Output' : 'Field marked as Input'} of the current Component.`,
                        invalidNode: actualSegment,
                        namedSegments,
                        segmentBindings,
                    };
                }
                const tail = this.typedPathResolver.resolveFieldTail(
                    segments,
                    index + 1,
                    resolvedField,
                    resolvedField.type?.ref,
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
                    finalBindings: currentBindings,
                    invalidMessage: tail.invalidMessage,
                    invalidNode: tail.invalidNode,
                    namedSegments,
                    segmentBindings,
                };
            }

            const resolvedChild = child as AssemblyNodeChild;
            namedSegments.set(actualSegment, [resolvedChild.instance]);
            segmentBindings.set(actualSegment, currentBindings);
            currentNode = resolvedChild.node;
            currentBindings = this.mergeTemplateBindings(inheritedBindings, resolvedChild.node.bindings);
        }

        return { active: true, finalComponent: currentNode.component, finalBindings: currentBindings, namedSegments, segmentBindings };
    }

    protected resolveAssemblyFieldEndpointPathInContext(
        path: ast.Path,
        context: AssemblyPathContext | undefined,
        requiredKind: 'inputField' | 'outputField',
        inheritedBindings?: TemplateBindings,
    ): L2PathResolution<ast.Field> {
        return this.resolveAssemblyFieldEndpointPath(path, this.getAssemblyBaseNode(context), requiredKind, inheritedBindings);
    }

    protected resolveComponentMemberPath(
        path: ast.Path,
        baseStack: readonly ast.Component[] | undefined,
        memberKinds: MemberKind[],
        bindings?: TemplateBindings,
    ): L2PathResolution {
        return this.typedMemberResolutionToL2(this.typedPathResolver.resolveComponentMemberPath(path, baseStack, {
            getFinalCandidates: (component) => this.getComponentMembers(component, memberKinds),
            getFinalType: (element) => this.getMemberType(element),
            indexMessage: 'This path kind shall not use array indices.',
            containerOrReferenceMessage: (segmentText) => `The path segment '${segmentText}' shall resolve to a Container or Reference of the current Component.`,
            finalMissingMessage: (segmentText) => `The path segment '${segmentText}' shall resolve to a supported member of the current Component.`,
            parentMessage: 'The path segment ".." shall not navigate above the typed component context.',
        }, bindings), bindings);
    }

    protected resolveComponentFieldEndpointPath(
        path: ast.Path,
        baseStack: readonly ast.Component[] | undefined,
        requiredKind: 'inputField' | 'outputField',
        bindings?: TemplateBindings,
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
        }, bindings), bindings);
    }

    protected typedFieldResolutionToL2(resolution: TypedFieldPathResolution, bindings?: TemplateBindings): L2PathResolution<ast.Field> {
        return {
            active: resolution.active,
            finalElement: resolution.finalField,
            finalType: resolution.finalType,
            finalBindings: bindings,
            invalidMessage: resolution.invalidMessage,
            invalidNode: resolution.invalidNode,
            namedSegments: resolution.namedSegments,
            segmentBindings: this.createSegmentBindingsMap(resolution.namedSegments, bindings),
        };
    }

    protected typedComponentResolutionToL2(resolution: TypedComponentPathResolution | undefined, bindings?: TemplateBindings): L2PathResolution {
        if (!resolution) {
            return this.inactiveResolution();
        }
        return {
            active: resolution.active,
            finalComponent: resolution.finalComponent,
            finalBindings: bindings,
            invalidMessage: resolution.invalidMessage,
            invalidNode: resolution.invalidNode,
            namedSegments: resolution.namedSegments,
            segmentBindings: this.createSegmentBindingsMap(resolution.namedSegments, bindings),
        };
    }

    protected typedMemberResolutionToL2<T extends ast.NamedElement>(resolution: TypedMemberPathResolution<T>, bindings?: TemplateBindings): L2PathResolution<T> {
        return {
            active: resolution.active,
            finalElement: resolution.finalElement,
            finalType: resolution.finalType,
            finalComponent: resolution.finalComponent,
            finalBindings: bindings,
            invalidMessage: resolution.invalidMessage,
            invalidNode: resolution.invalidNode,
            namedSegments: resolution.namedSegments,
            segmentBindings: this.createSegmentBindingsMap(resolution.namedSegments, bindings),
        };
    }

    protected inactiveResolution<T extends ast.NamedElement>(): L2PathResolution<T> {
        return { active: false, namedSegments: new Map(), segmentBindings: new Map() };
    }

    protected getAssemblyConfigurationBaseContext(configuration: ast.AssemblyComponentConfiguration): AssemblyPathContext | undefined {
        if (ast.isAssembly(configuration.$container)) {
            return this.getAssemblyPathContextForAssembly(configuration.$container);
        }
        if (ast.isAssemblyInstance(configuration.$container)) {
            return this.getAssemblyPathContextForInstance(configuration.$container);
        }
        return undefined;
    }

    protected getAssemblyBaseNode(context: AssemblyPathContext | undefined): AssemblyNode | undefined {
        if (!context) {
            return undefined;
        }
        if (context.assembly) {
            return this.getAssemblyNode(context.assembly.model, this.createTemplateBindings(context.assembly.parameters));
        }
        if (context.instance) {
            return ast.isModelInstance(context.instance)
                ? this.getAssemblyNode(context.instance, context.bindings)
                : this.getAssemblyNodeForAssemblyInstance(context.instance);
        }
        return undefined;
    }

    protected getTaskExecutionContext(task: ast.Task): TaskExecutionContext | undefined {
        return this.taskExecutionContextCache.get(task, () => {
            const explicitContext = task.context?.ref;
            if (ast.isAssembly(explicitContext)) {
                return this.toTaskExecutionContext(this.getAssemblyPathContextForAssembly(explicitContext));
            }
            if (ast.isComponent(explicitContext)) {
                return {
                    component: explicitContext,
                    componentStack: [explicitContext],
                };
            }
            return undefined;
        });
    }

    protected createAssemblyPathContext(
        node: AssemblyNode | undefined,
        seed: Omit<AssemblyPathContext, 'component' | 'bindings'>,
    ): AssemblyPathContext | undefined {
        return node
            ? {
                component: node.component,
                bindings: node.bindings,
                ...seed,
            }
            : undefined;
    }

    protected toTaskExecutionContext(assemblyContext: AssemblyPathContext | undefined): TaskExecutionContext | undefined {
        return assemblyContext
            ? {
                component: assemblyContext.component,
                bindings: assemblyContext.bindings,
                assemblyContext,
            }
            : undefined;
    }

    protected assemblyInstanceResolutionToL2(resolution: AsbInstancePathResolution): L2PathResolution {
        return {
            active: resolution.active,
            finalComponent: resolution.finalComponent,
            finalBindings: resolution.finalBindings,
            invalidMessage: resolution.invalidMessage,
            invalidNode: resolution.invalidNode,
            namedSegments: resolution.namedSegments,
            segmentBindings: resolution.segmentBindings,
        };
    }

    protected getAssemblyNode(model: ast.ModelInstance | undefined, bindings?: TemplateBindings): AssemblyNode | undefined {
        if (!model) {
            return undefined;
        }
        const signature = this.getBindingsSignature(bindings);
        const variants = this.assemblyNodeCache.get(model, () => new Map<string, AssemblyNode>());
        let node = variants.get(signature);
        if (!node) {
            node = this.computeAssemblyNode(model, bindings);
            variants.set(signature, node);
        }
        return node;
    }

    protected getAssemblyNodeForAssemblyInstance(instance: ast.AssemblyInstance | undefined): AssemblyNode | undefined {
        const assembly = instance && ast.isAssembly(instance.assembly?.ref) ? instance.assembly.ref : undefined;
        return this.getAssemblyNode(assembly?.model, assembly ? this.createTemplateBindings(assembly.parameters, instance?.arguments ?? []) : undefined);
    }

    protected computeAssemblyNode(model: ast.ModelInstance, bindings?: TemplateBindings): AssemblyNode {
        const component = this.getModelComponent(model);
        const children: AssemblyNodeChild[] = [];
        for (const subInstance of model.elements.filter(ast.isSubInstance)) {
            const member = this.getSubInstanceContainer(subInstance, component);
            if (!member) {
                continue;
            }
            const instance = subInstance.instance;
            if (ast.isModelInstance(instance)) {
                const childNode = this.getAssemblyNode(instance, bindings);
                if (childNode) {
                    children.push({ member, instance, node: childNode });
                }
                continue;
            }
            if (ast.isAssemblyInstance(instance)) {
                const childNode = this.getAssemblyNodeForAssemblyInstance(instance);
                if (childNode) {
                    children.push({ member, instance, node: childNode });
                }
            }
        }
        return { component, bindings, children };
    }

    protected getModelComponent(model: ast.ModelInstance | undefined): ast.Component | undefined {
        return model && ast.isComponent(model.implementation?.ref) ? model.implementation.ref : undefined;
    }

    protected getSubInstanceContainer(subInstance: ast.SubInstance, component: ast.Component | undefined): ast.Container | undefined {
        const target = this.getLocalNamedReferenceTarget(subInstance.container);
        if (ast.isContainer(target)) {
            return target;
        }
        const containerName = this.pathService.getLocalNamedReferenceText(subInstance.container);
        if (!containerName) {
            return undefined;
        }
        return this.getComponentPathMembers(component)
            .find((candidate): candidate is ast.Container => ast.isContainer(candidate) && candidate.name === containerName);
    }

    getSubInstanceContainerForCompletion(subInstance: ast.SubInstance, component: ast.Component | undefined): ast.Container | undefined {
        return this.getSubInstanceContainer(subInstance, component);
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
                case 'reference':
                    return ast.isReference(element);
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
            return element.type?.ref;
        }
        return undefined;
    }

    protected resolveNamedSegmentTarget<T extends ast.NamedElement>(
        segment: ast.PathNamedSegment | undefined,
        candidates: readonly T[],
        bindings?: TemplateBindings,
    ): T | undefined {
        if (!segment) {
            return undefined;
        }
        if (ast.isConcretePathNamedSegment(segment)) {
            const linked = segment.reference?.ref;
            if (linked && candidates.includes(linked as T)) {
                return linked as T;
            }
            const refText = segment.reference?.$refText;
            return refText ? candidates.find(candidate => candidate.name === refText) : undefined;
        }
        const matches = this.identifierPatternService.matchCandidates(segment, candidates, candidate => candidate.name ?? '', bindings).matches;
        return matches.length === 1 ? matches[0] : undefined;
    }

    protected resolveAssemblyChild(
        segment: ast.PathNamedSegment | undefined,
        children: readonly AssemblyNodeChild[],
        bindings: TemplateBindings | undefined,
    ): AssemblyNodeChild | readonly AssemblyNodeChild[] | undefined {
        if (!segment) {
            return undefined;
        }
        const segmentText = this.pathService.getSegmentText(segment);
        const matches = children.filter(child =>
            this.identifierPatternService.matches(this.identifierPatternService.getSegmentPattern(segment), child.instance.name ?? '', bindings)
            || child.member.name === segmentText
        );
        if (matches.length === 1) {
            return matches[0];
        }
        return matches.length > 1 ? matches : undefined;
    }

    protected getTemplateBindingsForPath(node: AstNode | undefined): TemplateBindings | undefined {
        return this.getAssemblyTemplateBindings(node)
            ?? this.getScheduleTemplateBindings(node)
            ?? this.getLinkBaseTemplateBindings(node);
    }

    protected mergeTemplateBindings(
        baseBindings: TemplateBindings | undefined,
        overrideBindings: TemplateBindings | undefined,
    ): TemplateBindings | undefined {
        if (!baseBindings) {
            return overrideBindings;
        }
        if (!overrideBindings) {
            return baseBindings;
        }
        return new Map([...baseBindings.entries(), ...overrideBindings.entries()]);
    }

    protected mergeNamedSegments(
        target: Map<ast.PathNamedSegment, readonly ast.NamedElement[]>,
        source: ReadonlyMap<ast.PathNamedSegment, readonly ast.NamedElement[]>,
    ): void {
        for (const [segment, candidates] of source) {
            target.set(segment, candidates);
        }
    }

    protected mergeSegmentBindings(
        target: Map<ast.PathNamedSegment, TemplateBindings | undefined>,
        source: ReadonlyMap<ast.PathNamedSegment, TemplateBindings | undefined> | undefined,
    ): void {
        if (!source) {
            return;
        }
        for (const [segment, bindings] of source) {
            target.set(segment, bindings);
        }
    }

    protected getAssemblyTemplateBindings(node: AstNode | undefined): TemplateBindings | undefined {
        const assembly = AstUtils.getContainerOfType(node, ast.isAssembly);
        return assembly ? this.createTemplateBindings(assembly.parameters) : undefined;
    }

    protected getScheduleTemplateBindings(node: AstNode | undefined): TemplateBindings | undefined {
        const schedule = AstUtils.getContainerOfType(node, ast.isSchedule);
        return schedule ? this.createTemplateBindings(schedule.parameters) : undefined;
    }

    protected getLinkBaseTemplateBindings(node: AstNode | undefined): TemplateBindings | undefined {
        const linkBase = AstUtils.getContainerOfType(node, ast.isLinkBase);
        const assembly = ast.isAssembly(linkBase?.assembly?.ref) ? linkBase.assembly.ref : undefined;
        return assembly ? this.createTemplateBindings(assembly.parameters) : undefined;
    }

    protected getRootLinkBaseComponentStack(node: AstNode | undefined): readonly ast.Component[] | undefined {
        const linkBase = AstUtils.getContainerOfType(node, ast.isLinkBase);
        const assembly = ast.isAssembly(linkBase?.assembly?.ref) ? linkBase.assembly.ref : undefined;
        const component = this.getModelComponent(assembly?.model);
        return component ? [component] : undefined;
    }

    protected createTemplateBindings(
        parameters: readonly ast.TemplateParameter[],
        argumentsList: readonly ast.TemplateArgument[] = [],
    ): TemplateBindings | undefined {
        const bindings = new Map<string, string>();
        for (const parameter of parameters) {
            const value = this.getTemplateParameterValue(parameter);
            if (parameter.name && value !== undefined) {
                bindings.set(parameter.name, value);
            }
        }
        for (const argument of argumentsList) {
            const name = argument.parameter?.ref?.name;
            const value = this.getTemplateArgumentValue(argument);
            if (name && value !== undefined) {
                bindings.set(name, value);
            }
        }
        return bindings.size > 0 ? bindings : undefined;
    }

    protected getTemplateParameterValue(parameter: ast.TemplateParameter): string | undefined {
        if (ast.isStringParameter(parameter)) {
            return this.normalizeTemplateString(parameter.value);
        }
        if (ast.isInt32Parameter(parameter)) {
            return parameter.value?.toString();
        }
        return undefined;
    }

    protected getTemplateArgumentValue(argument: ast.TemplateArgument): string | undefined {
        if (ast.isStringArgument(argument)) {
            return this.normalizeTemplateString(argument.value);
        }
        if (ast.isInt32Argument(argument)) {
            return argument.value?.toString();
        }
        return undefined;
    }

    protected normalizeTemplateString(value: string | undefined): string | undefined {
        if (!value) {
            return undefined;
        }
        return value.startsWith('"') && value.endsWith('"') ? value.slice(1, -1) : value;
    }

    protected createSegmentBindingsMap(
        namedSegments: ReadonlyMap<ast.PathNamedSegment, readonly ast.NamedElement[]>,
        bindings?: TemplateBindings,
    ): ReadonlyMap<ast.PathNamedSegment, TemplateBindings | undefined> {
        const result = new Map<ast.PathNamedSegment, TemplateBindings | undefined>();
        for (const segment of namedSegments.keys()) {
            result.set(segment, bindings);
        }
        return result;
    }

    protected getBindingsSignature(bindings?: TemplateBindings): string {
        if (!bindings || bindings.size === 0) {
            return '';
        }
        return [...bindings.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([name, value]) => `${name}=${value}`)
            .join(';');
    }

}
