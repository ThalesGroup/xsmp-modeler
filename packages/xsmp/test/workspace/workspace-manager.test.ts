import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createBuiltinTestXsmpServices } from '../test-services.js';
import { SmpMirrorsChangedNotification } from '../../src/lsp/protocol.js';

let tempDir: string;

beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-workspace-folders-'));
});

afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('XSMP workspace manager', () => {
    test('indexes added workspace folders and removes their documents again', async () => {
        const firstProjectDir = createProject('first');
        const secondProjectDir = createProject('second');
        const firstFolder = { name: 'first', uri: URI.file(firstProjectDir).toString() };
        const secondFolder = { name: 'second', uri: URI.file(secondProjectDir).toString() };
        const services = await createBuiltinTestXsmpServices(NodeFileSystem);

        await services.shared.workspace.WorkspaceManager.initializeWorkspace([firstFolder]);

        const secondProjectUri = URI.file(path.join(secondProjectDir, 'xsmp.project'));
        const secondCatalogueUri = URI.file(path.join(secondProjectDir, 'src', 'second.xsmpcat'));
        expect(services.shared.workspace.LangiumDocuments.hasDocument(secondProjectUri)).toBe(false);

        await services.shared.workspace.WorkspaceManager.updateWorkspaceFolders({
            added: [secondFolder],
            removed: [],
        });

        const secondProjectDocument = services.shared.workspace.LangiumDocuments.getDocument(secondProjectUri);
        const secondCatalogueDocument = services.shared.workspace.LangiumDocuments.getDocument(secondCatalogueUri);
        expect(secondProjectDocument).toBeDefined();
        expect(secondCatalogueDocument).toBeDefined();
        expect(secondCatalogueDocument && services.shared.workspace.ProjectManager.getProject(secondCatalogueDocument)?.name).toBe('second');
        expect(services.shared.workspace.WorkspaceManager.workspaceFolders?.map(folder => folder.name)).toEqual(['first', 'second']);

        await services.shared.workspace.WorkspaceManager.updateWorkspaceFolders({
            added: [],
            removed: [secondFolder],
        });

        expect(services.shared.workspace.LangiumDocuments.hasDocument(secondProjectUri)).toBe(false);
        expect(services.shared.workspace.LangiumDocuments.hasDocument(secondCatalogueUri)).toBe(false);
        expect(services.shared.workspace.WorkspaceManager.workspaceFolders?.map(folder => folder.name)).toEqual(['first']);
    });

    test('relinks preloaded documents when their folder is added and keeps open documents when it is removed', async () => {
        const projectDir = createProject('dynamic');
        const folder = { name: 'dynamic', uri: URI.file(projectDir).toString() };
        const projectUri = URI.file(path.join(projectDir, 'xsmp.project'));
        const catalogueUri = URI.file(path.join(projectDir, 'src', 'dynamic.xsmpcat'));
        const services = await createBuiltinTestXsmpServices(NodeFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);

        const preloadedDocument = await services.shared.workspace.LangiumDocuments.getOrCreateDocument(catalogueUri);
        await services.shared.workspace.DocumentBuilder.build([preloadedDocument], { validation: true });
        expect(services.shared.workspace.ProjectManager.getProject(preloadedDocument)).toBeUndefined();

        await services.shared.workspace.WorkspaceManager.updateWorkspaceFolders({
            added: [folder],
            removed: [],
        });
        expect(services.shared.workspace.ProjectManager.getProject(preloadedDocument)?.name).toBe('dynamic');

        const textDocuments = services.shared.workspace.TextDocuments;
        const openTextDocument = preloadedDocument.textDocument;
        const originalGet = textDocuments.get.bind(textDocuments);
        vi.spyOn(textDocuments, 'get').mockImplementation(uri =>
            uri.toString() === catalogueUri.toString() ? openTextDocument : originalGet(uri)
        );

        await services.shared.workspace.WorkspaceManager.updateWorkspaceFolders({
            added: [],
            removed: [folder],
        });

        expect(services.shared.workspace.LangiumDocuments.hasDocument(projectUri)).toBe(false);
        expect(services.shared.workspace.LangiumDocuments.getDocument(catalogueUri)).toBe(preloadedDocument);
        expect(services.shared.workspace.ProjectManager.getProject(preloadedDocument)).toBeUndefined();
    });

    test('notifies readonly clients after initial mirrors have been rebuilt', async () => {
        const projectDir = createProject('mirror');
        const sourcePath = path.join(projectDir, 'src', 'external.smpcat');
        fs.writeFileSync(sourcePath, createSmpCatalogue('external'));
        const sendNotification = vi.fn(async () => undefined);
        const services = await createBuiltinTestXsmpServices({
            ...NodeFileSystem,
            connection: {
                sendDiagnostics: vi.fn(),
                sendNotification,
            },
        } as never);

        await services.shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: 'mirror', uri: URI.file(projectDir).toString() },
        ]);

        const mirrorUri = services.shared.SmpWorkspaceIndex.getMirrorUriForSourcePath(sourcePath);
        expect(mirrorUri).toBeDefined();
        expect(sendNotification).toHaveBeenCalledWith(SmpMirrorsChangedNotification, {
            changed: [mirrorUri!.toString()],
            deleted: [],
        });
    });
});

function createProject(name: string): string {
    const projectDir = path.join(tempDir, name);
    const sourceDir = path.join(projectDir, 'src');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'xsmp.project'), `
project '${name}'
using 'ECSS_SMP_2025'
source 'src'
`.trimStart());
    fs.writeFileSync(path.join(sourceDir, `${name}.xsmpcat`), `catalogue ${name}\n`);
    return projectDir;
}

function createSmpCatalogue(name: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Catalogue:Catalogue xmlns:Catalogue="http://www.ecss.nl/smp/2025/Smdl/Catalogue" xmlns:Elements="http://www.ecss.nl/smp/2025/Core/Elements" xmlns:Types="http://www.ecss.nl/smp/2025/Core/Types" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Id="${name}" Name="${name}">
</Catalogue:Catalogue>
`;
}
