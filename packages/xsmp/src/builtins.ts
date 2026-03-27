import type { URI } from 'vscode-uri';

export const builtInScheme = 'xsmp';
export const smpMirrorScheme = 'xsmp-smp';

export function isBuiltinLibrary(uri: URI): boolean {
    return uri.scheme === builtInScheme;
}

export function isSmpMirrorDocument(uri: URI): boolean {
    return uri.scheme === smpMirrorScheme;
}
