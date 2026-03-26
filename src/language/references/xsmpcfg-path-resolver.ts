import type { AstNode } from 'langium';
import { AstUtils, WorkspaceCache } from 'langium';
import * as ast from '../generated/ast.js';
import type { XsmpSharedServices } from '../xsmp-module.js';

export interface CfgComponentPathResolution {
    active: boolean;
    finalComponent?: ast.Component;
    finalStack?: readonly ast.Component[];
    invalidMessage?: string;
    invalidNode?: AstNode;
    namedSegments: ReadonlyMap<ast.CfgNamedSegment, readonly ast.NamedElement[]>;
    parentStackForUntypedTarget?: readonly ast.Component[];
}

export interface CfgFieldPathResolution {
    active: boolean;
    finalField?: ast.Field;
    finalType?: ast.Type;
    invalidMessage?: string;
    invalidNode?: AstNode;
    namedSegments: ReadonlyMap<ast.CfgNamedSegment, readonly ast.Field[]>;
}

export class XsmpcfgPathResolver {
    protected readonly componentPathCache: WorkspaceCache<ast.CfgPath, CfgComponentPathResolution>;
    protected readonly fieldPathCache: WorkspaceCache<ast.CfgPath, CfgFieldPathResolution>;
    protected readonly componentStackCache: WorkspaceCache<ast.ComponentConfiguration, readonly ast.Component[] | undefined>;

    constructor(services: XsmpSharedServices) {
        this.componentPathCache = new WorkspaceCache<ast.CfgPath, CfgComponentPathResolution>(services);
        this.fieldPathCache = new WorkspaceCache<ast.CfgPath, CfgFieldPathResolution>(services);
        this.componentStackCache = new WorkspaceCache<ast.ComponentConfiguration, readonly ast.Component[] | undefined>(services);
    }

    stringifyConfigurablePath(path: ast.ConfigurablePath | undefined, includeUnsafe = false): string | undefined {
        if (!path) {
            return undefined;
        }
        if (typeof path === 'string') {
            return path;
        }
        return this.stringifyCfgPath(path, includeUnsafe);
    }

    stringifyCfgPath(path: ast.CfgPath | undefined, includeUnsafe = false): string | undefined {
        if (!path) {
            return undefined;
        }
        let text = '';
        if (includeUnsafe && path.unsafe) {
            text += 'unsafe ';
        }
        if (path.absolute) {
            text += '/';
        }
        if (path.head) {
            text += this.stringifyCfgPathSegment(path.head);
        }
        for (const element of path.elements) {
            if (ast.isCfgPathMember(element)) {
                text += `${element.separator}${this.stringifyCfgPathSegment(element.segment)}`;
            } else if (ast.isCfgPathIndex(element)) {
                text += `[${element.index}]`;
            }
        }
        return text;
    }

    getNamedSegmentCandidates(segment: ast.CfgNamedSegment): readonly ast.NamedElement[] {
        const path = AstUtils.getContainerOfType(segment, ast.isCfgPath);
        if (!path) {
            return [];
        }
        if (ast.isFieldValue(path.$container)) {
            return this.getFieldPathResolution(path).namedSegments.get(segment) ?? [];
        }
        return this.getComponentPathResolution(path).namedSegments.get(segment) ?? [];
    }

    getEffectiveComponent(configuration: ast.ComponentConfiguration): ast.Component | undefined {
        return this.getConfigurationComponentStack(configuration)?.at(-1);
    }

    getConfigurationComponentStack(configuration: ast.ComponentConfiguration): readonly ast.Component[] | undefined {
        return this.componentStackCache.get(configuration, () => this.computeConfigurationComponentStack(configuration));
    }

    getComponentPathResolution(path: ast.CfgPath): CfgComponentPathResolution {
        return this.componentPathCache.get(path, () => this.computeComponentPathResolution(path));
    }

    getFieldPathResolution(path: ast.CfgPath): CfgFieldPathResolution {
        return this.fieldPathCache.get(path, () => this.computeFieldPathResolution(path));
    }

    getFieldCandidatesForType(type: ast.Type | undefined): readonly ast.Field[] {
        const result = new Map<string, ast.Field>();
        this.collectFieldMembers(type, result, new Set<ast.Type>());
        return [...result.values()];
    }

    getComponentPathMembers(component: ast.Component | undefined): ReadonlyArray<ast.Container | ast.Reference> {
        const result = new Map<string, ast.Container | ast.Reference>();
        this.collectComponentPathMembers(component, result, new Set<ast.Type>());
        return [...result.values()];
    }

    protected computeConfigurationComponentStack(configuration: ast.ComponentConfiguration): readonly ast.Component[] | undefined {
        const parent = ast.isComponentConfiguration(configuration.$container) ? configuration.$container : undefined;
        const parentStack = parent ? this.getConfigurationComponentStack(parent) : undefined;
        const explicitComponent = ast.isComponent(configuration.component?.ref) ? configuration.component.ref : undefined;
        const resolution = parentStack ? this.resolveComponentPath(configuration.name, parentStack) : undefined;

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

    protected computeComponentPathResolution(path: ast.CfgPath): CfgComponentPathResolution {
        const baseStack = this.getBaseComponentStackForComponentPath(path);
        return this.resolveComponentPath(path, baseStack);
    }

    protected resolveComponentPath(path: ast.CfgPath, initialStack: readonly ast.Component[] | undefined): CfgComponentPathResolution {
        const namedSegments = new Map<ast.CfgNamedSegment, readonly ast.NamedElement[]>();
        if (!initialStack || initialStack.length === 0) {
            return { active: false, namedSegments };
        }

        const stack = path.absolute ? [initialStack[0]] : [...initialStack];
        if (stack.length === 0) {
            return { active: false, namedSegments };
        }

        const segments = this.getCfgPathSegments(path);
        if (segments.length === 0) {
            return {
                active: true,
                invalidMessage: 'A path shall not be empty.',
                invalidNode: path,
                namedSegments,
            };
        }

        let currentComponent: ast.Component | undefined = stack.at(-1);
        let parentStackForUntypedTarget: readonly ast.Component[] | undefined;

        for (const segment of segments) {
            if (ast.isCfgPathIndex(segment)) {
                continue;
            }
            if (!currentComponent) {
                break;
            }
            if (ast.isCfgPathMember(segment)) {
                if (ast.isCfgParentSegment(segment.segment)) {
                    if (stack.length <= 1) {
                        return {
                            active: true,
                            invalidMessage: 'The path segment ".." shall not navigate above the typed component context.',
                            invalidNode: segment.segment,
                            namedSegments,
                        };
                    }
                    stack.pop();
                    currentComponent = stack.at(-1);
                    parentStackForUntypedTarget = undefined;
                    continue;
                }
                if (ast.isCfgSelfSegment(segment.segment)) {
                    continue;
                }
                const candidates = this.getComponentPathMembers(currentComponent);
                namedSegments.set(segment.segment, candidates);
                const resolved = this.resolveNamedSegment(segment.segment, candidates);
                if (!resolved) {
                    return {
                        active: true,
                        invalidMessage: `The path segment '${this.getSegmentText(segment.segment)}' shall resolve to a Container or Reference of the current Component.`,
                        invalidNode: segment.segment,
                        namedSegments,
                    };
                }
                const nextComponent = this.getChildComponent(resolved);
                if (nextComponent) {
                    stack.push(nextComponent);
                    currentComponent = nextComponent;
                    parentStackForUntypedTarget = undefined;
                } else {
                    parentStackForUntypedTarget = [...stack];
                    currentComponent = undefined;
                }
                continue;
            }

            if (ast.isCfgParentSegment(segment)) {
                if (stack.length <= 1) {
                    return {
                        active: true,
                        invalidMessage: 'The path segment ".." shall not navigate above the typed component context.',
                        invalidNode: segment,
                        namedSegments,
                    };
                }
                stack.pop();
                currentComponent = stack.at(-1);
                parentStackForUntypedTarget = undefined;
                continue;
            }

            if (ast.isCfgSelfSegment(segment)) {
                continue;
            }

            const candidates = this.getComponentPathMembers(currentComponent);
            namedSegments.set(segment, candidates);
            const resolved = this.resolveNamedSegment(segment, candidates);
            if (!resolved) {
                return {
                    active: true,
                    invalidMessage: `The path segment '${this.getSegmentText(segment)}' shall resolve to a Container or Reference of the current Component.`,
                    invalidNode: segment,
                    namedSegments,
                };
            }
            const nextComponent = this.getChildComponent(resolved);
            if (nextComponent) {
                stack.push(nextComponent);
                currentComponent = nextComponent;
            } else {
                parentStackForUntypedTarget = [...stack];
                currentComponent = undefined;
            }
        }

        return {
            active: true,
            finalComponent: currentComponent,
            finalStack: currentComponent ? [...stack] : undefined,
            namedSegments,
            parentStackForUntypedTarget,
        };
    }

    protected computeFieldPathResolution(path: ast.CfgPath): CfgFieldPathResolution {
        const namedSegments = new Map<ast.CfgNamedSegment, readonly ast.Field[]>();
        const configuration = AstUtils.getContainerOfType(path, ast.isComponentConfiguration);
        const component = configuration ? this.getEffectiveComponent(configuration) : undefined;
        if (!component) {
            return { active: false, namedSegments };
        }
        if (path.absolute) {
            return {
                active: true,
                invalidMessage: 'Field paths in component mode shall only use field names, "." member access and array indices.',
                invalidNode: path,
                namedSegments,
            };
        }

        const segments = this.getCfgPathSegments(path);
        if (segments.length === 0) {
            return {
                active: true,
                invalidMessage: 'A path shall not be empty.',
                invalidNode: path,
                namedSegments,
            };
        }

        let currentType: ast.Type | undefined;
        let finalField: ast.Field | undefined;

        const first = segments[0];
        if (ast.isCfgPathIndex(first) || ast.isCfgParentSegment(first) || ast.isCfgSelfSegment(first) || (ast.isCfgPathMember(first) && first.separator === '/')) {
            return {
                active: true,
                invalidMessage: 'Field paths in component mode shall only use field names, "." member access and array indices.',
                invalidNode: ast.isCfgPathMember(first) ? first.segment : first,
                namedSegments,
            };
        }

        const firstSegment = ast.isCfgPathMember(first) ? first.segment : first;
        if (!ast.isCfgNamedSegment(firstSegment)) {
            return {
                active: true,
                invalidMessage: 'Field paths in component mode shall start with a Field of the configured Component.',
                invalidNode: firstSegment,
                namedSegments,
            };
        }

        const firstCandidates = this.getFieldCandidatesForType(component);
        namedSegments.set(firstSegment, firstCandidates);
        finalField = this.resolveNamedSegment(firstSegment, firstCandidates);
        if (!finalField) {
            return {
                active: true,
                invalidMessage: `The path segment '${this.getSegmentText(firstSegment)}' shall resolve to a Field of the configured Component.`,
                invalidNode: firstSegment,
                namedSegments,
            };
        }
        currentType = finalField.type.ref;

        for (let index = 1; index < segments.length; index++) {
            const segment = segments[index];
            if (ast.isCfgPathIndex(segment)) {
                if (!currentType) {
                    break;
                }
                if (!ast.isArrayType(currentType)) {
                    return {
                        active: true,
                        finalField,
                        finalType: currentType,
                        invalidMessage: 'Array indices shall only be applied to array-typed values.',
                        invalidNode: segment,
                        namedSegments,
                    };
                }
                currentType = currentType.itemType.ref;
                continue;
            }

            if (ast.isCfgParentSegment(segment) || ast.isCfgSelfSegment(segment)) {
                return {
                    active: true,
                    finalField,
                    finalType: currentType,
                    invalidMessage: 'Field paths in component mode shall only use field names, "." member access and array indices.',
                    invalidNode: segment,
                    namedSegments,
                };
            }

            if (ast.isCfgNamedSegment(segment)) {
                return {
                    active: true,
                    finalField,
                    finalType: currentType,
                    invalidMessage: `The path segment '${this.getSegmentText(segment)}' requires "." member access.`,
                    invalidNode: segment,
                    namedSegments,
                };
            }

            if (segment.separator !== '.' || ast.isCfgParentSegment(segment.segment) || ast.isCfgSelfSegment(segment.segment)) {
                return {
                    active: true,
                    finalField,
                    finalType: currentType,
                    invalidMessage: 'Field paths in component mode shall only use field names, "." member access and array indices.',
                    invalidNode: segment.segment,
                    namedSegments,
                };
            }

            if (!currentType) {
                break;
            }

            const candidates = this.getFieldCandidatesForType(currentType);
            namedSegments.set(segment.segment as ast.CfgNamedSegment, candidates);
            if (candidates.length === 0) {
                return {
                    active: true,
                    finalField,
                    finalType: currentType,
                    invalidMessage: `The path segment '${this.getSegmentText(segment.segment)}' requires a Structure-typed parent value.`,
                    invalidNode: segment.segment,
                    namedSegments,
                };
            }

            finalField = this.resolveNamedSegment(segment.segment as ast.CfgNamedSegment, candidates);
            if (!finalField) {
                return {
                    active: true,
                    finalField,
                    finalType: currentType,
                    invalidMessage: `The path segment '${this.getSegmentText(segment.segment)}' shall resolve to a Field of the current Structure value.`,
                    invalidNode: segment.segment,
                    namedSegments,
                };
            }
            currentType = finalField.type.ref;
        }

        return {
            active: true,
            finalField,
            finalType: currentType,
            namedSegments,
        };
    }

    protected getBaseComponentStackForComponentPath(path: ast.CfgPath): readonly ast.Component[] | undefined {
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

    protected getCfgPathSegments(path: ast.CfgPath): Array<ast.CfgPathElement | ast.CfgPathSegment> {
        const segments: Array<ast.CfgPathElement | ast.CfgPathSegment> = [];
        if (path.head) {
            segments.push(path.head);
        }
        segments.push(...path.elements);
        return segments;
    }

    protected stringifyCfgPathSegment(segment: ast.CfgPathSegment): string {
        if (ast.isCfgNamedSegment(segment)) {
            return this.getSegmentText(segment);
        }
        if (ast.isCfgParentSegment(segment)) {
            return '..';
        }
        return '.';
    }

    protected getSegmentText(segment: ast.CfgNamedSegment | ast.CfgPathSegment): string {
        if (ast.isCfgNamedSegment(segment)) {
            return segment.reference?.ref?.name ?? segment.reference?.$refText ?? '';
        }
        if (ast.isCfgParentSegment(segment)) {
            return '..';
        }
        return '.';
    }

    protected getChildComponent(member: ast.NamedElement): ast.Component | undefined {
        if (ast.isContainer(member)) {
            if (ast.isComponent(member.defaultComponent?.ref)) {
                return member.defaultComponent.ref;
            }
            if (ast.isComponent(member.type.ref)) {
                return member.type.ref;
            }
            return undefined;
        }
        if (ast.isReference(member) && ast.isComponent(member.interface.ref)) {
            return member.interface.ref;
        }
        return undefined;
    }

    protected resolveNamedSegment<T extends ast.NamedElement>(segment: ast.CfgNamedSegment, candidates: readonly T[]): T | undefined {
        const linked = segment.reference?.ref;
        if (linked && candidates.includes(linked as T)) {
            return linked as T;
        }
        const refText = segment.reference?.$refText;
        return refText ? candidates.find(candidate => candidate.name === refText) : undefined;
    }

    protected collectComponentPathMembers(
        type: ast.Type | undefined,
        members: Map<string, ast.Container | ast.Reference>,
        visited: Set<ast.Type>,
    ): void {
        if (!type || visited.has(type)) {
            return;
        }
        visited.add(type);

        if (ast.isComponent(type)) {
            for (const element of type.elements) {
                if ((ast.isContainer(element) || ast.isReference(element)) && element.name && !members.has(element.name)) {
                    members.set(element.name, element);
                }
            }
            this.collectComponentPathMembers(type.base?.ref, members, visited);
            for (const base of type.interface) {
                this.collectComponentPathMembers(base.ref, members, visited);
            }
            return;
        }

        if (ast.isInterface(type)) {
            for (const base of type.base) {
                this.collectComponentPathMembers(base.ref, members, visited);
            }
        }
    }

    protected collectFieldMembers(type: ast.Type | undefined, members: Map<string, ast.Field>, visited: Set<ast.Type>): void {
        if (!type || visited.has(type)) {
            return;
        }
        visited.add(type);

        if (ast.isComponent(type) || ast.isStructure(type)) {
            for (const element of type.elements) {
                if (ast.isField(element) && element.name && !members.has(element.name)) {
                    members.set(element.name, element);
                }
            }
        }

        if (ast.isComponent(type)) {
            this.collectFieldMembers(type.base?.ref, members, visited);
            return;
        }

        if (ast.isClass(type)) {
            this.collectFieldMembers(type.base?.ref, members, visited);
        }
    }
}
