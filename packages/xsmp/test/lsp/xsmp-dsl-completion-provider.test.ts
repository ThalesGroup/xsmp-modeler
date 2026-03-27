import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { clearDocuments, parseHelper } from 'langium/test';
import { EmptyFileSystem, type AstNode, type LangiumDocument, URI } from 'langium';
import type { CompletionProvider } from 'langium/lsp';
import { InsertTextFormat, type CompletionItem } from 'vscode-languageserver';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createXsmpServices } from 'xsmp';
import type { Assembly, Catalogue, Configuration, LinkBase, Project, Schedule } from 'xsmp/ast-partial';

let services: ReturnType<typeof createXsmpServices>;
let parseProject: ReturnType<typeof parseHelper<Project>>;
let parseCatalogue: ReturnType<typeof parseHelper<Catalogue>>;
let parseConfiguration: ReturnType<typeof parseHelper<Configuration>>;
let parseAssembly: ReturnType<typeof parseHelper<Assembly>>;
let parseLinkBase: ReturnType<typeof parseHelper<LinkBase>>;
let parseSchedule: ReturnType<typeof parseHelper<Schedule>>;
const documents: LangiumDocument[] = [];
const tempDirs: string[] = [];

const catalogueSource = `catalogue Demo

namespace demo
{
    public enum Mode
    {
        Nominal = 0,
        Safe = 1
    }

    public interface ILogger
    {
    }

    public struct State
    {
        field Smp.Bool enabled
        field Smp.Int32 count
    }

    public model Child
    {
        input field Smp.Int32 inValue
        output field Smp.Int32 outValue
        public def void reset()
        reference demo.ILogger backLogger
    }

    public model Root
    {
        field State state
        field Smp.Bool flag
        output field Smp.Int32 outValue
        input field Smp.Int32 inValue
        readWrite property demo.Mode mode
        public def void apply(in demo.Mode requestedMode)
        entrypoint step
        container Child child = demo.Child
        reference demo.ILogger logger
    }
}
`;

const assemblySource = `assembly DemoAsm
Root: demo.Root
{
    child += Child: demo.Child
}
`;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parseProject = parseHelper<Project>(services.xsmpproject);
    parseCatalogue = parseHelper<Catalogue>(services.xsmpcat);
    parseConfiguration = parseHelper<Configuration>(services.xsmpcfg);
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

describe('XSMP DSL completion providers', () => {
    test('xsmpcfg offers structure snippets and typed field/value completion', async () => {
        const snippetCursor = extractCursor(`configuration Demo
@@
`);
        const { configurationDocument: snippetDocument } = await parseWorkspace({
            configuration: snippetCursor.text,
        });
        const snippetItems = await getCompletionItems(services.xsmpcfg.lsp.CompletionProvider!, snippetDocument, snippetCursor.cursor);
        expect(labels(snippetItems)).toContain('Root Component Configuration');
        expect(labels(snippetItems)).toContain('Include Configuration');
        expect(labels(snippetItems)).not.toContain('configuration');

        const fieldCursor = extractCursor(`configuration Demo
/Root: demo.Root
{
    @@
}
`);
        const { configurationDocument: fieldDocument } = await parseWorkspace({
            configuration: fieldCursor.text,
        });
        const fieldItems = await getCompletionItems(services.xsmpcfg.lsp.CompletionProvider!, fieldDocument, fieldCursor.cursor);
        const flagItem = findSnippetItem(fieldItems, 'flag');
        expect(flagItem?.insertTextFormat).toBe(InsertTextFormat.Snippet);
        expect(flagItem?.textEdit?.newText ?? flagItem?.insertText).toContain('flag = ');
        expect(labels(fieldItems)).toContain('child: demo.Child');
        expect(labels(fieldItems)).toContain('include at child');

        const nestedCursor = extractCursor(`configuration Demo
/Root: demo.Root
{
    child: demo.Child
    {
        @@
    }
}
`);
        const { configurationDocument: nestedDocument } = await parseWorkspace({
            configuration: nestedCursor.text,
        });
        const nestedItems = await getCompletionItems(services.xsmpcfg.lsp.CompletionProvider!, nestedDocument, nestedCursor.cursor);
        expect(labels(nestedItems)).toContain('Component Configuration');
        expect(labels(nestedItems)).not.toContain('Root Component Configuration');

        const valueCursor = extractCursor(`configuration Demo
/Root: demo.Root
{
    flag = @@
}
`);
        const { configurationDocument: valueDocument } = await parseWorkspace({
            configuration: valueCursor.text,
        });
        const valueItems = await getCompletionItems(services.xsmpcfg.lsp.CompletionProvider!, valueDocument, valueCursor.cursor);
        expect(labels(valueItems)).toContain('false');
        expect(labels(valueItems)).toContain('true');
    });

    test('xsmpasb offers model snippets and enriches local call/property completion', async () => {
        const snippetCursor = extractCursor(`assembly Demo
Root: demo.Root
{
    @@
}
`);
        const { assemblyDocument: snippetDocument } = await parseWorkspace({
            assembly: snippetCursor.text,
        });
        const snippetItems = await getCompletionItems(services.xsmpasb.lsp.CompletionProvider!, snippetDocument, snippetCursor.cursor);
        expect(labels(snippetItems)).toContain('Sub Model Instance');
        expect(labels(snippetItems)).toContain('Field Link');
        expect(labels(snippetItems)).toContain('Interface Link');
        expect(labels(snippetItems)).toContain('child += Child: demo.Child');
        expect(labels(snippetItems)).toContain('field link outValue -> child.inValue');

        const prefixedCursor = extractCursor(`assembly Demo
Root: demo.Root
{
    ch@@
}
`);
        const { assemblyDocument: prefixedDocument } = await parseWorkspace({
            assembly: prefixedCursor.text,
        });
        const prefixedItems = await getCompletionItems(services.xsmpasb.lsp.CompletionProvider!, prefixedDocument, prefixedCursor.cursor);
        expect(labels(prefixedItems)).toContain('child += Child: demo.Child');

        const lastPrefixedCursor = extractCursor(`assembly Demo
Root: demo.Root
{
    child += Child: demo.Child

    ch@@
}
`);
        const { assemblyDocument: lastPrefixedDocument } = await parseWorkspace({
            assembly: lastPrefixedCursor.text,
        });
        const lastPrefixedItems = await getCompletionItems(services.xsmpasb.lsp.CompletionProvider!, lastPrefixedDocument, lastPrefixedCursor.cursor);
        expect(labels(lastPrefixedItems)).toContain('child += Child: demo.Child');

        const templatedLastPrefixedCursor = extractCursor(`assembly <Lane = "Ops"> Demo
Root{Lane}: demo.Root
{
    child += Child: demo.Child
ch@@
}
`);
        const { assemblyDocument: templatedLastPrefixedDocument } = await parseWorkspace({
            assembly: templatedLastPrefixedCursor.text,
        });
        const templatedLastPrefixedItems = await getCompletionItems(
            services.xsmpasb.lsp.CompletionProvider!,
            templatedLastPrefixedDocument,
            templatedLastPrefixedCursor.cursor
        );
        expect(labels(templatedLastPrefixedItems)).toContain('child += Child: demo.Child');

        const outsideBlockCursor = extractCursor(`assembly <Lane = "Ops"> Demo
Root{Lane}: demo.Root
{
    child += Child: demo.Child
}

@@
`);
        const { assemblyDocument: outsideBlockDocument } = await parseWorkspace({
            assembly: outsideBlockCursor.text,
        });
        const outsideBlockItems = await getCompletionItems(
            services.xsmpasb.lsp.CompletionProvider!,
            outsideBlockDocument,
            outsideBlockCursor.cursor
        );
        expect(labels(outsideBlockItems)).toContain('Configure Instance');
        expect(labels(outsideBlockItems)).toContain('Root Model Instance');
        expect(labels(outsideBlockItems)).not.toContain('assembly');
        expect(labels(outsideBlockItems)).not.toContain('Sub Model Instance');
        expect(labels(outsideBlockItems)).not.toContain('Field Link');
        expect(labels(outsideBlockItems)).not.toContain('child += Child: demo.Child');

        const callCursor = extractCursor(`assembly Demo
Root: demo.Root
{
    call @@
}
`);
        const { assemblyDocument: callDocument } = await parseWorkspace({
            assembly: callCursor.text,
        });
        const callItems = await getCompletionItems(services.xsmpasb.lsp.CompletionProvider!, callDocument, callCursor.cursor);
        const applyItem = findSnippetItem(callItems, 'apply');
        expect(applyItem?.insertTextFormat).toBe(InsertTextFormat.Snippet);
        expect(applyItem?.textEdit?.newText ?? applyItem?.insertText).toContain('apply(');
        expect(applyItem?.textEdit?.newText ?? applyItem?.insertText).toContain('requestedMode = ');

        const propertyCursor = extractCursor(`assembly Demo
Root: demo.Root
{
    property @@
}
`);
        const { assemblyDocument: propertyDocument } = await parseWorkspace({
            assembly: propertyCursor.text,
        });
        const propertyItems = await getCompletionItems(services.xsmpasb.lsp.CompletionProvider!, propertyDocument, propertyCursor.cursor);
        const modeItem = findSnippetItem(propertyItems, 'mode');
        expect(modeItem?.insertTextFormat).toBe(InsertTextFormat.Snippet);
        expect(modeItem?.textEdit?.newText ?? modeItem?.insertText).toContain('mode = ');

        const configureCursor = extractCursor(`assembly Demo
Root: demo.Root
{
}

configure /
{
    @@
}
`);
        const { assemblyDocument: configureDocument } = await parseWorkspace({
            assembly: configureCursor.text,
        });
        const configureItems = await getCompletionItems(services.xsmpasb.lsp.CompletionProvider!, configureDocument, configureCursor.cursor);
        expect(labels(configureItems)).toContain('flag');
        expect(labels(configureItems)).toContain('subscribe step');
        expect(labels(configureItems)).toContain('property mode');
        expect(labels(configureItems)).toContain('call apply');
        expect(labels(configureItems)).not.toContain('Root Model Instance');
        expect(labels(configureItems)).not.toContain('Configure Instance');

        const subInstanceTypeCursor = extractCursor(`assembly Demo
Root: demo.Root
{
    child += Child: @@
}
`);
        const { assemblyDocument: subInstanceTypeDocument } = await parseWorkspace({
            assembly: subInstanceTypeCursor.text,
        });
        const subInstanceTypeItems = await getCompletionItems(services.xsmpasb.lsp.CompletionProvider!, subInstanceTypeDocument, subInstanceTypeCursor.cursor);
        expect(labels(subInstanceTypeItems)).toContain('demo.Child');

        const templatedSubInstanceTypeCursor = extractCursor(`assembly <Lane = "Ops"> Demo
Root: demo.Root
{
    child += Logger{Lane}: @@
}
`);
        const { assemblyDocument: templatedSubInstanceTypeDocument } = await parseWorkspace({
            assembly: templatedSubInstanceTypeCursor.text,
        });
        const templatedSubInstanceTypeItems = await getCompletionItems(services.xsmpasb.lsp.CompletionProvider!, templatedSubInstanceTypeDocument, templatedSubInstanceTypeCursor.cursor);
        expect(labels(templatedSubInstanceTypeItems)).toContain('demo.Child');

        const rootTypeCursor = extractCursor(`assembly Demo
Root: @@
{
}
`);
        const { assemblyDocument: rootTypeDocument } = await parseWorkspace({
            assembly: rootTypeCursor.text,
        });
        const rootTypeItems = await getCompletionItems(services.xsmpasb.lsp.CompletionProvider!, rootTypeDocument, rootTypeCursor.cursor);
        expect(labels(rootTypeItems)).toContain('demo.Root');
        expect(labels(rootTypeItems)).not.toContain('Sub Model Instance');
        expect(labels(rootTypeItems)).not.toContain('Field Link');
        expect(labels(rootTypeItems)).not.toContain('Root Model Instance');

        const templatedRootTypeCursor = extractCursor(`assembly <Lane = "Ops", BusMember = "avionics"> Demo
Scenario{Lane}: @@
{
}
`);
        const { assemblyDocument: templatedRootTypeDocument } = await parseWorkspace({
            assembly: templatedRootTypeCursor.text,
        });
        const templatedRootTypeItems = await getCompletionItems(services.xsmpasb.lsp.CompletionProvider!, templatedRootTypeDocument, templatedRootTypeCursor.cursor);
        expect(labels(templatedRootTypeItems)).toContain('demo.Root');
        expect(labels(templatedRootTypeItems)).not.toContain('Lane');
        expect(labels(templatedRootTypeItems)).not.toContain('BusMember');
    });

    test('xsmplnk offers link snippets and typed reference completion', async () => {
        const snippetCursor = extractCursor(`link Demo for DemoAsm
@@
`);
        const { linkBaseDocument: snippetDocument } = await parseWorkspace({
            assemblyDoc: assemblySource,
            linkBase: snippetCursor.text,
        });
        const snippetItems = await getCompletionItems(services.xsmplnk.lsp.CompletionProvider!, snippetDocument, snippetCursor.cursor);
        expect(labels(snippetItems)).toContain('Root Component Link Base');
        expect(labels(snippetItems)).not.toContain('link');

        const nestedCursor = extractCursor(`link Demo for DemoAsm
/
{
    @@
}
`);
        const { linkBaseDocument: nestedDocument } = await parseWorkspace({
            assemblyDoc: assemblySource,
            linkBase: nestedCursor.text,
        });
        const nestedItems = await getCompletionItems(services.xsmplnk.lsp.CompletionProvider!, nestedDocument, nestedCursor.cursor);
        expect(labels(nestedItems)).toContain('Component Link Base');
        expect(labels(nestedItems)).not.toContain('Root Component Link Base');
        expect(labels(nestedItems)).toContain('child');
        expect(labels(nestedItems)).toContain('field link outValue -> child.inValue');

        const referenceText = `link Demo for DemoAsm
/
{
    interface link @@ -> child:##
}
`;
        const ownerCursor = referenceText.indexOf('@@');
        const backCursor = referenceText.indexOf('##');
        const { text: referenceSource } = removeMarkers(referenceText, ['@@', '##']);
        const { linkBaseDocument: referenceDocument } = await parseWorkspace({
            assemblyDoc: assemblySource,
            linkBase: referenceSource,
        });

        const ownerItems = await getCompletionItems(services.xsmplnk.lsp.CompletionProvider!, referenceDocument, ownerCursor);
        expect(labels(ownerItems)).toContain('logger');

        const backRefItems = await getCompletionItems(services.xsmplnk.lsp.CompletionProvider!, referenceDocument, backCursor - '@@'.length);
        expect(labels(backRefItems)).toContain('backLogger');
    });

    test('xsmpsed offers schedule snippets, typed values and execute-task snippets', async () => {
        const snippetCursor = extractCursor(`schedule Demo
@@
`);
        const { scheduleDocument: snippetDocument } = await parseWorkspace({
            schedule: snippetCursor.text,
        });
        const snippetItems = await getCompletionItems(services.xsmpsed.lsp.CompletionProvider!, snippetDocument, snippetCursor.cursor);
        expect(labels(snippetItems)).toContain('Task');
        expect(labels(snippetItems)).toContain('Event Epoch');
        expect(labels(snippetItems)).toContain('Event Global Trigger');
        expect(labels(snippetItems)).not.toContain('schedule');

        const callCursor = extractCursor(`schedule Demo
task Main on demo.Root
{
    call @@
}
`);
        const { scheduleDocument: callDocument } = await parseWorkspace({
            schedule: callCursor.text,
        });
        const callItems = await getCompletionItems(services.xsmpsed.lsp.CompletionProvider!, callDocument, callCursor.cursor);
        const applyItem = findSnippetItem(callItems, 'apply');
        expect(applyItem?.insertTextFormat).toBe(InsertTextFormat.Snippet);
        expect(applyItem?.textEdit?.newText ?? applyItem?.insertText).toContain('apply(');

        const executeCursor = extractCursor(`schedule <Root: string = "child", Cycles: int32 = 3> Demo
task Main on demo.Root
{
    execute @@
}

task Worker on demo.Child
{
}
`);
        const { scheduleDocument: executeDocument } = await parseWorkspace({
            schedule: executeCursor.text,
        });
        const executeItems = await getCompletionItems(services.xsmpsed.lsp.CompletionProvider!, executeDocument, executeCursor.cursor);
        const workerItem = findSnippetItem(executeItems, 'Worker');
        expect(workerItem?.insertTextFormat).toBe(InsertTextFormat.Snippet);
        expect(workerItem?.textEdit?.newText ?? workerItem?.insertText).toContain('Worker<');
        expect(workerItem?.textEdit?.newText ?? workerItem?.insertText).toContain('Root = ');
        expect(workerItem?.textEdit?.newText ?? workerItem?.insertText).toContain('Cycles = ');

        const valueCursor = extractCursor(`schedule Demo
task Main on demo.Root
{
    property mode = @@
}
`);
        const { scheduleDocument: valueDocument } = await parseWorkspace({
            schedule: valueCursor.text,
        });
        const valueItems = await getCompletionItems(services.xsmpsed.lsp.CompletionProvider!, valueDocument, valueCursor.cursor);
        expect(labels(valueItems)).toContain('demo.Mode.Nominal');

        const taskStatementCursor = extractCursor(`schedule <Root: string = "child", Cycles: int32 = 3> Demo
task Main on demo.Root
{
    @@
}

task Worker on demo.Child
{
}
`);
        const { scheduleDocument: taskStatementDocument } = await parseWorkspace({
            schedule: taskStatementCursor.text,
        });
        const taskStatementItems = await getCompletionItems(services.xsmpsed.lsp.CompletionProvider!, taskStatementDocument, taskStatementCursor.cursor);
        expect(labels(taskStatementItems)).toContain('call apply');
        expect(labels(taskStatementItems)).toContain('property mode');
        expect(labels(taskStatementItems)).toContain('trig step');
        expect(labels(taskStatementItems)).toContain('transfer outValue -> inValue');
        expect(labels(taskStatementItems)).toContain('execute Worker');
        expect(labels(taskStatementItems)).not.toContain('Task');
        expect(labels(taskStatementItems)).not.toContain('Event Epoch');
    });
});

async function parseWorkspace(input: {
    configuration?: string;
    assembly?: string;
    assemblyDoc?: string;
    linkBase?: string;
    schedule?: string;
}): Promise<{
    configurationDocument?: LangiumDocument<Configuration>;
    assemblyDocument?: LangiumDocument<Assembly>;
    linkBaseDocument?: LangiumDocument<LinkBase>;
    scheduleDocument?: LangiumDocument<Schedule>;
}> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-dsl-completion-'));
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
    documents.push(projectDocument, catalogueDocument);

    const result: {
        configurationDocument?: LangiumDocument<Configuration>;
        assemblyDocument?: LangiumDocument<Assembly>;
        linkBaseDocument?: LangiumDocument<LinkBase>;
        scheduleDocument?: LangiumDocument<Schedule>;
    } = {};

    if (input.assemblyDoc) {
        result.assemblyDocument = await parseAssembly(input.assemblyDoc, {
            documentUri: URI.file(path.join(tempDir, 'src', 'demo-anchor.xsmpasb')).toString(),
        });
        documents.push(result.assemblyDocument);
    }

    if (input.configuration) {
        result.configurationDocument = await parseConfiguration(input.configuration, {
            documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmpcfg')).toString(),
        });
        documents.push(result.configurationDocument);
    }

    if (input.assembly) {
        result.assemblyDocument = await parseAssembly(input.assembly, {
            documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmpasb')).toString(),
        });
        documents.push(result.assemblyDocument);
    }

    if (input.linkBase) {
        result.linkBaseDocument = await parseLinkBase(input.linkBase, {
            documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmplnk')).toString(),
        });
        documents.push(result.linkBaseDocument);
    }

    if (input.schedule) {
        result.scheduleDocument = await parseSchedule(input.schedule, {
            documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmpsed')).toString(),
        });
        documents.push(result.scheduleDocument);
    }

    await services.shared.workspace.DocumentBuilder.build(documents, { validation: false });

    return result;
}

async function getCompletionItems(
    provider: CompletionProvider,
    document: LangiumDocument<AstNode> | undefined,
    offset: number,
): Promise<CompletionItem[]> {
    const completionDocument = expectDocument(document);
    const completion = await provider.getCompletion(completionDocument, {
        textDocument: { uri: completionDocument.textDocument.uri },
        position: completionDocument.textDocument.positionAt(offset),
    });
    return completion?.items ?? [];
}

function expectDocument<T extends AstNode>(document: LangiumDocument<T> | undefined): LangiumDocument<T> {
    expect(document).toBeDefined();
    return document as LangiumDocument<T>;
}

function extractCursor(text: string): { text: string; cursor: number } {
    const cursor = text.indexOf('@@');
    if (cursor < 0) {
        throw new Error('Missing cursor marker.');
    }
    return {
        text: text.replace('@@', ''),
        cursor,
    };
}

function removeMarkers(text: string, markers: string[]): { text: string } {
    let result = text;
    for (const marker of markers) {
        result = result.replace(marker, '');
    }
    return { text: result };
}

function labels(items: CompletionItem[]): string[] {
    return items.map(item => item.label);
}

function findSnippetItem(items: CompletionItem[], label: string): CompletionItem | undefined {
    return items.find(item => item.label === label && item.insertTextFormat === InsertTextFormat.Snippet);
}
