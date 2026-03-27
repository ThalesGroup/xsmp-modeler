import { stream, URI } from 'langium';
import { DefaultDocumentUpdateHandler } from 'langium/lsp';
import { FileChangeType, type DidChangeWatchedFilesParams } from 'vscode-languageserver';
import type { XsmpSharedServices } from '../xsmp-module.js';
import type { SmpMirrorManager } from '../smp/index.js';

export class XsmpDocumentUpdateHandler extends DefaultDocumentUpdateHandler {
    protected readonly smpMirrorManager: SmpMirrorManager;

    constructor(services: XsmpSharedServices) {
        super(services);
        this.smpMirrorManager = services.SmpMirrorManager;
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
        const requiresMirrorRefresh = watchedChanges.some(change => this.smpMirrorManager.isMirrorRelevantUri(change.parsedUri));

        await this.workspaceManager.ready;
        await this.workspaceLock.write(async token => {
            await this.documentBuilder.update(changedUris, deletedUris, token);
            if (!requiresMirrorRefresh) {
                return;
            }

            const mirrorRefresh = await this.smpMirrorManager.refreshWorkspaceMirrors(token);
            if (mirrorRefresh.changed.length > 0 || mirrorRefresh.deleted.length > 0) {
                await this.documentBuilder.update(mirrorRefresh.changed, mirrorRefresh.deleted, token);
            }
            this.smpMirrorManager.publishSourceDiagnostics();
        });
    }
}
