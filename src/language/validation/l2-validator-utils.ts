import type { AstNode, Properties, ValidationAcceptor } from 'langium';
import * as Duration from '../utils/duration.js';
const dateTimeRegex = /^\d{4}-\d{2}-\d{2}T.+$/;

export function hasParentTraversal(path: string | undefined): boolean {
    return path?.includes('..') ?? false;
}

export function checkNoParentTraversal<N extends AstNode>(
    accept: ValidationAcceptor,
    node: N,
    path: string | undefined,
    property: Properties<N>,
): void {
    if (hasParentTraversal(path)) {
        accept('error', 'Paths shall not contain \'..\'.', { node, property });
    }
}

export function checkRelativePath<N extends AstNode>(
    accept: ValidationAcceptor,
    node: N,
    path: string | undefined,
    property: Properties<N>,
    label: string,
): void {
    if (path?.startsWith('/')) {
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
