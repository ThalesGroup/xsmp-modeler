import { URI } from 'langium';
import * as path from 'node:path';
import { smpMirrorScheme } from '../builtins.js';
import type { SmpImportKind } from './import/shared.js';

const sourceExtensionToKind = new Map<string, SmpImportKind>([
    ['.smpcat', 'catalogue'],
    ['.smpcfg', 'configuration'],
    ['.smplnk', 'linkbase'],
    ['.smpasb', 'assembly'],
    ['.smpsed', 'schedule'],
]);

const kindToMirrorExtension = new Map<SmpImportKind, string>([
    ['catalogue', '.xsmpcat'],
    ['configuration', '.xsmpcfg'],
    ['linkbase', '.xsmplnk'],
    ['assembly', '.xsmpasb'],
    ['schedule', '.xsmpsed'],
]);

const mirrorExtensionToSource = new Map<string, string>(
    [...sourceExtensionToKind.entries()].map(([sourceExtension, kind]) => [kindToMirrorExtension.get(kind)!, sourceExtension]),
);

const xsmpSourceExtensions = new Set(kindToMirrorExtension.values());

export interface SmpMirrorDescriptor {
    readonly kind: SmpImportKind;
    readonly sourcePath: string;
    readonly sourceUri: URI;
    readonly mirrorUri: URI;
}

export function isSmpSourceFilePath(filePath: string): boolean {
    return sourceExtensionToKind.has(path.extname(filePath));
}

export function isXsmpSourceFilePath(filePath: string): boolean {
    return xsmpSourceExtensions.has(path.extname(filePath));
}

export function getSmpMirrorKind(filePath: string): SmpImportKind | undefined {
    return sourceExtensionToKind.get(path.extname(filePath));
}

export function getSmpMirrorExtension(kind: SmpImportKind): string {
    return kindToMirrorExtension.get(kind)!;
}

export function getXsmpHomologuePath(sourcePath: string): string {
    const kind = getSmpMirrorKind(sourcePath);
    if (!kind) {
        return `${sourcePath}.xsmp`;
    }
    return sourcePath.slice(0, -path.extname(sourcePath).length) + getSmpMirrorExtension(kind);
}

export function getSmpSourcePathFromMirrorPath(mirrorPath: string): string | undefined {
    const sourceExtension = mirrorExtensionToSource.get(path.extname(mirrorPath));
    if (!sourceExtension) {
        return undefined;
    }
    return mirrorPath.slice(0, -path.extname(mirrorPath).length) + sourceExtension;
}

export function createSmpMirrorDescriptor(sourcePath: string): SmpMirrorDescriptor | undefined {
    const kind = getSmpMirrorKind(sourcePath);
    if (!kind) {
        return undefined;
    }

    const sourceUri = URI.file(path.resolve(sourcePath));
    return {
        kind,
        sourcePath: sourceUri.fsPath,
        sourceUri,
        mirrorUri: sourceUri.with({
            scheme: smpMirrorScheme,
            path: sourceUri.path.slice(0, -path.extname(sourceUri.path).length) + getSmpMirrorExtension(kind),
        }),
    };
}

export function getSmpMirrorSourceUri(uri: URI): URI | undefined {
    if (uri.scheme !== smpMirrorScheme) {
        return undefined;
    }
    const sourcePath = getSmpSourcePathFromMirrorPath(uri.path);
    return sourcePath ? URI.file(sourcePath) : undefined;
}
