import type { URI } from 'vscode-uri';

export const builtInScheme = 'xsmp';
export const smpMirrorScheme = 'xsmp-smp';

const standardBuiltinExportNames = new Map<string, string>([
    ['ecss.smp@ECSS_SMP_2020.xsmpcat', 'http://www.ecss.nl/smp/2019/Smdl'],
    ['ecss.smp@ECSS_SMP_2025.xsmpcat', 'http://www.ecss.nl/smp/2019/Smdl'],
    ['ecss.smp.l2@ECSS_SMP_2025.xsmpcat', 'ecss.smp.l2.smpcat'],
]);

export function isBuiltinLibrary(uri: URI): boolean {
    return uri.scheme === builtInScheme;
}

export function isSmpMirrorDocument(uri: URI): boolean {
    return uri.scheme === smpMirrorScheme;
}

export function getBuiltinFileName(uri: URI): string {
    const lastSlash = uri.path.lastIndexOf('/');
    return lastSlash >= 0 ? uri.path.slice(lastSlash + 1) : uri.path;
}

export function getStandardBuiltinExportName(uri: URI): string | undefined {
    if (!isBuiltinLibrary(uri)) {
        return undefined;
    }
    return standardBuiltinExportNames.get(getBuiltinFileName(uri));
}

export function isStandardBuiltinLibrary(uri: URI): boolean {
    return getStandardBuiltinExportName(uri) !== undefined;
}
