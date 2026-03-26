import * as partialAst from '../generated/ast-partial.js';
import type { XsmpSharedServices } from '../xsmp-module.js';
import type { IdentifierPatternService } from './identifier-pattern-service.js';

type RecoverablePath = partialAst.Path;
type RecoverablePathSegment = partialAst.PathSegment;
type RecoverablePathNamedSegment = partialAst.PathNamedSegment;
type RecoverableLocalNamedReference = partialAst.LocalNamedReference;

export class XsmpPathService {
    protected readonly identifierPatternService: IdentifierPatternService;

    constructor(services: XsmpSharedServices) {
        this.identifierPatternService = services.IdentifierPatternService;
    }

    stringifyPath(path: RecoverablePath | undefined, includeUnsafe = false): string | undefined {
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
            text += this.stringifyPathSegment(path.head);
        }
        for (const element of path.elements) {
            if (partialAst.isPathMember(element) && element.segment) {
                text += `${element.separator}${this.stringifyPathSegment(element.segment)}`;
            } else if (partialAst.isPathIndex(element)) {
                text += `[${element.index}]`;
            }
        }
        return text;
    }

    stringifyLocalNamedReference(reference: RecoverableLocalNamedReference | undefined, includeUnsafe = true): string | undefined {
        if (!reference) {
            return undefined;
        }
        const text = this.getLocalNamedReferenceText(reference);
        if (!text) {
            return undefined;
        }
        return includeUnsafe && reference.unsafe ? `unsafe ${text}` : text;
    }

    getPathSegments<T extends RecoverablePath>(path: T): Array<NonNullable<T['head']> | T['elements'][number]> {
        const segments: Array<NonNullable<T['head']> | T['elements'][number]> = [];
        if (path.head) {
            segments.push(path.head);
        }
        segments.push(...path.elements);
        return segments;
    }

    hasParentTraversal(path: RecoverablePath | undefined): boolean {
        return path ? this.getPathSegments(path).some(segment => partialAst.isPathParentSegment(partialAst.isPathMember(segment) ? segment.segment : segment)) : false;
    }

    isAbsolute(path: RecoverablePath | undefined): boolean {
        return path?.absolute ?? false;
    }

    getSegmentText(segment: RecoverablePathNamedSegment | RecoverablePathSegment | undefined): string {
        if (!segment) {
            return '';
        }
        if (partialAst.isConcretePathNamedSegment(segment)) {
            return this.getLocalNamedReferenceText(segment);
        }
        if (partialAst.isPatternPathNamedSegment(segment)) {
            return this.identifierPatternService.stringifyPattern(segment.pattern) ?? '';
        }
        if (partialAst.isPathParentSegment(segment)) {
            return '..';
        }
        return '.';
    }

    protected stringifyPathSegment(segment: RecoverablePathSegment | undefined): string {
        if (!segment) {
            return '';
        }
        if (partialAst.isPathNamedSegment(segment)) {
            return this.getSegmentText(segment);
        }
        if (partialAst.isPathParentSegment(segment)) {
            return '..';
        }
        return '.';
    }

    getLocalNamedReferenceText(reference: RecoverableLocalNamedReference | undefined): string {
        if (!reference) {
            return '';
        }
        return reference.reference?.ref?.name ?? reference.reference?.$refText ?? reference.strReference ?? '';
    }
}
