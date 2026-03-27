import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { clearDocuments, parseHelper } from 'langium/test';
import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { CodeActionKind, MarkupContent, TextEdit, type CodeAction, type LocationLink, type Range, type TextDocumentPositionParams } from 'vscode-languageserver';
import type { CodeActionParams } from 'vscode-languageserver-protocol';
import { createXsmpServices } from 'xsmp';
import { Catalogue, Configuration, Project } from 'xsmp/ast-partial';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let services: ReturnType<typeof createXsmpServices>;
let parseProject: ReturnType<typeof parseHelper<Project>>;
let parseCatalogue: ReturnType<typeof parseHelper<Catalogue>>;
let parseConfiguration: ReturnType<typeof parseHelper<Configuration>>;
const documents: LangiumDocument[] = [];
const tempDirs: string[] = [];

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parseProject = parseHelper<Project>(services.xsmpproject);
    parseCatalogue = parseHelper<Catalogue>(services.xsmpcat);
    const doParseConfiguration = parseHelper<Configuration>(services.xsmpcfg);
    parseConfiguration = (input, options) => doParseConfiguration(input, { validation: true, ...options });

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

describe('Xsmpcfg LSP', () => {
    test('supports hover and definition on typed field path segments', async () => {
        const catalogue = extractRange(`catalogue Demo

namespace demo
{
    public array IntPair = Smp.Int32[2]

    public struct Counters
    {
        /** count field */
        field Smp.Int32 [[count]]
        field Smp.Bool enabled
        field IntPair values
    }

    public model Child
    {
        field Smp.Int32 value
    }

    public model Root
    {
        field Counters state
        field Smp.Bool flag
        container Child child
    }
}
`);
        const configuration = extractCursor(`configuration Demo
/Root: demo.Root
{
    state.co@@unt = 1i32
}
`);

        const { catalogueDocument, configurationDocument } = await parseProjectDocuments(catalogue.text, configuration.text);
        const locations = await getDefinitions(configurationDocument, configuration.cursor);

        expectLocation(locations, catalogueDocument, catalogue.range);

        const hover = await services.xsmpcfg.lsp.HoverProvider?.getHoverContent(configurationDocument, positionParams(configurationDocument, configuration.cursor));
        const content = hover && MarkupContent.is(hover.contents) ? hover.contents.value : '';
        expect(content).toMatch(/count field|count/i);
    });

    test('supports definition on typed component configuration names', async () => {
        const catalogue = extractRange(`catalogue Demo

namespace demo
{
    public model Child
    {
        field Smp.Int32 value
    }

    public model Root
    {
        /** child container */
        container Child [[child]]
    }
}
`);
        const configuration = extractCursor(`configuration Demo
/Root: demo.Root
{
    chi@@ld
    {
        value = 2i32
    }
}
`);

        const { catalogueDocument, configurationDocument } = await parseProjectDocuments(catalogue.text, configuration.text);
        const locations = await getDefinitions(configurationDocument, configuration.cursor);

        expectLocation(locations, catalogueDocument, catalogue.range);
    });

    test('supports definition on typed include paths', async () => {
        const catalogue = extractRange(`catalogue Demo

namespace demo
{
    public model Child
    {
        field Smp.Int32 value
    }

    public model Root
    {
        /** child container */
        container Child [[child]]
    }
}
`);
        const configuration = extractCursor(`configuration Demo
/Root: demo.Root
{
    include Other at chi@@ld
}
`);

        const { catalogueDocument, configurationDocument } = await parseProjectDocuments(catalogue.text, configuration.text);
        const locations = await getDefinitions(configurationDocument, configuration.cursor);

        expectLocation(locations, catalogueDocument, catalogue.range);
    });

    test('keeps absolute root names in text mode', async () => {
        const { configurationDocument } = await parseProjectDocuments(`catalogue Demo

namespace demo
{
    public model Root
    {
        field Smp.Bool flag
    }
}
`, extractCursor(`configuration Demo
/@@Root: demo.Root
{
    flag = true
}
`).text);

        const locations = await getDefinitions(configurationDocument, extractCursor(`configuration Demo
/@@Root: demo.Root
{
    flag = true
}
`).cursor);

        expect(locations).toHaveLength(0);
    });

    test('offers a quick fix to declare invalid typed paths as unsafe', async () => {
        const configuration = extractCursor(`configuration Demo
/Root: demo.Root
{
    @@state.unknown = 1i32
}
`);

        const { configurationDocument } = await parseProjectDocuments(catalogueSource, configuration.text);
        expect(configurationDocument.diagnostics?.some(diagnostic => diagnostic.message.includes('unknown'))).toBe(true);

        const actions = await getCodeActions(configurationDocument);
        expect(actions).toHaveLength(1);
        expect(actions[0].title).toBe('Declare as `unsafe`.');
        expect(actions[0].edit?.changes?.[configurationDocument.textDocument.uri]).toEqual([
            TextEdit.insert(configurationDocument.textDocument.positionAt(configuration.cursor), 'unsafe ')
        ]);
    });
});

const catalogueSource = `catalogue Demo

namespace demo
{
    public array IntPair = Smp.Int32[2]

    public struct Counters
    {
        field Smp.Int32 count
        field Smp.Bool enabled
        field IntPair values
    }

    public model Child
    {
        field Smp.Int32 value
    }

    public model Root
    {
        field Counters state
        field Smp.Bool flag
        container Child child
    }
}
`;

async function parseProjectDocuments(catalogueSource: string, configurationSource: string): Promise<{
    catalogueDocument: LangiumDocument<Catalogue>;
    configurationDocument: LangiumDocument<Configuration>;
}> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmpcfg-lsp-'));
    tempDirs.push(tempDir);

    const projectDocument = await parseProject(
        `project "Demo" using "ECSS_SMP_2025"
source "src"
`,
        { documentUri: URI.file(path.join(tempDir, 'xsmp.project')).toString() }
    );
    const catalogueDocument = await parseCatalogue(catalogueSource, {
        documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmpcat')).toString(),
    });
    const otherConfigurationDocument = await parseConfiguration(`configuration Other
/Other
{
}
`, {
        documentUri: URI.file(path.join(tempDir, 'src', 'other.xsmpcfg')).toString(),
    });
    const configurationDocument = await parseConfiguration(configurationSource, {
        documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmpcfg')).toString(),
    });

    documents.push(projectDocument, catalogueDocument, otherConfigurationDocument, configurationDocument);
    expect(projectDocument.parseResult.parserErrors).toHaveLength(0);
    expect(catalogueDocument.parseResult.parserErrors).toHaveLength(0);
    expect(otherConfigurationDocument.parseResult.parserErrors).toHaveLength(0);
    expect(configurationDocument.parseResult.parserErrors).toHaveLength(0);

    return { catalogueDocument, configurationDocument };
}

async function getDefinitions(document: LangiumDocument<Configuration>, offset: number): Promise<LocationLink[]> {
    return await services.xsmpcfg.lsp.DefinitionProvider?.getDefinition(document, positionParams(document, offset)) ?? [];
}

async function getCodeActions(document: LangiumDocument<Configuration>): Promise<CodeAction[]> {
    const diagnostics = document.diagnostics ?? [];
    const params: CodeActionParams = {
        textDocument: { uri: document.textDocument.uri },
        range: diagnostics[0]?.range ?? {
            start: document.textDocument.positionAt(0),
            end: document.textDocument.positionAt(0),
        },
        context: {
            diagnostics,
            only: [CodeActionKind.QuickFix],
        },
    };
    return (await services.xsmpcfg.lsp.CodeActionProvider?.getCodeActions(document, params) ?? []) as CodeAction[];
}

function positionParams(document: LangiumDocument, offset: number): TextDocumentPositionParams {
    return {
        textDocument: { uri: document.textDocument.uri },
        position: document.textDocument.positionAt(offset),
    };
}

function expectLocation(locations: LocationLink[], targetDocument: LangiumDocument, rangeOffsets: [number, number]): void {
    expect(locations).toHaveLength(1);
    expect(locations[0].targetUri).toBe(targetDocument.textDocument.uri);
    expect(locations[0].targetSelectionRange).toEqual(toRange(targetDocument, rangeOffsets));
}

function toRange(document: LangiumDocument, offsets: [number, number]): Range {
    return {
        start: document.textDocument.positionAt(offsets[0]),
        end: document.textDocument.positionAt(offsets[1]),
    };
}

function extractRange(text: string): { range: [number, number]; text: string } {
    const startMarker = '[[';
    const endMarker = ']]';
    const start = text.indexOf(startMarker);
    const end = text.indexOf(endMarker);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const withoutStart = text.slice(0, start) + text.slice(start + startMarker.length);
    const adjustedEnd = end - startMarker.length;
    const cleaned = withoutStart.slice(0, adjustedEnd) + withoutStart.slice(adjustedEnd + endMarker.length);
    return {
        range: [start, adjustedEnd],
        text: cleaned,
    };
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
