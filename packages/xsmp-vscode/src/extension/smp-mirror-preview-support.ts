import { createSmpMirrorDescriptor, isSmpSourceFilePath } from '@xsmp/core/smp';

export function isSmpMirrorPreviewSourcePath(filePath: string): boolean {
    return isSmpSourceFilePath(filePath);
}

export function getSmpMirrorPreviewUri(filePath: string): string | undefined {
    return createSmpMirrorDescriptor(filePath)?.mirrorUri.toString();
}
