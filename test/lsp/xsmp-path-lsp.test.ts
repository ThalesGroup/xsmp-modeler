import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { clearDocuments, parseHelper } from 'langium/test';
import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { MarkupContent, type LocationLink, type Range, type TextDocumentPositionParams } from 'vscode-languageserver';
import { createXsmpServices } from '../../src/language/xsmp-module.js';
import { Assembly, Catalogue, LinkBase, Project, Schedule } from '../../src/language/generated/ast.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let services: ReturnType<typeof createXsmpServices>;
let parseProject: ReturnType<typeof parseHelper<Project>>;
let parseCatalogue: ReturnType<typeof parseHelper<Catalogue>>;
let parseAssembly: ReturnType<typeof parseHelper<Assembly>>;
let parseLinkBase: ReturnType<typeof parseHelper<LinkBase>>;
let parseSchedule: ReturnType<typeof parseHelper<Schedule>>;
const documents: LangiumDocument[] = [];
const tempDirs: string[] = [];

const assemblyCatalogueSource = `catalogue Demo

namespace demo
{
    public model Child
    {
        /** child count */
        field Smp.Int32 [[count]]
    }

    public model Root
    {
        container Child child = demo.Child
    }
}
`;

const linkBaseCatalogueSource = `catalogue Demo

namespace demo
{
    public model Child
    {
        /** child input */
        input field Smp.Int32 [[inValue]]
        output field Smp.Int32 outValue
    }

    public model Root
    {
        output field Smp.Int32 outValue
        container Child child = demo.Child
    }
}
`;

const scheduleCatalogueSource = `catalogue Demo

namespace demo
{
    public model Child
    {
        /** child reset */
        public def void [[reset]]()
    }

    public model Root
    {
        container Child child = demo.Child
    }
}
`;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parseProject = parseHelper<Project>(services.xsmpproject);
    parseCatalogue = parseHelper<Catalogue>(services.xsmpcat);
    parseAssembly = parseHelper<Assembly>(services.xsmpasb);
    parseLinkBase = parseHelper<LinkBase>(services.xsmplnk);
    parseSchedule = parseHelper<Schedule>(services.xsmpsed);

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

describe('XSMP Path LSP', () => {
    test('supports definition and hover on typed assembly paths', async () => {
        const catalogue = extractRange(assemblyCatalogueSource);
        const assemblyPath = extractCursor(`assembly Demo

configure child
{
    co@@unt = 1i32
}

Root: demo.Root
{
    child += Child: demo.Child
}
`);

        const { catalogueDocument, document } = await parseAssemblyWorkspace(catalogue.text, assemblyPath.text);
        const locations = await getDefinitions(services.xsmpasb.lsp.DefinitionProvider, document, assemblyPath.cursor);

        expectLocation(locations, catalogueDocument, catalogue.range);

        const hover = await services.xsmpasb.lsp.HoverProvider?.getHoverContent(document, positionParams(document, assemblyPath.cursor));
        const content = hover && MarkupContent.is(hover.contents) ? hover.contents.value : '';
        expect(content).toMatch(/child count|count/i);
    });

    test('supports definition on typed link base paths and avoids false links without anchors', async () => {
        const catalogue = extractRange(linkBaseCatalogueSource);
        const linkBasePath = extractCursor(`link Demo

/: demo.Root
{
    field link outValue -> child.in@@Value
}
`);

        const { catalogueDocument, document } = await parseLinkBaseWorkspace(catalogue.text, linkBasePath.text);
        const locations = await getDefinitions(services.xsmplnk.lsp.DefinitionProvider, document, linkBasePath.cursor);
        expectLocation(locations, catalogueDocument, catalogue.range);

        const untypedPath = extractCursor(`link Demo

Loose
{
    field link out@@Value -> inValue
}
`);
        const { document: untypedDocument } = await parseLinkBaseWorkspace(catalogue.text, untypedPath.text);
        const untypedLocations = await getDefinitions(services.xsmplnk.lsp.DefinitionProvider, untypedDocument, untypedPath.cursor);
        expect(untypedLocations).toHaveLength(0);
    });

    test('supports definition and hover on typed schedule paths', async () => {
        const catalogue = extractRange(scheduleCatalogueSource);
        const schedulePath = extractCursor(`schedule Demo

task Main: demo.Root
{
    call child.re@@set()
    execute Worker at child
}

task Worker: demo.Child
{
}
`);

        const { catalogueDocument, document } = await parseScheduleWorkspace(catalogue.text, schedulePath.text);
        const locations = await getDefinitions(services.xsmpsed.lsp.DefinitionProvider, document, schedulePath.cursor);

        expectLocation(locations, catalogueDocument, catalogue.range);

        const hover = await services.xsmpsed.lsp.HoverProvider?.getHoverContent(document, positionParams(document, schedulePath.cursor));
        const content = hover && MarkupContent.is(hover.contents) ? hover.contents.value : '';
        expect(content).toMatch(/child reset|reset/i);
    });
});

async function parseAssemblyWorkspace(catalogueText: string, assemblyText: string): Promise<{
    catalogueDocument: LangiumDocument<Catalogue>;
    document: LangiumDocument<Assembly>;
}> {
    const { catalogueDocument, tempDir } = await parseProjectAndCatalogue(catalogueText);
    const document = await parseAssembly(assemblyText, {
        documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmpasb')).toString(),
    });
    documents.push(document);
    expect(document.parseResult.parserErrors).toHaveLength(0);
    return { catalogueDocument, document };
}

async function parseLinkBaseWorkspace(catalogueText: string, linkBaseText: string): Promise<{
    catalogueDocument: LangiumDocument<Catalogue>;
    document: LangiumDocument<LinkBase>;
}> {
    const { catalogueDocument, tempDir } = await parseProjectAndCatalogue(catalogueText);
    const document = await parseLinkBase(linkBaseText, {
        documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmplnk')).toString(),
    });
    documents.push(document);
    expect(document.parseResult.parserErrors).toHaveLength(0);
    return { catalogueDocument, document };
}

async function parseScheduleWorkspace(catalogueText: string, scheduleText: string): Promise<{
    catalogueDocument: LangiumDocument<Catalogue>;
    document: LangiumDocument<Schedule>;
}> {
    const { catalogueDocument, tempDir } = await parseProjectAndCatalogue(catalogueText);
    const document = await parseSchedule(scheduleText, {
        documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmpsed')).toString(),
    });
    documents.push(document);
    expect(document.parseResult.parserErrors).toHaveLength(0);
    return { catalogueDocument, document };
}

async function parseProjectAndCatalogue(catalogueText: string): Promise<{
    catalogueDocument: LangiumDocument<Catalogue>;
    tempDir: string;
}> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-path-lsp-'));
    tempDirs.push(tempDir);

    const projectDocument = await parseProject(
        `project "Demo" using "ECSS_SMP_2025"
source "src"
`,
        { documentUri: URI.file(path.join(tempDir, 'xsmp.project')).toString() }
    );
    const catalogueDocument = await parseCatalogue(catalogueText, {
        documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmpcat')).toString(),
    });

    documents.push(projectDocument, catalogueDocument);
    expect(projectDocument.parseResult.parserErrors).toHaveLength(0);
    expect(catalogueDocument.parseResult.parserErrors).toHaveLength(0);

    return { catalogueDocument, tempDir };
}

async function getDefinitions(
    provider: { getDefinition(document: LangiumDocument, params: TextDocumentPositionParams): Promise<LocationLink[]> } | undefined,
    document: LangiumDocument,
    offset: number,
): Promise<LocationLink[]> {
    return await provider?.getDefinition(document, positionParams(document, offset)) ?? [];
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
