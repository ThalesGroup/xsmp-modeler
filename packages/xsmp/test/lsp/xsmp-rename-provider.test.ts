import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import type { RenameParams, WorkspaceEdit } from 'vscode-languageserver-protocol';
import { createXsmpServices } from 'xsmp';
import { Assembly, Catalogue, Configuration, Project } from 'xsmp/ast-partial';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let services: ReturnType<typeof createXsmpServices>;
let parseProject: ReturnType<typeof parseHelper<Project>>;
let parseCatalogue: ReturnType<typeof parseHelper<Catalogue>>;
let parseConfiguration: ReturnType<typeof parseHelper<Configuration>>;
let parseAssembly: ReturnType<typeof parseHelper<Assembly>>;
const documents: LangiumDocument[] = [];
const tempDirs: string[] = [];

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parseProject = parseHelper<Project>(services.xsmpproject);
    parseCatalogue = parseHelper<Catalogue>(services.xsmpcat);
    parseConfiguration = parseHelper<Configuration>(services.xsmpcfg);
    parseAssembly = parseHelper<Assembly>(services.xsmpasb);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

afterEach(async () => {
    if (documents.length > 0) {
        await clearDocuments(services.shared, documents.splice(0));
    }
    while (tempDirs.length > 0) {
        fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
});

describe('Xsmp rename provider', () => {
    test('renames a namespace across qualified references in catalogue, configuration and assembly documents', async () => {
        const workspace = await parseRenameWorkspace(
            extractCursor(`catalogue Demo

namespace de@@mo
{
    public model Child
    {
    }

    public model Root
    {
        container Child child = demo.Child
    }
}
`),
            `configuration Demo
/Root: demo.Root
{
}
`,
            `assembly Demo
Root: demo.Root
{
    child += Child: demo.Child
}
`,
        );

        const edit = await rename(workspace.catalogueDocument, workspace.cursor, 'mission');
        const renamed = applyWorkspaceEdit(edit, workspace.originalTexts);

        expect(renamed.get(workspace.catalogueDocument.textDocument.uri)).toContain('namespace mission');
        expect(renamed.get(workspace.catalogueDocument.textDocument.uri)).toContain('container Child child = mission.Child');
        expect(renamed.get(workspace.configurationDocument.textDocument.uri)).toContain('/Root: mission.Root');
        expect(renamed.get(workspace.assemblyDocument.textDocument.uri)).toContain('Root: mission.Root');
        expect(renamed.get(workspace.assemblyDocument.textDocument.uri)).toContain('child += Child: mission.Child');
    });

    test('renames a model across both qualified and local type references', async () => {
        const workspace = await parseRenameWorkspace(
            extractCursor(`catalogue Demo

namespace demo
{
    public model Ch@@ild
    {
    }

    public model Root
    {
        container Child child = demo.Child
    }
}
`),
            `configuration Demo
/Root: demo.Root
{
}
`,
            `assembly Demo
Root: demo.Root
{
    child += Child: demo.Child
}
`,
        );

        const edit = await rename(workspace.catalogueDocument, workspace.cursor, 'Worker');
        const renamed = applyWorkspaceEdit(edit, workspace.originalTexts);
        const catalogueText = renamed.get(workspace.catalogueDocument.textDocument.uri) ?? '';
        const assemblyText = renamed.get(workspace.assemblyDocument.textDocument.uri) ?? '';

        expect(catalogueText).toContain('public model Worker');
        expect(catalogueText).toContain('container Worker child = demo.Worker');
        expect(assemblyText).toContain('child += Child: demo.Worker');
        expect(assemblyText).not.toContain('demo.Child');
    });
});

async function parseRenameWorkspace(
    catalogue: { cursor: number; text: string },
    configurationText: string,
    assemblyText: string,
): Promise<{
    assemblyDocument: LangiumDocument<Assembly>;
    catalogueDocument: LangiumDocument<Catalogue>;
    configurationDocument: LangiumDocument<Configuration>;
    cursor: number;
    originalTexts: Map<string, string>;
}> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-rename-'));
    tempDirs.push(tempDir);

    const projectDocument = await parseProject(
        `project "Demo" using "ECSS_SMP_2025"
source "src"
`,
        { documentUri: URI.file(path.join(tempDir, 'xsmp.project')).toString() }
    );
    const catalogueDocument = await parseCatalogue(catalogue.text, {
        documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmpcat')).toString(),
    });
    const configurationDocument = await parseConfiguration(configurationText, {
        documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmpcfg')).toString(),
    });
    const assemblyDocument = await parseAssembly(assemblyText, {
        documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmpasb')).toString(),
    });

    documents.push(projectDocument, catalogueDocument, configurationDocument, assemblyDocument);
    await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });

    expect(projectDocument.parseResult.parserErrors).toHaveLength(0);
    expect(catalogueDocument.parseResult.parserErrors).toHaveLength(0);
    expect(configurationDocument.parseResult.parserErrors).toHaveLength(0);
    expect(assemblyDocument.parseResult.parserErrors).toHaveLength(0);

    return {
        assemblyDocument,
        catalogueDocument,
        configurationDocument,
        cursor: catalogue.cursor,
        originalTexts: new Map([
            [catalogueDocument.textDocument.uri, catalogue.text],
            [configurationDocument.textDocument.uri, configurationText],
            [assemblyDocument.textDocument.uri, assemblyText],
        ]),
    };
}

async function rename(document: LangiumDocument<Catalogue>, offset: number, newName: string): Promise<WorkspaceEdit> {
    const params: RenameParams = {
        textDocument: { uri: document.textDocument.uri },
        position: document.textDocument.positionAt(offset),
        newName,
    };
    const edit = await services.xsmpcat.lsp.RenameProvider?.rename(document, params);
    expect(edit?.changes).toBeDefined();
    return edit as WorkspaceEdit;
}

function applyWorkspaceEdit(edit: WorkspaceEdit, originalTexts: Map<string, string>): Map<string, string> {
    const result = new Map(originalTexts);
    for (const [uri, edits] of Object.entries(edit.changes ?? {})) {
        let text = result.get(uri) ?? '';
        const sortedEdits = [...edits].sort((left, right) => compareRangeStarts(right.range, left.range));
        for (const item of sortedEdits) {
            const start = offsetAt(text, item.range.start.line, item.range.start.character);
            const end = offsetAt(text, item.range.end.line, item.range.end.character);
            text = text.slice(0, start) + item.newText + text.slice(end);
        }
        result.set(uri, text);
    }
    return result;
}

function compareRangeStarts(
    left: { start: { character: number; line: number } },
    right: { start: { character: number; line: number } },
): number {
    if (left.start.line !== right.start.line) {
        return left.start.line - right.start.line;
    }
    return left.start.character - right.start.character;
}

function offsetAt(text: string, line: number, character: number): number {
    if (line === 0) {
        return character;
    }
    let currentLine = 0;
    let index = 0;
    while (index < text.length && currentLine < line) {
        if (text[index] === '\n') {
            currentLine++;
        }
        index++;
    }
    return index + character;
}

function extractCursor(text: string): { cursor: number; text: string } {
    const marker = '@@';
    const cursor = text.indexOf(marker);
    expect(cursor).toBeGreaterThanOrEqual(0);
    return {
        cursor,
        text: text.slice(0, cursor) + text.slice(cursor + marker.length),
    };
}
