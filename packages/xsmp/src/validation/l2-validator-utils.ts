import type { AstNode, Properties, ValidationAcceptor } from 'langium';
import * as ast from '../generated/ast-partial.js';
import * as Duration from '../utils/duration.js';

const dateTimeRegex = /^\d{4}-\d{2}-\d{2}T.+$/;
const l2ExpandedIdentifierRegex = /^[_a-zA-Z]\w*$/;

function isParentSegment(segment: ast.PathElement | ast.PathSegment): boolean {
    return ast.isPathParentSegment(ast.isPathMember(segment) ? segment.segment : segment);
}

export function isAbsolutePath(path: string | ast.Path | undefined): boolean {
    return typeof path === 'string' ? path.startsWith('/') : path?.absolute ?? false;
}

export function hasParentTraversal(path: string | ast.Path | undefined): boolean {
    if (typeof path === 'string') {
        return path.includes('..');
    }
    if (!path) {
        return false;
    }
    const segments: Array<ast.PathElement | ast.PathSegment> = [];
    if (path.head) {
        segments.push(path.head);
    }
    segments.push(...path.elements);
    return segments.some(isParentSegment);
}

export function checkNoParentTraversal<N extends AstNode>(
    accept: ValidationAcceptor,
    node: N,
    path: string | ast.Path | undefined,
    property: Properties<N>,
): void {
    if (hasParentTraversal(path)) {
        accept('error', 'Paths shall not contain \'..\'.', { node, property });
    }
}

export function checkRelativePath<N extends AstNode>(
    accept: ValidationAcceptor,
    node: N,
    path: string | ast.Path | undefined,
    property: Properties<N>,
    label: string,
): void {
    if (isAbsolutePath(path)) {
        accept('error', `${label} shall be relative.`, { node, property });
    }
}

export function checkValidDuration<N extends AstNode>(
    accept: ValidationAcceptor,
    node: N,
    value: string | undefined,
    property: Properties<N>,
    label: string,
): void {
    if (!value) {
        return;
    }
    try {
        Duration.parse(value);
    } catch {
        accept('error', `${label} shall be a valid Duration (e.g: PT1S).`, { node, property });
    }
}

export function checkValidDateTime<N extends AstNode>(
    accept: ValidationAcceptor,
    node: N,
    value: string | undefined,
    property: Properties<N>,
    label: string,
): void {
    if (!value) {
        return;
    }
    if (!dateTimeRegex.test(value) || Number.isNaN(Date.parse(value))) {
        accept('error', `${label} shall be a valid DateTime (e.g: 1970-01-01T00:00:00Z).`, { node, property });
    }
}

export function checkNonNegativeBigInt<N extends AstNode>(
    accept: ValidationAcceptor,
    node: N,
    value: bigint | undefined,
    property: Properties<N>,
    label: string,
): void {
    if (value !== undefined && value < BigInt(0)) {
        accept('error', `${label} shall be a positive number or 0.`, { node, property });
    }
}

export function isValidExpandedL2Identifier(value: string | undefined): value is string {
    return value !== undefined && l2ExpandedIdentifierRegex.test(value);
}
