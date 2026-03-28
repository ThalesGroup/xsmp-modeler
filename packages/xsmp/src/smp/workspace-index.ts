import type { URI } from 'langium';
import type { Dirent } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { URI as VscodeUri } from 'vscode-uri';
import { createSmpMirrorDescriptor, type SmpMirrorDescriptor } from './mirror-uri.js';

export class SmpWorkspaceIndex {
    protected readonly descriptorsBySourcePath = new Map<string, SmpMirrorDescriptor>();
    protected readonly sourceUriByMirrorUri = new Map<string, URI>();
    protected readonly workspaceFileIndex = new Map<string, string[]>();
    protected readonly scannedSourcePaths = new Set<string>();
    protected readonly indexedSearchRoots = new Set<string>();
    protected readonly externalDocumentIndexCache = new Map<string, unknown>();
    protected searchIndexUpdate = Promise.resolve();

    setEligibleSourcePaths(sourcePaths: readonly string[]): void {
        this.descriptorsBySourcePath.clear();
        this.sourceUriByMirrorUri.clear();
        this.externalDocumentIndexCache.clear();

        for (const sourcePath of sourcePaths) {
            const descriptor = createSmpMirrorDescriptor(sourcePath);
            if (!descriptor) {
                continue;
            }

            this.descriptorsBySourcePath.set(descriptor.sourcePath, descriptor);
            this.sourceUriByMirrorUri.set(descriptor.mirrorUri.toString(), descriptor.sourceUri);
        }

        this.refreshWorkspaceFileIndex();
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

    async rebuildSearchRoots(searchRoots: readonly string[]): Promise<void> {
        const normalizedRoots = normalizeSearchRoots(searchRoots);
        await this.runSearchIndexUpdate(async () => {
            this.indexedSearchRoots.clear();
            this.scannedSourcePaths.clear();
            this.externalDocumentIndexCache.clear();

            for (const root of normalizedRoots) {
                await this.collectSearchRootCandidates(root);
                this.indexedSearchRoots.add(root);
            }

            this.refreshWorkspaceFileIndex();
        });
    }

    async ensureSearchRoots(searchRoots: readonly string[]): Promise<void> {
        const normalizedRoots = normalizeSearchRoots(searchRoots);
        await this.runSearchIndexUpdate(async () => {
            let changed = false;
            for (const root of normalizedRoots) {
                if (this.indexedSearchRoots.has(root)) {
                    continue;
                }

                await this.collectSearchRootCandidates(root);
                this.indexedSearchRoots.add(root);
                changed = true;
            }

            if (changed) {
                this.externalDocumentIndexCache.clear();
                this.refreshWorkspaceFileIndex();
            }
        });
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

    protected async runSearchIndexUpdate(update: () => Promise<void>): Promise<void> {
        const nextUpdate = this.searchIndexUpdate.then(update, update);
        this.searchIndexUpdate = nextUpdate.catch(() => undefined);
        await nextUpdate;
    }

    protected async collectSearchRootCandidates(root: string): Promise<void> {
        let entries: Dirent[];
        try {
            entries = await fs.readdir(root, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            const candidate = path.join(root, entry.name);
            if (entry.isDirectory()) {
                if (!ignoredSearchDirectories.has(entry.name)) {
                    await this.collectSearchRootCandidates(candidate);
                }
                continue;
            }
            if (entry.isFile() && isSmpSearchFile(entry.name)) {
                this.scannedSourcePaths.add(path.resolve(candidate));
            }
        }
    }

    protected refreshWorkspaceFileIndex(): void {
        this.workspaceFileIndex.clear();

        for (const sourcePath of this.descriptorsBySourcePath.keys()) {
            this.addWorkspaceCandidate(path.basename(sourcePath), sourcePath);
        }
        for (const sourcePath of this.scannedSourcePaths) {
            this.addWorkspaceCandidate(path.basename(sourcePath), sourcePath);
        }
    }

    protected addWorkspaceCandidate(basename: string, sourcePath: string): void {
        const existing = this.workspaceFileIndex.get(basename);
        if (existing) {
            if (!existing.includes(sourcePath)) {
                existing.push(sourcePath);
            }
            return;
        }
        this.workspaceFileIndex.set(basename, [sourcePath]);
    }
}

export function collectSmpSearchRoots(
    workspaceFolders: readonly WorkspaceFolder[] | undefined,
    inputDirectories: readonly string[],
): readonly string[] {
    const searchRoots = new Set<string>(inputDirectories.map(directory => path.resolve(directory)));
    for (const folder of workspaceFolders ?? []) {
        const uri = VscodeUri.parse(folder.uri);
        if (uri.scheme === 'file') {
            searchRoots.add(path.resolve(uri.fsPath));
        }
    }
    return [...searchRoots];
}

const ignoredSearchDirectories = new Set([
    '.git',
    '.tsbuildinfo',
    'coverage',
    'lib',
    'node_modules',
    'out',
]);

const smpSearchExtensions = new Set([
    '.smpcat',
    '.smpcfg',
    '.smplnk',
    '.smpasb',
    '.smpsed',
    '.smppkg',
]);

function normalizeForComparison(value: string): string {
    return path.normalize(value).replaceAll('\\', '/');
}

function compareWorkspaceCandidates(left: string, right: string, inputDirectory: string): number {
    const leftDistance = path.relative(inputDirectory, left).split(path.sep).length;
    const rightDistance = path.relative(inputDirectory, right).split(path.sep).length;
    return leftDistance - rightDistance || left.localeCompare(right);
}

function normalizeSearchRoots(searchRoots: readonly string[]): string[] {
    return [...new Set(searchRoots.map(root => path.resolve(root)))];
}

function isSmpSearchFile(filename: string): boolean {
    return smpSearchExtensions.has(path.extname(filename));
}
