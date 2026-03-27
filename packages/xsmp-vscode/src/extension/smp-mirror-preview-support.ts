import { createSmpMirrorDescriptor, getSmpSourcePathFromMirrorPath, isSmpSourceFilePath } from 'xsmp/smp';

export function isSmpMirrorPreviewSourcePath(filePath: string): boolean {
    return isSmpSourceFilePath(filePath);
}

export function getSmpMirrorPreviewUri(filePath: string): string | undefined {
    return createSmpMirrorDescriptor(filePath)?.mirrorUri.toString();
}

export type SmpMirrorSyncChangeKind = 'created' | 'changed' | 'deleted';

export interface SmpMirrorSyncChange {
    readonly uri: string;
    readonly kind: SmpMirrorSyncChangeKind;
}

export function getSmpMirrorSyncChanges(filePath: string, kind: SmpMirrorSyncChangeKind): SmpMirrorSyncChange[] {
    if (isSmpSourceFilePath(filePath)) {
        const mirrorUri = getSmpMirrorPreviewUri(filePath);
        return mirrorUri ? [{ uri: mirrorUri, kind: kind === 'deleted' ? 'deleted' : 'changed' }] : [];
    }

    const sourcePath = getSmpSourcePathFromMirrorPath(filePath);
    if (!sourcePath) {
        return [];
    }

    const mirrorUri = getSmpMirrorPreviewUri(sourcePath);
    if (!mirrorUri) {
        return [];
    }

    return [{
        uri: mirrorUri,
        kind: kind === 'deleted' ? 'changed' : 'deleted',
    }];
}
