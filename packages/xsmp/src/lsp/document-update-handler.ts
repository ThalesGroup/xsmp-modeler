import { DocumentState, stream, type LangiumDocument, type LangiumDocuments, URI } from 'langium';
import { DefaultDocumentUpdateHandler } from 'langium/lsp';
import { FileChangeType, type DidChangeWatchedFilesParams } from 'vscode-languageserver';
import type { ProjectManager } from '../workspace/project-manager.js';
import type { XsmpSharedServices } from '../xsmp-module.js';
import type { SmpMirrorManager } from '../smp/index.js';

export class XsmpDocumentUpdateHandler extends DefaultDocumentUpdateHandler {
    protected readonly smpMirrorManager: SmpMirrorManager;
    protected readonly projectManager: ProjectManager;
    protected readonly documents: LangiumDocuments;

    constructor(services: XsmpSharedServices) {
        super(services);
        this.smpMirrorManager = services.SmpMirrorManager;
        this.projectManager = services.workspace.ProjectManager;
        this.documents = services.workspace.LangiumDocuments;
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
            const updatedMirrorUris = [...mirrorRefresh.changed, ...mirrorRefresh.deleted];
            if (updatedMirrorUris.length > 0) {
                // Mirror add/remove events change project visibility, but they don't necessarily
                // show up as reference-index changes on the surviving XSMP documents.
                const mirrorAffectedDocuments = this.collectMirrorAffectedDocuments(updatedMirrorUris);
                await this.documentBuilder.update(mirrorRefresh.changed, mirrorRefresh.deleted, token);
                if (mirrorAffectedDocuments.length > 0) {
                    for (const document of mirrorAffectedDocuments) {
                        this.documentBuilder.resetToState(document, DocumentState.ComputedScopes);
                    }
                    await this.documentBuilder.build(mirrorAffectedDocuments, this.documentBuilder.updateBuildOptions, token);
                }
            }
            this.smpMirrorManager.publishSourceDiagnostics();
        });
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
            if (!visibleUris) {
                continue;
            }
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
