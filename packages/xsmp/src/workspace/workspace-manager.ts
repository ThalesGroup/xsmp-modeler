import { type LangiumDocument, type LangiumDocumentFactory, Cancellation, DefaultWorkspaceManager, interruptAndCheck, stream } from 'langium';
import { builtInScheme } from '../builtins.js';
import { URI } from 'vscode-uri';
import type { WorkspaceFolder, WorkspaceFoldersChangeEvent } from 'vscode-languageserver-protocol';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { XsmpSharedServices } from '../xsmp-module.js';
import type { SmpMirrorManager, SmpMirrorRefreshResult } from '../smp/index.js';
import { getXsmpPackageRoot } from '../version.js';
import { isSameOrContainedPath } from '../utils/path-utils.js';
import { SmpMirrorsChangedNotification } from '../lsp/protocol.js';

export function resolveBuiltinDir(explicitDir?: string): string {
    const candidateDirs = explicitDir ? [explicitDir] : (() => {
        const root = getXsmpPackageRoot();
        return [
            path.join(root, 'lib', 'builtins'),
            path.join(root, 'builtins'),
        ];
    })();
    const formattedCandidateDirs = candidateDirs.map(dir => `'${dir}'`).join(', ');
    for (const builtinDir of candidateDirs) {
        if (fs.existsSync(path.join(builtinDir, 'ecss.smp.l1@ECSS_SMP_2025.xsmpcat'))) {
            return builtinDir;
        }
    }
    throw new Error(`Unable to locate XSMP built-in catalogues in ${formattedCandidateDirs}.`);
}

export class BuiltinDirectoryProvider {
    readonly builtinDir: string;

    constructor(explicitDir?: string) {
        this.builtinDir = resolveBuiltinDir(explicitDir);
    }
}

export class XsmpWorkspaceManager extends DefaultWorkspaceManager {

    protected readonly documentFactory: LangiumDocumentFactory;
    protected readonly validFileExtension;
    protected readonly contributionRegistry;
    protected readonly smpMirrorManager: SmpMirrorManager;
    protected readonly builtinDirectoryProvider: BuiltinDirectoryProvider;
    protected readonly services: XsmpSharedServices;

    constructor(services: XsmpSharedServices) {
        super(services);
        this.services = services;
        this.documentFactory = services.workspace.LangiumDocumentFactory;
        this.validFileExtension = services.ServiceRegistry.all.flatMap(s => s.LanguageMetaData.fileExtensions);
        this.contributionRegistry = services.ContributionRegistry;
        this.smpMirrorManager = services.SmpMirrorManager;
        this.builtinDirectoryProvider = services.BuiltinDirectoryProvider;
    }

    override async initializeWorkspace(folders: WorkspaceFolder[], cancelToken = Cancellation.CancellationToken.None): Promise<void> {
        this.folders = [...folders];
        const documents: LangiumDocument[] = [];
        const collector = (document: LangiumDocument) => {
            documents.push(document);
            if (!this.langiumDocuments.hasDocument(document.uri)) {
                this.langiumDocuments.addDocument(document);
            }
        };

        await this.loadAdditionalDocuments(folders, collector);
        const uris: URI[] = [];
        await Promise.all(
            folders.map(wf => this.getRootFolder(wf))
                .map(async entry => this.traverseFolder(entry, uris))
        );
        const uniqueUris = stream(uris)
            .distinct(uri => uri.toString())
            .filter(uri => !this.langiumDocuments.hasDocument(uri));
        await this.loadWorkspaceDocuments(uniqueUris, collector);
        await interruptAndCheck(cancelToken);
        await this.documentBuilder.build(documents, this.initialBuildOptions, cancelToken);

        const mirrors = await this.smpMirrorManager.initializeWorkspaceMirrors(cancelToken);
        if (mirrors.changed.length > 0 || mirrors.deleted.length > 0) {
            await interruptAndCheck(cancelToken);
            await this.documentBuilder.update(mirrors.changed, mirrors.deleted, cancelToken);
        }
        this.smpMirrorManager.publishSourceDiagnostics();
        await this.notifyMirrorChanges(mirrors);
        this._ready.resolve();
    }

    async updateWorkspaceFolders(event: WorkspaceFoldersChangeEvent): Promise<void> {
        await this.ready;

        let mirrorChanges: SmpMirrorRefreshResult | undefined;
        await this.mutex.write(async () => {
            const currentFolders = this.folders ?? [];
            const removedFolderUris = new Set(event.removed.map(folder => URI.parse(folder.uri).toString()));
            const nextFoldersByUri = new Map(
                currentFolders
                    .filter(folder => !removedFolderUris.has(URI.parse(folder.uri).toString()))
                    .map(folder => [URI.parse(folder.uri).toString(), folder]),
            );
            for (const folder of event.added) {
                nextFoldersByUri.set(URI.parse(folder.uri).toString(), folder);
            }
            const nextFolders = [...nextFoldersByUri.values()];
            this.folders = nextFolders;

            const addedUris = event.added.map(folder => this.getRootFolder(folder));

            const remainingRoots = nextFolders.map(folder => URI.parse(folder.uri));
            const removedRoots = event.removed.map(folder => URI.parse(folder.uri));
            const removedDocuments = this.langiumDocuments.all
                .filter(document => document.uri.scheme === 'file')
                .filter(document => removedRoots.some(root => isSameOrContainedPath(root.path, document.uri.path)))
                .filter(document => !remainingRoots.some(root => isSameOrContainedPath(root.path, document.uri.path)))
                .toArray();
            const openRemovedUris = removedDocuments
                .filter(document => this.services.workspace.TextDocuments.get(document.uri) !== undefined)
                .map(document => document.uri);
            const deletedUris = removedDocuments
                .filter(document => this.services.workspace.TextDocuments.get(document.uri) === undefined)
                .map(document => document.uri);
            const changedUris = stream(addedUris, openRemovedUris)
                .distinct(uri => uri.toString())
                .toArray();

            // Workspace-folder changes must complete atomically. Unlike ordinary editor updates they
            // cannot safely be superseded, because a later event only contains a delta.
            await this.documentBuilder.update(changedUris, deletedUris, Cancellation.CancellationToken.None);

            const refreshedMirrors = await this.smpMirrorManager.refreshWorkspaceMirrors(Cancellation.CancellationToken.None);
            if (refreshedMirrors.changed.length > 0 || refreshedMirrors.deleted.length > 0) {
                await this.documentBuilder.update(
                    refreshedMirrors.changed,
                    refreshedMirrors.deleted,
                    Cancellation.CancellationToken.None,
                );
            }
            mirrorChanges = refreshedMirrors;
        });

        if (mirrorChanges) {
            await this.notifyMirrorChanges(mirrorChanges);
        }
    }

    protected async notifyMirrorChanges(changes: SmpMirrorRefreshResult): Promise<void> {
        if (changes.changed.length === 0 && changes.deleted.length === 0) {
            return;
        }
        try {
            await this.services.lsp.Connection?.sendNotification(SmpMirrorsChangedNotification, {
                changed: changes.changed.map(uri => uri.toString()),
                deleted: changes.deleted.map(uri => uri.toString()),
            });
        } catch (error) {
            console.error('Could not notify the client about refreshed SMP mirrors.', error);
        }
    }

    protected override async loadAdditionalDocuments(
        folders: WorkspaceFolder[],
        collector: (document: LangiumDocument) => void
    ): Promise<void> {
        await this.loadBuiltinDocuments(this.builtinDirectoryProvider.builtinDir, collector, '', new Set(['profiles', 'tools']));
        await this.contributionRegistry.ready;
        for (const document of this.contributionRegistry.getDescriptorDocuments()) {
            collector(document);
        }
        for (const document of this.contributionRegistry.getPayloadBuiltinDocuments()) {
            collector(document);
        }
    }

    protected async loadBuiltinDocuments(
        currentDir: string,
        collector: (document: LangiumDocument) => void,
        relativePath: string = '',
        excludedTopLevelEntries: ReadonlySet<string> = new Set(),
    ): Promise<void> {
        try {
            const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });

            await Promise.all(entries.map(async (entry) => {
                if (relativePath.length === 0 && excludedTopLevelEntries.has(entry.name)) {
                    return;
                }
                const entryPath = path.join(currentDir, entry.name);
                const entryRelativePath = path.join(relativePath, entry.name);

                try {
                    if (entry.isDirectory()) {
                        await this.loadBuiltinDocuments(entryPath, collector, entryRelativePath, excludedTopLevelEntries);
                    }
                    else if (entry.isFile() && this.validFileExtension.includes(path.extname(entry.name))) {
                        const content = await fs.promises.readFile(entryPath, 'utf-8');
                        collector(this.documentFactory.fromString(content, URI.parse(`${builtInScheme}:///${entryRelativePath}`)));
                    }
                } catch (error) {
                    console.error(`Error on ${entryPath}:`, error);
                }
            }));
        } catch (error) {
            console.error(`Could not read ${currentDir}:`, error);
        }
    }
}
