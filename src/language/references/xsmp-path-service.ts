import * as ast from '../generated/ast.js';
import type { XsmpSharedServices } from '../xsmp-module.js';
import type { IdentifierPatternService } from './identifier-pattern-service.js';

export class XsmpPathService {
    protected readonly identifierPatternService: IdentifierPatternService;

    constructor(services: XsmpSharedServices) {
        this.identifierPatternService = services.IdentifierPatternService;
    }

    stringifyPath(path: ast.Path | undefined, includeUnsafe = false): string | undefined {
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
            if (ast.isPathMember(element)) {
                text += `${element.separator}${this.stringifyPathSegment(element.segment)}`;
            } else if (ast.isPathIndex(element)) {
                text += `[${element.index}]`;
            }
        }
        return text;
    }

    stringifyLocalNamedReference(reference: ast.LocalNamedReference | undefined, includeUnsafe = true): string | undefined {
        if (!reference) {
            return undefined;
        }
        const text = this.getLocalNamedReferenceText(reference);
        if (!text) {
            return undefined;
        }
        return includeUnsafe && reference.unsafe ? `unsafe ${text}` : text;
    }

    getPathSegments(path: ast.Path): Array<ast.PathElement | ast.PathSegment> {
        const segments: Array<ast.PathElement | ast.PathSegment> = [];
        if (path.head) {
            segments.push(path.head);
        }
        segments.push(...path.elements);
        return segments;
    }

    hasParentTraversal(path: ast.Path | undefined): boolean {
        return path ? this.getPathSegments(path).some(segment => ast.isPathParentSegment(ast.isPathMember(segment) ? segment.segment : segment)) : false;
    }

    isAbsolute(path: ast.Path | undefined): boolean {
        return path?.absolute ?? false;
    }

    getSegmentText(segment: ast.PathNamedSegment | ast.PathSegment): string {
        if (ast.isConcretePathNamedSegment(segment)) {
            return this.getLocalNamedReferenceText(segment);
        }
        if (ast.isPatternPathNamedSegment(segment)) {
            return this.identifierPatternService.stringifyPattern(segment.pattern) ?? '';
        }
        if (ast.isPathParentSegment(segment)) {
            return '..';
        }
        return '.';
    }

    protected stringifyPathSegment(segment: ast.PathSegment): string {
        if (ast.isPathNamedSegment(segment)) {
            return this.getSegmentText(segment);
        }
        if (ast.isPathParentSegment(segment)) {
            return '..';
        }
        return '.';
    }

    getLocalNamedReferenceText(reference: ast.LocalNamedReference): string {
        return reference.reference?.ref?.name ?? reference.reference?.$refText ?? reference.strReference ?? '';
    }
}
