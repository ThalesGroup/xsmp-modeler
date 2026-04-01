import { beforeAll, describe, expect, test } from 'vitest';
import { URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { DiagnosticSeverity, FileChangeType, type DidChangeWatchedFilesParams } from 'vscode-languageserver';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as ast from 'xsmp/ast-partial';
import { createBuiltinTestXsmpServices } from '../test-services.js';

const exampleFolders = [
    '01-foundation',
    '02-avionics',
    '03-payload',
    '04-orbital-segment',
    '05-payload-segment',
    '06-mission-system',
];

const examplesRoot = path.resolve(__dirname, '../../../../examples');

describe('Examples workspace', () => {
    let services: Awaited<ReturnType<typeof createBuiltinTestXsmpServices>>;

    beforeAll(async () => {
        services = await createBuiltinTestXsmpServices(NodeFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace(
            exampleFolders.map(folder => ({
                name: folder,
                uri: URI.file(path.join(examplesRoot, folder)).toString(),
            }))
        );
    });

    test('loads multi-root workspace without diagnostics', async () => {
        const documents = services.shared.workspace.LangiumDocuments.all.toArray()
            .filter(document => document.uri.scheme === 'file' && document.uri.fsPath.startsWith(examplesRoot))
            .sort((left, right) => left.uri.fsPath.localeCompare(right.uri.fsPath));

        const parserErrors = documents.flatMap(document =>
            document.parseResult.parserErrors.map(error => `${path.relative(examplesRoot, document.uri.fsPath)}: ${error.message}`)
        );
        const diagnostics = documents.flatMap(document =>
            (document.diagnostics ?? [])
                .filter(diagnostic => diagnostic.severity === DiagnosticSeverity.Error)
                .map(diagnostic =>
                `${path.relative(examplesRoot, document.uri.fsPath)}:${diagnostic.range.start.line + 1}: ${diagnostic.message}`
                )
        );

        expect(parserErrors).toEqual([]);
        expect(diagnostics).toEqual([]);
    });

    test('loads single examples folder without diagnostics', async () => {
        const singleRootServices = await createBuiltinTestXsmpServices(NodeFileSystem);
        await singleRootServices.shared.workspace.WorkspaceManager.initializeWorkspace([
            {
                name: 'examples',
                uri: URI.file(examplesRoot).toString(),
            }
        ]);

        const documents = singleRootServices.shared.workspace.LangiumDocuments.all.toArray()
            .filter(document => document.uri.scheme === 'file' && document.uri.fsPath.startsWith(examplesRoot))
            .sort((left, right) => left.uri.fsPath.localeCompare(right.uri.fsPath));

        const parserErrors = documents.flatMap(document =>
            document.parseResult.parserErrors.map(error => `${path.relative(examplesRoot, document.uri.fsPath)}: ${error.message}`)
        );
        const diagnostics = documents.flatMap(document =>
            (document.diagnostics ?? [])
                .filter(diagnostic => diagnostic.severity === DiagnosticSeverity.Error)
                .map(diagnostic =>
                `${path.relative(examplesRoot, document.uri.fsPath)}:${diagnostic.range.start.line + 1}: ${diagnostic.message}`
                )
        );

        expect(parserErrors).toEqual([]);
        expect(diagnostics).toEqual([]);
    });

    test('keeps mission links valid after saving the avionics catalogue twice', async () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-examples-workspace-'));
        try {
            for (const folder of exampleFolders) {
                copyDir(path.join(examplesRoot, folder), path.join(tempRoot, folder));
            }

            const tempServices = await createBuiltinTestXsmpServices(NodeFileSystem);
            await tempServices.shared.workspace.WorkspaceManager.initializeWorkspace(
                exampleFolders.map(folder => ({
                    name: folder,
                    uri: URI.file(path.join(tempRoot, folder)).toString(),
                }))
            );

            const missionLinksUri = URI.file(path.join(tempRoot, '06-mission-system', 'smdl', 'mission_links.xsmplnk'));
            const avionicsPath = path.join(tempRoot, '02-avionics', 'smdl', 'avionics_catalogue.xsmpcat');
            const updateHandler = tempServices.shared.lsp.DocumentUpdateHandler as unknown as {
                updateWatchedFiles(params: DidChangeWatchedFilesParams): Promise<void>;
            };

            expect(getErrorDiagnostics(tempServices, missionLinksUri)).toEqual([]);

            const original = fs.readFileSync(avionicsPath, 'utf8');
            fs.writeFileSync(
                avionicsPath,
                original.replace(
                    'output field demo.foundation.ThermalLoop thermal',
                    'output field demo.foundation.ThermalLoop thermal\n        /** repro 1 */'
                )
            );
            await updateHandler.updateWatchedFiles({
                changes: [{ uri: URI.file(avionicsPath).toString(), type: FileChangeType.Changed }],
            });
            expect(getErrorDiagnostics(tempServices, missionLinksUri)).toEqual([]);

            const once = fs.readFileSync(avionicsPath, 'utf8');
            fs.writeFileSync(avionicsPath, once.replace('/** repro 1 */', '/** repro 2 */'));
            await updateHandler.updateWatchedFiles({
                changes: [{ uri: URI.file(avionicsPath).toString(), type: FileChangeType.Changed }],
            });
            expect(getErrorDiagnostics(tempServices, missionLinksUri)).toEqual([]);
        } finally {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    });

    test('does not leak temporary import documents after saving xsmp.project', async () => {
        const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-examples-workspace-'));
        try {
            for (const folder of exampleFolders) {
                copyDir(path.join(examplesRoot, folder), path.join(tempRoot, folder));
            }

            const tempServices = await createBuiltinTestXsmpServices(NodeFileSystem);
            await tempServices.shared.workspace.WorkspaceManager.initializeWorkspace(
                exampleFolders.map(folder => ({
                    name: folder,
                    uri: URI.file(path.join(tempRoot, folder)).toString(),
                }))
            );

            const foundationProjectPath = path.join(tempRoot, '01-foundation', 'xsmp.project');
            const foundationMirrorUri = tempServices.shared.SmpWorkspaceIndex.getMirrorUriForSourcePath(
                path.join(tempRoot, '01-foundation', 'smdl', 'foundation_catalogue.smpcat')
            );
            const updateHandler = tempServices.shared.lsp.DocumentUpdateHandler as unknown as {
                updateWatchedFiles(params: DidChangeWatchedFilesParams): Promise<void>;
            };

            expect(foundationMirrorUri).toBeDefined();
            expect(foundationMirrorUri && getErrorDiagnostics(tempServices, foundationMirrorUri)).toEqual([]);

            const original = fs.readFileSync(foundationProjectPath, 'utf8');
            fs.writeFileSync(foundationProjectPath, `${original.trimEnd()}\n/** repro 1 */\n`);
            await updateHandler.updateWatchedFiles({
                changes: [{ uri: URI.file(foundationProjectPath).toString(), type: FileChangeType.Changed }],
            });

            fs.writeFileSync(foundationProjectPath, `${original.trimEnd()}\n/** repro 2 */\n`);
            await updateHandler.updateWatchedFiles({
                changes: [{ uri: URI.file(foundationProjectPath).toString(), type: FileChangeType.Changed }],
            });

            expect(foundationMirrorUri && getErrorDiagnostics(tempServices, foundationMirrorUri)).toEqual([]);

            const indexedCatalogueUris = tempServices.shared.workspace.IndexManager
                .allElements(ast.Catalogue.$type)
                .map(description => description.documentUri.toString())
                .toArray();
            expect(indexedCatalogueUris.some(uri => uri.startsWith('xsmp-import-check:'))).toBe(false);
        } finally {
            fs.rmSync(tempRoot, { recursive: true, force: true });
        }
    });
});

function copyDir(sourceDir: string, targetDir: string): void {
    fs.mkdirSync(targetDir, { recursive: true });
    for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
        const sourcePath = path.join(sourceDir, entry.name);
        const targetPath = path.join(targetDir, entry.name);
        if (entry.isDirectory()) {
            copyDir(sourcePath, targetPath);
        } else {
            fs.copyFileSync(sourcePath, targetPath);
        }
    }
}

function getErrorDiagnostics(
    services: Awaited<ReturnType<typeof createBuiltinTestXsmpServices>>,
    uri: URI,
): string[] {
    const document = services.shared.workspace.LangiumDocuments.getDocument(uri);
    return (document?.diagnostics ?? [])
        .filter(diagnostic => diagnostic.severity === DiagnosticSeverity.Error)
        .map(diagnostic => `${diagnostic.range.start.line + 1}: ${diagnostic.message}`);
}
