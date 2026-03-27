import type { URI } from 'langium';
import * as path from 'node:path';
import { createSmpMirrorDescriptor, type SmpMirrorDescriptor } from './mirror-uri.js';

export class SmpWorkspaceIndex {
    protected readonly descriptorsBySourcePath = new Map<string, SmpMirrorDescriptor>();
    protected readonly sourceUriByMirrorUri = new Map<string, URI>();
    protected readonly workspaceFileIndex = new Map<string, string[]>();
    protected readonly externalDocumentIndexCache = new Map<string, unknown>();

    setEligibleSourcePaths(sourcePaths: readonly string[]): void {
        this.descriptorsBySourcePath.clear();
        this.sourceUriByMirrorUri.clear();
        this.workspaceFileIndex.clear();
        this.externalDocumentIndexCache.clear();

        for (const sourcePath of sourcePaths) {
            const descriptor = createSmpMirrorDescriptor(sourcePath);
            if (!descriptor) {
                continue;
            }

            this.descriptorsBySourcePath.set(descriptor.sourcePath, descriptor);
            this.sourceUriByMirrorUri.set(descriptor.mirrorUri.toString(), descriptor.sourceUri);
            this.addWorkspaceCandidate(path.basename(descriptor.sourcePath), descriptor.sourcePath);
        }
    }

    getEligibleSourcePaths(): readonly string[] {
        return [...this.descriptorsBySourcePath.keys()];
    }

    getDescriptorForSourcePath(sourcePath: string): SmpMirrorDescriptor | undefined {
        return this.descriptorsBySourcePath.get(path.resolve(sourcePath));
    }

    getSourceUriForMirrorUri(uri: URI): URI | undefined {
        return this.sourceUriByMirrorUri.get(uri.toString());
    }

    getMirrorUriForSourcePath(sourcePath: string): URI | undefined {
        return this.getDescriptorForSourcePath(sourcePath)?.mirrorUri;
    }

    hasEligibleSourcePath(sourcePath: string): boolean {
        return this.descriptorsBySourcePath.has(path.resolve(sourcePath));
    }

    findWorkspaceCandidates(
        basename: string,
        normalizedPart: string,
        inputDirectory: string,
    ): string[] {
        const normalizedSuffix = normalizeForComparison(normalizedPart);
        return [...(this.workspaceFileIndex.get(basename) ?? [])]
            .filter(candidate => {
                if (!normalizedPart.includes(path.sep) && !normalizedPart.includes('/')) {
                    return true;
                }
                return normalizeForComparison(candidate).endsWith(normalizedSuffix);
            })
            .sort((left, right) => compareWorkspaceCandidates(left, right, inputDirectory));
    }

    getCachedExternalDocumentIndex(pathname: string): unknown | undefined {
        return this.externalDocumentIndexCache.get(path.resolve(pathname));
    }

    setCachedExternalDocumentIndex(pathname: string, value: unknown): void {
        this.externalDocumentIndexCache.set(path.resolve(pathname), value);
    }

    protected addWorkspaceCandidate(basename: string, sourcePath: string): void {
        const existing = this.workspaceFileIndex.get(basename);
        if (existing) {
            existing.push(sourcePath);
            return;
        }
        this.workspaceFileIndex.set(basename, [sourcePath]);
    }
}

function normalizeForComparison(value: string): string {
    return path.normalize(value).replaceAll('\\', '/');
}

function compareWorkspaceCandidates(left: string, right: string, inputDirectory: string): number {
    const leftDistance = path.relative(inputDirectory, left).split(path.sep).length;
    const rightDistance = path.relative(inputDirectory, right).split(path.sep).length;
    return leftDistance - rightDistance || left.localeCompare(right);
}
