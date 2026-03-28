import * as path from 'node:path';

export function isSameOrContainedPath(parentPath: string, childPath: string, pathModule: typeof path = path.posix): boolean {
    const relative = pathModule.relative(parentPath, childPath);
    return relative === '' || (!relative.startsWith('..') && !pathModule.isAbsolute(relative));
}

export function toXsmpIdentifier(value: string): string {
    return value.replaceAll(/[.-]+/g, '_');
}
