import { Cancellation, DocumentState, isOperationCancelled, stream, type LangiumDocument, type LangiumDocuments, type TextDocument, URI } from 'langium';
import { DefaultDocumentUpdateHandler } from 'langium/lsp';
import { FileChangeType, type DidChangeWatchedFilesParams, type TextDocumentChangeEvent } from 'vscode-languageserver';
import type { ProjectManager } from '../workspace/project-manager.js';
import type { XsmpSharedServices } from '../xsmp-module.js';
import type { SmpMirrorManager, SmpMirrorRefreshResult } from '../smp/index.js';
import type { XsmpTextDocumentContentProvider } from './text-document-content-provider.js';

export class XsmpDocumentUpdateHandler extends DefaultDocumentUpdateHandler {
    protected readonly smpMirrorManager: SmpMirrorManager;
    protected readonly projectManager: ProjectManager;
    protected readonly documents: LangiumDocuments;
    protected readonly textDocumentContentProvider: XsmpTextDocumentContentProvider;

    constructor(services: XsmpSharedServices) {
        super(services);
        this.smpMirrorManager = services.SmpMirrorManager;
        this.projectManager = services.workspace.ProjectManager;
        this.documents = services.workspace.LangiumDocuments;
        this.textDocumentContentProvider = services.lsp.TextDocumentContentProvider;
    }

    protected override fireDocumentUpdate(changed: URI[], deleted: URI[]): void {
        void this.workspaceManager.ready
            .then(() => this.workspaceLock.write(token => this.documentBuilder.update(changed, deleted, token)))
            .catch(error => {
                if (!isOperationCancelled(error)) {
                    console.error('Could not perform document update.', error);
                }
            });
    }

    didOpenDocument(change: TextDocumentChangeEvent<TextDocument>): void {
        // Langium's initial workspace build stops at IndexedReferences. Rebuilding the document on
        // open ensures diagnostics and code actions are based on the current in-memory content.
        this.fireDocumentUpdate([URI.parse(change.document.uri)], []);
    }

    override didChangeWatchedFiles(params: DidChangeWatchedFilesParams): void {
        void this.updateWatchedFiles(params).catch(err => {
            console.error('Workspace initialization failed. Could not perform document update.', err);
        });
    }

    async updateWatchedFiles(params: DidChangeWatchedFilesParams): Promise<void> {
        this.onWatchedFilesChangeEmitter.fire(params);
        const watchedChanges = params.changes.map(change => ({
            ...change,
            parsedUri: URI.parse(change.uri),
        }));
        const changedUris = stream(watchedChanges)
            .filter(change => change.type !== FileChangeType.Deleted)
            .distinct(change => change.uri)
            .map(change => change.parsedUri)
            .toArray();
        const deletedUris = stream(watchedChanges)
            .filter(change => change.type === FileChangeType.Deleted)
            .distinct(change => change.uri)
            .map(change => change.parsedUri)
            .toArray();
        let completedMirrorRefresh: SmpMirrorRefreshResult | undefined;

        await this.workspaceManager.ready;
        await this.workspaceLock.write(async token => {
            const requiresMirrorRefresh = watchedChanges.some(change =>
                this.smpMirrorManager.isMirrorRelevantChange(change.parsedUri, change.type));
            // A watched-file event is a delta that a later write cannot reconstruct. Once mirrors
            // are involved, keep the source update, refresh and dependent rebuild atomic.
            const updateToken = requiresMirrorRefresh ? Cancellation.CancellationToken.None : token;
            await this.documentBuilder.update(changedUris, deletedUris, updateToken);
            if (!requiresMirrorRefresh) {
                return;
            }

            const mirrorRefresh = await this.smpMirrorManager.refreshWorkspaceMirrors(updateToken);
            const updatedMirrorUris = [...mirrorRefresh.changed, ...mirrorRefresh.deleted];
            if (updatedMirrorUris.length > 0) {
                // Mirror add/remove events change project visibility, but they don't necessarily
                // show up as reference-index changes on the surviving XSMP documents.
                const mirrorAffectedDocuments = this.collectMirrorAffectedDocuments(updatedMirrorUris);
                await this.documentBuilder.update(mirrorRefresh.changed, mirrorRefresh.deleted, updateToken);
                if (mirrorAffectedDocuments.length > 0) {
                    for (const document of mirrorAffectedDocuments) {
                        this.documentBuilder.resetToState(document, DocumentState.ComputedScopes);
                    }
                    await this.documentBuilder.build(mirrorAffectedDocuments, this.documentBuilder.updateBuildOptions, updateToken);
                }
            }
            this.smpMirrorManager.publishSourceDiagnostics();
            completedMirrorRefresh = mirrorRefresh;
        });

        if (completedMirrorRefresh) {
            await this.textDocumentContentProvider.refresh([...completedMirrorRefresh.changed, ...completedMirrorRefresh.deleted]);
        }
    }

    protected collectMirrorAffectedDocuments(mirrorUris: readonly URI[]): LangiumDocument[] {
        if (mirrorUris.length === 0) {
            return [];
        }

        const trackedMirrorUriStrings = new Set(mirrorUris.map(uri => uri.toString()));
        const affectedDocuments = new Map<string, LangiumDocument>();

        for (const document of this.documents.all) {
            if (trackedMirrorUriStrings.has(document.uri.toString())) {
                continue;
            }
            const visibleUris = this.projectManager.getVisibleUris(document);
            if (hasIntersection(visibleUris, trackedMirrorUriStrings)) {
                affectedDocuments.set(document.uri.toString(), document);
            }
        }

        return [...affectedDocuments.values()];
    }
}

function hasIntersection(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
    for (const value of left) {
        if (right.has(value)) {
            return true;
        }
    }
    return false;
}
