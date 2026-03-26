import * as ast from '../generated/ast.js';
import type { XsmpSharedServices } from '../xsmp-module.js';

export class XsmpPathService {
    constructor(_services: XsmpSharedServices) { }

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
        if (ast.isPathNamedSegment(segment)) {
            return segment.reference?.ref?.name ?? segment.reference?.$refText ?? '';
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
}
