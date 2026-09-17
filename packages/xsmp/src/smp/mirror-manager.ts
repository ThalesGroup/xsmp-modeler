import {
    Cancellation,
    interruptAndCheck,
    isOperationCancelled,
    type LangiumDocument,
    URI,
    UriUtils,
} from 'langium';
import { DiagnosticSeverity, type Diagnostic, Range } from 'vscode-languageserver';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as ast from '../generated/ast-partial.js';
import { isSmpMirrorDocument } from '../builtins.js';
import type { XsmpSharedServices } from '../xsmp-module.js';
import { isSameOrContainedPath, normalizePath } from '../utils/path-utils.js';
import { SmpImportService } from './import/service.js';
import {
    collectSmpSearchRoots,
    SmpWorkspaceIndex,
} from './workspace-index.js';
import {
    getSmpMirrorSourceUri,
    getXsmpHomologuePath,
    isSmpSourceFilePath,
    isXsmpSourceFilePath,
} from './mirror-uri.js';

const ignoredDirectories = new Set([
    '.git',
    '.tsbuildinfo',
    'coverage',
    'lib',
    'node_modules',
    'out',
    'smdl-gen',
]);

export interface SmpMirrorRefreshResult {
    readonly changed: URI[];
    readonly deleted: URI[];
}

export class SmpMirrorManager {
    protected readonly workspaceIndex: SmpWorkspaceIndex;
    protected readonly importer: SmpImportService;
    protected readonly services: XsmpSharedServices;
    protected mirrorContentByUri = new Map<string, string>();
    protected activeSourceUriByMirrorUri = new Map<string, URI>();
    protected baseSourceDiagnostics = new Map<string, Diagnostic[]>();
    protected mirrorStateVersion = 0;
    protected readonly activeRefreshes = new Set<Promise<void>>();

    constructor(services: XsmpSharedServices) {
        this.services = services;
        this.workspaceIndex = services.SmpWorkspaceIndex;
        this.importer = new SmpImportService(services);
    }

    protected get documents() {
        return this.services.workspace.LangiumDocuments;
    }

    getMirrorContent(uri: URI): string | undefined {
        return this.mirrorContentByUri.get(uri.toString());
    }

    async getOrCreateMirrorContent(uri: URI): Promise<string | undefined> {
        if (!this.isMirrorUri(uri)) {
            return undefined;
        }

        for (;;) {
            const refreshes = [...this.activeRefreshes];
            if (refreshes.length > 0) {
                await Promise.all(refreshes);
                continue;
            }

            const stateVersion = this.mirrorStateVersion;
            const existingContent = this.getMirrorContent(uri);
            if (existingContent !== undefined) {
                return existingContent;
            }

            // On-demand imports must not mutate the live workspace index while a workspace
            // refresh is being staged. The snapshot also prevents an import that finishes after
            // a refresh from repopulating the live external-document cache with stale data.
            const workspaceIndex = this.workspaceIndex.createSnapshot();
            const sourceUri = this.getSourceUri(uri) ?? getSmpMirrorSourceUri(uri);
            if (!sourceUri || !this.isEligibleMirrorSource(sourceUri, workspaceIndex)) {
                return undefined;
            }

            try {
                const rendered = await this.importer.renderImportedDocument({
                    inputPath: sourceUri.fsPath,
                    outputUri: uri,
                    workspaceIndex,
                });
                if (stateVersion !== this.mirrorStateVersion || this.activeRefreshes.size > 0) {
                    continue;
                }
                this.mirrorContentByUri.set(uri.toString(), rendered.content);
                return rendered.content;
            } catch (error) {
                if (stateVersion !== this.mirrorStateVersion || this.activeRefreshes.size > 0) {
                    continue;
                }
                const diagnostic = createSourceDiagnostic(
                    DiagnosticSeverity.Error,
                    error instanceof Error ? error.message : String(error),
                );
                this.setBaseDiagnostics(this.baseSourceDiagnostics, sourceUri, [diagnostic]);
                const connection = this.services.lsp.Connection;
                if (connection) {
                    connection.sendDiagnostics({
                        uri: sourceUri.toString(),
                        diagnostics: this.getSourceDiagnostics(sourceUri),
                    });
                }
                return undefined;
            }
        }
    }

    isMirrorUri(uri: URI): boolean {
        return isSmpMirrorDocument(uri);
    }

    getSourceUri(uri: URI): URI | undefined {
        return this.activeSourceUriByMirrorUri.get(uri.toString()) ?? this.workspaceIndex.getSourceUriForMirrorUri(uri);
    }

    getSourceDiagnostics(uri: URI): Diagnostic[] {
        const key = uri.toString();
        return deduplicateDiagnostics(this.baseSourceDiagnostics.get(key) ?? []);
    }

    getSourceDiagnosticEntries(): Array<{ uri: URI; diagnostics: Diagnostic[] }> {
        return [...this.getTrackedSourceUris()].map(uri => {
            const parsed = this.sourceUriByString(uri);
            return {
                uri: parsed,
                diagnostics: this.getSourceDiagnostics(parsed),
            };
        });
    }

    publishSourceDiagnostics(): void {
        const connection = this.services.lsp.Connection;
        if (!connection) {
            return;
        }

        for (const uri of this.getTrackedSourceUris()) {
            connection.sendDiagnostics({
                uri,
                diagnostics: this.getSourceDiagnostics(this.sourceUriByString(uri)),
            });
        }
    }

    clearSourceDiagnostics(uri: URI): void {
        this.baseSourceDiagnostics.delete(uri.toString());
        const connection = this.services.lsp.Connection;
        if (connection) {
            connection.sendDiagnostics({ uri: uri.toString(), diagnostics: [] });
        }
    }

    async initializeWorkspaceMirrors(cancelToken = Cancellation.CancellationToken.None): Promise<SmpMirrorRefreshResult> {
        return this.refreshWorkspaceMirrors(cancelToken);
    }

    async refreshWorkspaceMirrors(cancelToken = Cancellation.CancellationToken.None): Promise<SmpMirrorRefreshResult> {
        this.mirrorStateVersion++;
        const refresh = this.doRefreshWorkspaceMirrors(cancelToken);
        const completion = refresh.then(() => undefined, () => undefined);
        this.activeRefreshes.add(completion);
        try {
            return await refresh;
        } finally {
            this.mirrorStateVersion++;
            this.activeRefreshes.delete(completion);
        }
    }

    protected async doRefreshWorkspaceMirrors(cancelToken: Cancellation.CancellationToken): Promise<SmpMirrorRefreshResult> {
        await interruptAndCheck(cancelToken);
        const previousSourceUris = this.getTrackedSourceUris();
        const previousMirrorUris = new Set(this.mirrorContentByUri.keys());
        const nextMirrorContentByUri = new Map<string, string>();
        const nextActiveSourceUriByMirrorUri = new Map<string, URI>();
        const nextBaseSourceDiagnostics = new Map<string, Diagnostic[]>();
        const documentsToAdd: LangiumDocument[] = [];
        const changed: URI[] = [];
        const deleted: URI[] = [];
        const eligibleSourcePaths = await this.collectEligibleSourcePaths();
        await interruptAndCheck(cancelToken);
        const nextWorkspaceIndex = new SmpWorkspaceIndex();
        nextWorkspaceIndex.setEligibleSourcePaths(eligibleSourcePaths);
        await nextWorkspaceIndex.rebuildSearchRoots(
            collectSmpSearchRoots(
                this.services.workspace.WorkspaceManager.workspaceFolders,
                eligibleSourcePaths.map(sourcePath => path.dirname(sourcePath)),
            ),
        );

        for (const sourcePath of eligibleSourcePaths) {
            await interruptAndCheck(cancelToken);

            const descriptor = nextWorkspaceIndex.getDescriptorForSourcePath(sourcePath);
            if (!descriptor) {
                continue;
            }
            const { sourceUri, mirrorUri } = descriptor;

            const homologuePath = getXsmpHomologuePath(sourcePath);
            if (await fileExists(homologuePath)) {
                this.setBaseDiagnostics(
                    nextBaseSourceDiagnostics,
                    sourceUri,
                    [createSourceDiagnostic(DiagnosticSeverity.Warning, `Ignoring '${path.basename(sourcePath)}' because '${path.basename(homologuePath)}' is present in the same source folder.`)],
                );
                continue;
            }

            try {
                const result = await this.importer.renderImportedDocument({
                    inputPath: sourcePath,
                    outputUri: mirrorUri,
                    workspaceIndex: nextWorkspaceIndex,
                });
                nextMirrorContentByUri.set(mirrorUri.toString(), result.content);
                nextActiveSourceUriByMirrorUri.set(mirrorUri.toString(), sourceUri);
                if (result.warnings.length > 0) {
                    this.setBaseDiagnostics(
                        nextBaseSourceDiagnostics,
                        sourceUri,
                        result.warnings.map(warning => createSourceDiagnostic(DiagnosticSeverity.Warning, warning)),
                    );
                }

                if (!this.documents.hasDocument(mirrorUri)) {
                    documentsToAdd.push(this.services.workspace.LangiumDocumentFactory.fromString(result.content, mirrorUri));
                    changed.push(mirrorUri);
                } else if (this.mirrorContentByUri.get(mirrorUri.toString()) !== result.content) {
                    changed.push(mirrorUri);
                }
            } catch (error) {
                if (isOperationCancelled(error)) {
                    throw error;
                }
                this.setBaseDiagnostics(
                    nextBaseSourceDiagnostics,
                    sourceUri,
                    [createSourceDiagnostic(DiagnosticSeverity.Error, error instanceof Error ? error.message : String(error))],
                );
                if (this.documents.hasDocument(mirrorUri)) {
                    deleted.push(mirrorUri);
                }
            }
        }

        for (const uri of previousMirrorUris) {
            if (nextMirrorContentByUri.has(uri)) {
                continue;
            }
            deleted.push(URI.parse(uri));
        }

        // Nothing observable is committed until every source has been processed and the
        // cancellation token has passed one final check.
        await interruptAndCheck(cancelToken);
        this.workspaceIndex.replaceWith(nextWorkspaceIndex);
        for (const document of documentsToAdd) {
            if (!this.documents.hasDocument(document.uri)) {
                this.documents.addDocument(document);
            }
        }

        this.mirrorContentByUri = nextMirrorContentByUri;
        this.activeSourceUriByMirrorUri = nextActiveSourceUriByMirrorUri;
        this.baseSourceDiagnostics = nextBaseSourceDiagnostics;

        const nextActiveSourceUris = new Set(
            [...nextActiveSourceUriByMirrorUri.values()].map(uri => uri.toString())
        );
        for (const uri of previousSourceUris) {
            if (!nextBaseSourceDiagnostics.has(uri) && !nextActiveSourceUris.has(uri)) {
                this.clearSourceDiagnostics(this.sourceUriByString(uri));
            }
        }

        this.publishSourceDiagnostics();
        return {
            changed: distinctUris(changed),
            deleted: distinctUris(deleted),
        };
    }

    isMirrorRelevantUri(uri: URI): boolean {
        if (uri.scheme !== 'file') {
            return false;
        }
        return path.basename(uri.fsPath) === 'xsmp.project'
            || isSmpSourceFilePath(uri.fsPath)
            || isXsmpSourceFilePath(uri.fsPath);
    }

    protected async collectEligibleSourcePaths(): Promise<string[]> {
        const sourcePaths = new Set<string>();
        for (const project of this.services.workspace.ProjectManager.getProjects()) {
            const projectDocument = project.$document;
            if (!projectDocument) {
                continue;
            }
            const projectDirectory = UriUtils.dirname(projectDocument.uri).fsPath;
            for (const source of project.elements.filter(ast.isSource)) {
                if (!source.path) {
                    continue;
                }
                const sourceDirectory = path.resolve(projectDirectory, normalizePath(source.path));
                if (!isSameOrContainedPath(projectDirectory, sourceDirectory, path)) {
                    continue;
                }
                await collectSmpSourceFiles(sourceDirectory, sourcePaths);
            }
        }
        return [...sourcePaths].sort((left, right) => left.localeCompare(right));
    }

    protected sourceUriByString(uri: string): URI {
        return URI.parse(uri);
    }

    protected getTrackedSourceUris(): Set<string> {
        return new Set<string>(this.baseSourceDiagnostics.keys());
    }

    protected isEligibleMirrorSource(sourceUri: URI, workspaceIndex = this.workspaceIndex): boolean {
        return sourceUri.scheme === 'file' && workspaceIndex.hasEligibleSourcePath(sourceUri.fsPath);
    }

    protected setBaseDiagnostics(
        diagnosticsByUri: Map<string, Diagnostic[]>,
        sourceUri: URI,
        diagnostics: Diagnostic[],
    ): void {
        diagnosticsByUri.set(sourceUri.toString(), diagnostics);
    }
}

async function collectSmpSourceFiles(currentDirectory: string, sourcePaths: Set<string>): Promise<void> {
    let entries;
    try {
        entries = await fs.readdir(currentDirectory, { withFileTypes: true });
    } catch {
        return;
    }

    await Promise.all(entries.map(async entry => {
        if (entry.name.startsWith('.') || ignoredDirectories.has(entry.name)) {
            return;
        }

        const entryPath = path.join(currentDirectory, entry.name);
        if (entry.isDirectory()) {
            await collectSmpSourceFiles(entryPath, sourcePaths);
            return;
        }
        if (entry.isFile() && isSmpSourceFilePath(entryPath)) {
            sourcePaths.add(path.resolve(entryPath));
        }
    }));
}

function createSourceDiagnostic(severity: DiagnosticSeverity, message: string): Diagnostic {
    return {
        severity,
        message,
        range: zeroRange(),
        source: 'smp-mirror',
    };
}

function zeroRange() {
    return Range.create(0, 0, 0, 0);
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.stat(filePath);
        return true;
    } catch {
        return false;
    }
}

function deduplicateDiagnostics(diagnostics: readonly Diagnostic[]): Diagnostic[] {
    const unique = new Map<string, Diagnostic>();
    for (const diagnostic of diagnostics) {
        unique.set(`${diagnostic.severity}:${diagnostic.message}`, diagnostic);
    }
    return [...unique.values()];
}

function distinctUris(uris: readonly URI[]): URI[] {
    const distinct = new Map<string, URI>();
    for (const uri of uris) {
        distinct.set(uri.toString(), uri);
    }
    return [...distinct.values()];
}
