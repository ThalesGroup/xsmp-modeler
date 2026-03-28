import { type LangiumDocument, type LangiumDocumentFactory, Cancellation, DefaultWorkspaceManager, interruptAndCheck, stream } from 'langium';
import { builtInScheme } from '../builtins.js';
import { URI } from 'vscode-uri';
import type { WorkspaceFolder } from 'vscode-languageserver-protocol';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { XsmpSharedServices } from '../xsmp-module.js';
import type { SmpMirrorManager } from '../smp/index.js';
import { xsmpPackageRoot } from '../version.js';

export function resolveBuiltinDir(explicitDir?: string): string {
    const candidateDirs = explicitDir ? [explicitDir] : [
        path.join(xsmpPackageRoot, 'lib', 'builtins'),
        path.join(xsmpPackageRoot, 'builtins'),
    ];
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

    constructor(services: XsmpSharedServices) {
        super(services);
        this.documentFactory = services.workspace.LangiumDocumentFactory;
        this.validFileExtension = services.ServiceRegistry.all.flatMap(s => s.LanguageMetaData.fileExtensions);
        this.contributionRegistry = services.ContributionRegistry;
        this.smpMirrorManager = services.SmpMirrorManager;
        this.builtinDirectoryProvider = services.BuiltinDirectoryProvider;
    }

    override async initializeWorkspace(folders: WorkspaceFolder[], cancelToken = Cancellation.CancellationToken.None): Promise<void> {
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
        this._ready.resolve();
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
            const entries = await fs.promises.readdir(currentDir);

            await Promise.all(entries.map(async (entry) => {
                if (relativePath.length === 0 && excludedTopLevelEntries.has(entry)) {
                    return;
                }
                const entryPath = path.join(currentDir, entry);
                const entryRelativePath = path.join(relativePath, entry);

                try {
                    const stat = await fs.promises.stat(entryPath);

                    if (stat.isDirectory()) {
                        await this.loadBuiltinDocuments(entryPath, collector, entryRelativePath, excludedTopLevelEntries);
                    }
                    else if (stat.isFile() && this.validFileExtension.includes(path.extname(entry))) {
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
