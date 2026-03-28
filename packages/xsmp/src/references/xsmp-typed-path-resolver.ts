import type { AstNode } from 'langium';
import * as ast from '../generated/ast-partial.js';
import type { XsmpSharedServices } from '../xsmp-module.js';
import type { IdentifierPatternService, TemplateBindings } from './identifier-pattern-service.js';
import type { XsmpPathService } from './xsmp-path-service.js';

type RecoverableType = ast.Type;
type RecoverableComponent = ast.Component;
type RecoverableNamedElement = ast.NamedElement;
type RecoverablePathElement = ast.PathElement;
type RecoverablePathSegment = ast.PathSegment;
type RecoverablePathNamedSegment = ast.PathNamedSegment;

export interface TypedComponentPathResolution {
    active: boolean;
    finalComponent?: ast.Component;
    finalStack?: readonly ast.Component[];
    invalidMessage?: string;
    invalidNode?: AstNode;
    namedSegments: ReadonlyMap<ast.PathNamedSegment, readonly ast.NamedElement[]>;
    parentStackForUntypedTarget?: readonly ast.Component[];
}

export interface TypedFieldPathResolution {
    active: boolean;
    finalField?: ast.Field;
    finalType?: ast.Type;
    invalidMessage?: string;
    invalidNode?: AstNode;
    namedSegments: ReadonlyMap<ast.PathNamedSegment, readonly ast.Field[]>;
}

export interface TypedMemberPathResolution<T extends ast.NamedElement = ast.NamedElement> {
    active: boolean;
    finalElement?: T;
    finalType?: ast.Type;
    finalComponent?: ast.Component;
    invalidMessage?: string;
    invalidNode?: AstNode;
    namedSegments: ReadonlyMap<ast.PathNamedSegment, readonly ast.NamedElement[]>;
}

export interface TypedFieldTailResolution {
    finalField: ast.Field;
    finalType?: ast.Type;
    invalidMessage?: string;
    invalidNode?: AstNode;
}

export interface TypedFieldPathMessages {
    absoluteMessage: string;
    pathRuleMessage: string;
    startMessage: string;
    firstMissingMessage: (segmentText: string) => string;
    structureRequiredMessage: (segmentText: string) => string;
    structureFieldMessage: (segmentText: string) => string;
}

export interface TypedComponentMemberPathOptions<T extends ast.NamedElement> {
    getFinalCandidates: (component: ast.Component | undefined) => readonly T[];
    getFinalType?: (element: T) => ast.Type | undefined;
    indexMessage: string;
    containerOrReferenceMessage: (segmentText: string) => string;
    finalMissingMessage: (segmentText: string) => string;
    parentMessage: string;
}

export interface TypedComponentFieldPathOptions {
    getFinalCandidates: (component: ast.Component | undefined) => readonly ast.Field[];
    indexMessage: string;
    containerOrReferenceMessage: (segmentText: string) => string;
    finalMissingMessage: (segmentText: string) => string;
    pathRuleMessage: string;
    structureRequiredMessage: (segmentText: string) => string;
    structureFieldMessage: (segmentText: string) => string;
    parentMessage: string;
}

export const componentModeFieldPathMessages: TypedFieldPathMessages = {
    absoluteMessage: 'Field paths in component mode shall only use field names, "." member access and array indices.',
    pathRuleMessage: 'Field paths in component mode shall only use field names, "." member access and array indices.',
    startMessage: 'Field paths in component mode shall start with a Field of the configured Component.',
    firstMissingMessage: (segmentText) => `The path segment '${segmentText}' shall resolve to a Field of the configured Component.`,
    structureRequiredMessage: (segmentText) => `The path segment '${segmentText}' requires a Structure-typed parent value.`,
    structureFieldMessage: (segmentText) => `The path segment '${segmentText}' shall resolve to a Field of the current Structure value.`,
};

export class XsmpTypedPathResolver {
    protected readonly pathService: XsmpPathService;
    protected readonly identifierPatternService: IdentifierPatternService;

    constructor(services: XsmpSharedServices) {
        this.pathService = services.PathService;
        this.identifierPatternService = services.IdentifierPatternService;
    }

    getFieldCandidatesForType(type: RecoverableType | undefined): readonly ast.Field[] {
        const result = new Map<string, ast.Field>();
        this.collectFieldMembers(type, result, new Set<ast.Type>());
        return [...result.values()];
    }

    getComponentPathMembers(component: RecoverableComponent | undefined): ReadonlyArray<ast.Container | ast.Reference> {
        const result = new Map<string, ast.Container | ast.Reference>();
        this.collectComponentPathMembers(component, result, new Set<ast.Type>());
        return [...result.values()];
    }

    getChildComponentForPathMember(member: RecoverableNamedElement): ast.Component | undefined {
        if (ast.isContainer(member)) {
            if (ast.isComponent(member.defaultComponent?.ref)) {
                return member.defaultComponent.ref;
            }
            if (ast.isComponent(member.type?.ref)) {
                return member.type.ref;
            }
            return undefined;
        }
        if (ast.isReference(member) && ast.isComponent(member.interface?.ref)) {
            return member.interface.ref;
        }
        return undefined;
    }

    resolveComponentPath(path: ast.Path, initialStack: readonly ast.Component[] | undefined, bindings?: TemplateBindings): TypedComponentPathResolution {
        const namedSegments = new Map<ast.PathNamedSegment, readonly ast.NamedElement[]>();
        if (!initialStack || initialStack.length === 0) {
            return { active: false, namedSegments };
        }

        const stack = path.absolute ? [initialStack[0]] : [...initialStack];
        const segments = this.pathService.getPathSegments(path);
        if (segments.length === 0) {
            if (path.absolute) {
                return {
                    active: true,
                    finalComponent: stack[0],
                    finalStack: [stack[0]],
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

        let currentComponent: ast.Component | undefined = stack.at(-1);
        let parentStackForUntypedTarget: readonly ast.Component[] | undefined;

        for (const segment of segments) {
            if (ast.isPathIndex(segment)) {
                continue;
            }
            if (!currentComponent) {
                break;
            }
            const actualSegment = ast.isPathMember(segment) ? segment.segment : segment;
            if (ast.isPathSelfSegment(actualSegment)) {
                continue;
            }
            if (ast.isPathParentSegment(actualSegment)) {
                if (stack.length <= 1) {
                    return {
                        active: true,
                        invalidMessage: 'The path segment ".." shall not navigate above the typed component context.',
                        invalidNode: actualSegment,
                        namedSegments,
                    };
                }
                stack.pop();
                currentComponent = stack.at(-1);
                parentStackForUntypedTarget = undefined;
                continue;
            }
            if (!ast.isPathNamedSegment(actualSegment)) {
                continue;
            }

            const candidates = this.getComponentPathMembers(currentComponent);
            namedSegments.set(actualSegment, candidates);
            const resolved = this.resolveNamedElement(actualSegment, candidates, bindings);
            if (!resolved) {
                return {
                    active: true,
                    invalidMessage: `The path segment '${this.pathService.getSegmentText(actualSegment)}' shall resolve to a Container or Reference of the current Component.`,
                    invalidNode: actualSegment,
                    namedSegments,
                };
            }
            const nextComponent = this.getChildComponentForPathMember(resolved);
            if (nextComponent) {
                stack.push(nextComponent);
                currentComponent = nextComponent;
                parentStackForUntypedTarget = undefined;
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

    resolveFieldPath(
        path: ast.Path,
        component: ast.Component | undefined,
        messages: TypedFieldPathMessages,
        bindings?: TemplateBindings,
    ): TypedFieldPathResolution {
        const namedSegments = new Map<ast.PathNamedSegment, readonly ast.Field[]>();
        if (!component) {
            return { active: false, namedSegments };
        }
        if (path.absolute) {
            return {
                active: true,
                invalidMessage: messages.absoluteMessage,
                invalidNode: path,
                namedSegments,
            };
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

        const first = segments[0];
        if (ast.isPathIndex(first) || ast.isPathParentSegment(first) || ast.isPathSelfSegment(first) || (ast.isPathMember(first) && first.separator === '/')) {
            return {
                active: true,
                invalidMessage: messages.pathRuleMessage,
                invalidNode: ast.isPathMember(first) ? first.segment : first,
                namedSegments,
            };
        }

        const firstSegment = ast.isPathMember(first) ? first.segment : first;
        if (!ast.isPathNamedSegment(firstSegment)) {
            return {
                active: true,
                invalidMessage: messages.startMessage,
                invalidNode: firstSegment,
                namedSegments,
            };
        }

        const firstCandidates = this.getFieldCandidatesForType(component);
        namedSegments.set(firstSegment, firstCandidates);
        const firstField = this.resolveNamedElement(firstSegment, firstCandidates, bindings);
        if (!firstField) {
            return {
                active: true,
                invalidMessage: messages.firstMissingMessage(this.pathService.getSegmentText(firstSegment)),
                invalidNode: firstSegment,
                namedSegments,
            };
        }

        const tail = this.resolveFieldTail(
            segments,
            1,
            firstField,
            firstField.type?.ref,
            (segment, candidates) => namedSegments.set(segment, candidates),
            messages.pathRuleMessage,
            messages.structureRequiredMessage,
            messages.structureFieldMessage,
        );
        return {
            active: true,
            finalField: tail.finalField,
            finalType: tail.finalType,
            invalidMessage: tail.invalidMessage,
            invalidNode: tail.invalidNode,
            namedSegments,
        };
    }

    resolveComponentMemberPath<T extends ast.NamedElement>(
        path: ast.Path,
        baseStack: readonly ast.Component[] | undefined,
        options: TypedComponentMemberPathOptions<T>,
        bindings?: TemplateBindings,
    ): TypedMemberPathResolution<T> {
        const namedSegments = new Map<ast.PathNamedSegment, readonly ast.NamedElement[]>();
        if (!baseStack || baseStack.length === 0) {
            return { active: false, namedSegments };
        }

        const stack = path.absolute ? [baseStack[0]] : [...baseStack];
        let currentComponent = stack.at(-1);
        const segments = this.pathService.getPathSegments(path);
        if (segments.length === 0) {
            return {
                active: true,
                invalidMessage: 'A path shall not be empty.',
                invalidNode: path,
                namedSegments,
            };
        }

        for (let index = 0; index < segments.length; index++) {
            const segment = segments[index];
            if (ast.isPathIndex(segment)) {
                return {
                    active: true,
                    finalComponent: currentComponent,
                    invalidMessage: options.indexMessage,
                    invalidNode: segment,
                    namedSegments,
                };
            }

            const actualSegment = ast.isPathMember(segment) ? segment.segment : segment;
            if (ast.isPathSelfSegment(actualSegment)) {
                continue;
            }
            if (ast.isPathParentSegment(actualSegment)) {
                if (stack.length <= 1) {
                    return {
                        active: true,
                        finalComponent: currentComponent,
                        invalidMessage: options.parentMessage,
                        invalidNode: actualSegment,
                        namedSegments,
                    };
                }
                stack.pop();
                currentComponent = stack.at(-1);
                continue;
            }
            if (!ast.isPathNamedSegment(actualSegment)) {
                return {
                    active: true,
                    finalComponent: currentComponent,
                    invalidMessage: options.containerOrReferenceMessage(this.pathService.getSegmentText(actualSegment)),
                    invalidNode: actualSegment,
                    namedSegments,
                };
            }

            const isLast = index === segments.length - 1;
            if (isLast) {
                const candidates = options.getFinalCandidates(currentComponent);
                namedSegments.set(actualSegment, candidates);
                const resolved = this.resolveNamedElement(actualSegment, candidates, bindings);
                if (!resolved) {
                    return {
                        active: true,
                        finalComponent: currentComponent,
                        invalidMessage: options.finalMissingMessage(this.pathService.getSegmentText(actualSegment)),
                        invalidNode: actualSegment,
                        namedSegments,
                    };
                }
                return {
                    active: true,
                    finalElement: resolved,
                    finalType: options.getFinalType?.(resolved),
                    finalComponent: currentComponent,
                    namedSegments,
                };
            }

            const candidates = this.getComponentPathMembers(currentComponent);
            namedSegments.set(actualSegment, candidates);
            const resolved = this.resolveNamedElement(actualSegment, candidates, bindings);
            const nextComponent = resolved ? this.getChildComponentForPathMember(resolved) : undefined;
            if (!resolved || !nextComponent) {
                return {
                    active: true,
                    finalComponent: currentComponent,
                    invalidMessage: options.containerOrReferenceMessage(this.pathService.getSegmentText(actualSegment)),
                    invalidNode: actualSegment,
                    namedSegments,
                };
            }
            stack.push(nextComponent);
            currentComponent = nextComponent;
        }

        return { active: true, finalComponent: currentComponent, namedSegments };
    }

    resolveComponentFieldPath(
        path: ast.Path,
        baseStack: readonly ast.Component[] | undefined,
        options: TypedComponentFieldPathOptions,
        bindings?: TemplateBindings,
    ): TypedMemberPathResolution<ast.Field> {
        const namedSegments = new Map<ast.PathNamedSegment, readonly ast.NamedElement[]>();
        if (!baseStack || baseStack.length === 0) {
            return { active: false, namedSegments };
        }

        const stack = path.absolute ? [baseStack[0]] : [...baseStack];
        let currentComponent = stack.at(-1);
        const segments = this.pathService.getPathSegments(path);
        if (segments.length === 0) {
            return {
                active: true,
                invalidMessage: 'A path shall not be empty.',
                invalidNode: path,
                namedSegments,
            };
        }

        for (let index = 0; index < segments.length; index++) {
            const segment = segments[index];
            if (ast.isPathIndex(segment)) {
                return {
                    active: true,
                    finalComponent: currentComponent,
                    invalidMessage: options.indexMessage,
                    invalidNode: segment,
                    namedSegments,
                };
            }

            const actualSegment = ast.isPathMember(segment) ? segment.segment : segment;
            if (ast.isPathSelfSegment(actualSegment)) {
                continue;
            }
            if (ast.isPathParentSegment(actualSegment)) {
                if (stack.length <= 1) {
                    return {
                        active: true,
                        finalComponent: currentComponent,
                        invalidMessage: options.parentMessage,
                        invalidNode: actualSegment,
                        namedSegments,
                    };
                }
                stack.pop();
                currentComponent = stack.at(-1);
                continue;
            }
            if (!ast.isPathNamedSegment(actualSegment)) {
                return {
                    active: true,
                    finalComponent: currentComponent,
                    invalidMessage: options.containerOrReferenceMessage(this.pathService.getSegmentText(actualSegment)),
                    invalidNode: actualSegment,
                    namedSegments,
                };
            }

            const childCandidates = this.getComponentPathMembers(currentComponent);
            const fieldCandidates = options.getFinalCandidates(currentComponent);
            const resolvedField = this.resolveNamedElement(actualSegment, fieldCandidates, bindings);
            const isLast = index === segments.length - 1;

            if (isLast || !this.hasTraversableChild(actualSegment, childCandidates, bindings)) {
                namedSegments.set(actualSegment, fieldCandidates);
                if (!resolvedField) {
                    return {
                        active: true,
                        finalComponent: currentComponent,
                        invalidMessage: options.finalMissingMessage(this.pathService.getSegmentText(actualSegment)),
                        invalidNode: actualSegment,
                        namedSegments,
                    };
                }

                const tail = this.resolveFieldTail(
                    segments,
                    index + 1,
                    resolvedField,
                    resolvedField.type?.ref,
                    (fieldSegment, candidates) => namedSegments.set(fieldSegment, candidates),
                    options.pathRuleMessage,
                    options.structureRequiredMessage,
                    options.structureFieldMessage,
                );
                return {
                    active: true,
                    finalElement: tail.finalField,
                    finalType: tail.finalType,
                    finalComponent: currentComponent,
                    invalidMessage: tail.invalidMessage,
                    invalidNode: tail.invalidNode,
                    namedSegments,
                };
            }

            namedSegments.set(actualSegment, childCandidates);
            const child = this.resolveNamedElement(actualSegment, childCandidates, bindings);
            const nextComponent = child ? this.getChildComponentForPathMember(child) : undefined;
            if (!nextComponent) {
                return {
                    active: true,
                    finalComponent: currentComponent,
                    invalidMessage: options.containerOrReferenceMessage(this.pathService.getSegmentText(actualSegment)),
                    invalidNode: actualSegment,
                    namedSegments,
                };
            }
            stack.push(nextComponent);
            currentComponent = nextComponent;
        }

        return { active: true, finalComponent: currentComponent, namedSegments };
    }

    resolveFieldTail(
        segments: Array<RecoverablePathElement | RecoverablePathSegment>,
        startIndex: number,
        initialField: ast.Field,
        initialType: ast.Type | undefined,
        setNamedSegmentCandidates: (segment: RecoverablePathNamedSegment, candidates: readonly ast.Field[]) => void,
        pathRuleMessage: string,
        structureRequiredMessage: (segmentText: string) => string,
        structureFieldMessage: (segmentText: string) => string,
    ): TypedFieldTailResolution {
        let finalField = initialField;
        let currentType = initialType;

        for (let index = startIndex; index < segments.length; index++) {
            const segment = segments[index];
            if (ast.isPathIndex(segment)) {
                if (!currentType || !ast.isArrayType(currentType)) {
                    return {
                        finalField,
                        finalType: currentType,
                        invalidMessage: 'Array indices shall only be applied to array-typed values.',
                        invalidNode: segment,
                    };
                }
                currentType = currentType.itemType?.ref;
                continue;
            }

            const actualSegment = ast.isPathMember(segment) ? segment.segment : segment;
            if (ast.isPathParentSegment(actualSegment) || ast.isPathSelfSegment(actualSegment)) {
                return {
                    finalField,
                    finalType: currentType,
                    invalidMessage: pathRuleMessage,
                    invalidNode: actualSegment,
                };
            }

            if (ast.isPathNamedSegment(segment)) {
                return {
                    finalField,
                    finalType: currentType,
                    invalidMessage: `The path segment '${this.pathService.getSegmentText(segment)}' requires "." member access.`,
                    invalidNode: segment,
                };
            }

            if (!ast.isPathMember(segment) || segment.separator !== '.') {
                return {
                    finalField,
                    finalType: currentType,
                    invalidMessage: pathRuleMessage,
                    invalidNode: ast.isPathMember(segment) ? segment.segment : actualSegment,
                };
            }
            if (!ast.isPathNamedSegment(segment.segment)) {
                return {
                    finalField,
                    finalType: currentType,
                    invalidMessage: pathRuleMessage,
                    invalidNode: segment.segment,
                };
            }

            const candidates = this.getFieldCandidatesForType(currentType);
            setNamedSegmentCandidates(segment.segment, candidates);
            if (candidates.length === 0) {
                return {
                    finalField,
                    finalType: currentType,
                    invalidMessage: structureRequiredMessage(this.pathService.getSegmentText(segment.segment)),
                    invalidNode: segment.segment,
                };
            }

            const resolvedField = this.resolveNamedElement(segment.segment, candidates);
            if (!resolvedField) {
                return {
                    finalField,
                    finalType: currentType,
                    invalidMessage: structureFieldMessage(this.pathService.getSegmentText(segment.segment)),
                    invalidNode: segment.segment,
                };
            }
            finalField = resolvedField;
            currentType = finalField.type?.ref;
        }

        return {
            finalField,
            finalType: currentType,
        };
    }

    protected hasTraversableChild(
        segment: RecoverablePathNamedSegment,
        candidates: ReadonlyArray<ast.Container | ast.Reference>,
        bindings?: TemplateBindings,
    ): boolean {
        const child = this.resolveNamedElement(segment, candidates, bindings);
        return Boolean(child && this.getChildComponentForPathMember(child));
    }

    resolveNamedElement<T extends ast.NamedElement>(segment: RecoverablePathNamedSegment, candidates: readonly T[], bindings?: TemplateBindings): T | undefined {
        if (ast.isConcretePathNamedSegment(segment)) {
            const linked = segment.reference?.ref;
            if (linked && candidates.includes(linked as T)) {
                return linked as T;
            }
            const refText = segment.reference?.$refText;
            return refText ? candidates.find(candidate => candidate.name === refText) : undefined;
        }
        const matches = this.identifierPatternService.matchCandidates(segment, candidates, candidate => candidate.name, bindings).matches;
        return matches.length === 1 ? matches[0] : undefined;
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
