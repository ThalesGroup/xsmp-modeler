import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { clearDocuments, parseHelper, type ParseHelperOptions } from 'langium/test';
import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { createXsmpServices } from '../../src/language/xsmp-module.js';
import { Assembly, Catalogue, LinkBase, Project, isLinkBase } from '../../src/language/generated/ast-partial.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let services: ReturnType<typeof createXsmpServices>;
let parseProject: ReturnType<typeof parseHelper<Project>>;
let parseCatalogue: ReturnType<typeof parseHelper<Catalogue>>;
let parseAssembly: ReturnType<typeof parseHelper<Assembly>>;
let parseLinkBase: ReturnType<typeof parseHelper<LinkBase>>;
const documents: LangiumDocument[] = [];
const tempDirs: string[] = [];

const catalogueSource = `catalogue Demo

namespace demo
{
    public event FlagEvent extends Smp.Bool

    public model Child
    {
        input field Smp.Int32 inValue
        output field Smp.Int32 outValue

        eventsink demo.FlagEvent inbound
        eventsource demo.FlagEvent outbound
        reference Smp.IComponent backLogger
    }

    public model Root
    {
        field Smp.Bool enabledState
        output field Smp.Int32 outValue
        input field Smp.Int32 inValue
        container Child child = demo.Child
        reference Smp.IComponent logger

        public property Smp.Bool enabled -> enabledState

        eventsink demo.FlagEvent inbound
        eventsource demo.FlagEvent outbound
    }
}
`;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parseProject = parseHelper<Project>(services.xsmpproject);
    parseCatalogue = parseHelper<Catalogue>(services.xsmpcat);
    parseAssembly = parseHelper<Assembly>(services.xsmpasb);
    const doParseLinkBase = parseHelper<LinkBase>(services.xsmplnk);
    parseLinkBase = (input: string, options?: ParseHelperOptions) => doParseLinkBase(input, { validation: true, ...options });

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

describe('Validating Xsmplnk', () => {
    test('validates typed component link bases and link endpoints and honors unsafe', async () => {
        const document = await parseInProject(`link Demo for DemoAsm

/
{
    field link outValue -> child.outValue
    field link unsafe outValue -> unsafe child.outValue
    event link outbound -> child.inbound

    enabled
    {
        event link outbound -> inbound
    }
}
`, `assembly DemoAsm

Root: demo.Root
{
    child += Leaf: demo.Child
}
`);

        const messages = getMessages(document);
        expect(messages).toEqual(expect.arrayContaining([
            "The path segment 'outValue' shall resolve to a Field marked as Input of the current Component.",
            "The path segment 'enabled' shall resolve to a Container or Reference of the current Component.",
        ]));
        expect(messages.some(message => message.includes('unsafe'))).toBe(false);
    });

    test('keeps unanchored link bases in text mode', async () => {
        const document = await parseInProject(`link Demo

Unanchored
{
    field link missing -> missing
}
`);

        expect(getMessages(document)).toEqual([]);
    });

    test('requires an assembly anchor for templated link base paths', async () => {
        const document = await parseInProject(`link Demo

/
{
    field link outValue -> {Target}.inValue
}
`);

        expect(getMessages(document)).toEqual([
            'A Link Base using templated paths shall declare an Assembly anchor with \'for <Assembly>\'.',
        ]);
    });

    test('resolves templated link paths with imported assembly defaults', async () => {
        const document = await parseInProject(`link Demo for DemoAsm

/
{
    field link outValue -> {Target}.inValue
}
`, `assembly <Target = "child"> DemoAsm

Root: demo.Root
{
    child += Leaf: demo.Child
}
`);

        expect(getMessages(document)).toEqual([]);
    });

    test('reports unknown placeholders from the anchored assembly', async () => {
        const document = await parseInProject(`link Demo for DemoAsm

/
{
    field link outValue -> {Missing}.inValue
}
`, `assembly <Target = "child"> DemoAsm

Root: demo.Root
{
    child += Leaf: demo.Child
}
`);

        expect(getMessages(document)).toEqual([
            "The placeholder '{Missing}' shall resolve to a Template Argument of the anchored Assembly.",
        ]);
    });

    test('reports when a reference upper bound is exceeded in a link base', async () => {
        const document = await parseInProject(`link Demo for DemoAsm

/
{
    interface link logger -> child:backLogger
    interface link logger -> .
}
`, `assembly DemoAsm

Root: demo.Root
{
    child += Leaf: demo.Child
}
`);

        expect(getMessages(document)).toEqual([
            "The Reference 'logger' of component path '/' shall not be connected more than 1 time(s).",
            "The Reference 'logger' of component path '/' shall not be connected more than 1 time(s).",
        ]);
    });
});

async function parseInProject(source: string, assemblySource?: string): Promise<LangiumDocument<LinkBase>> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmplnk-validating-'));
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
    const assemblyDocument = assemblySource
        ? await parseAssembly(assemblySource, {
            documentUri: URI.file(path.join(tempDir, 'src', 'demoasm.xsmpasb')).toString(),
        })
        : undefined;
    const linkBaseDocument = await parseLinkBase(source, {
        documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmplnk')).toString(),
    });

    documents.push(projectDocument, catalogueDocument, ...(assemblyDocument ? [assemblyDocument] : []), linkBaseDocument);
    expect(projectDocument.parseResult.parserErrors).toHaveLength(0);
    expect(catalogueDocument.parseResult.parserErrors).toHaveLength(0);
    expect(assemblyDocument?.parseResult.parserErrors ?? []).toHaveLength(0);
    expect(linkBaseDocument.parseResult.parserErrors).toHaveLength(0);

    return linkBaseDocument;
}

function getMessages(document: LangiumDocument<LinkBase>): string[] {
    expect(isLinkBase(document.parseResult.value)).toBe(true);
    return document.diagnostics?.map(diagnostic => diagnostic.message) ?? [];
}
