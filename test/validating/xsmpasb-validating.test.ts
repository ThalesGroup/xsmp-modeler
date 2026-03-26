import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { clearDocuments, parseHelper, type ParseHelperOptions } from 'langium/test';
import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { createXsmpServices } from '../../src/language/xsmp-module.js';
import { Assembly, Catalogue, Project, isAssembly } from '../../src/language/generated/ast-partial.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let services: ReturnType<typeof createXsmpServices>;
let parseProject: ReturnType<typeof parseHelper<Project>>;
let parseCatalogue: ReturnType<typeof parseHelper<Catalogue>>;
let parseAssembly: ReturnType<typeof parseHelper<Assembly>>;
const documents: LangiumDocument[] = [];
const tempDirs: string[] = [];

const catalogueSource = `catalogue Demo

namespace demo
{
    public event FlagEvent extends Smp.Bool

    public model Child
    {
        field Smp.Int32 count
        input field Smp.Int32 inValue
        output field Smp.Int32 outValue

        eventsink demo.FlagEvent inbound
        eventsource demo.FlagEvent outbound
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

    public model System
    {
        container Root bus = demo.Root
    }
}
`;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parseProject = parseHelper<Project>(services.xsmpproject);
    parseCatalogue = parseHelper<Catalogue>(services.xsmpcat);
    const doParseAssembly = parseHelper<Assembly>(services.xsmpasb);
    parseAssembly = (input: string, options?: ParseHelperOptions) => doParseAssembly(input, { validation: true, ...options });

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

describe('Validating Xsmpasb', () => {
    test('validates typed assembly configuration and link paths and honors unsafe', async () => {
        const document = await parseInProject(`assembly Demo

configure child
{
    count = true
    missing = 1i32
    unsafe missing = 1i32
}

configure enabled
{
}

Root: demo.Root
{
    child += Child: demo.Child
    field link outValue -> child.outValue
    field link unsafe outValue -> unsafe child.outValue
    event link outbound -> child.inbound
    event link outbound -> child.missing
}
`);

        const messages = getMessages(document);
        expect(messages).toEqual(expect.arrayContaining([
            'The value shall be compatible with type Smp.Int32.',
            "The path segment 'missing' shall resolve to a Field of the configured Component.",
            "The path segment 'enabled' shall resolve to a child Model Instance or Assembly Instance.",
            "The path segment 'outValue' shall resolve to a Field marked as Input of the current Component.",
            "The path segment 'missing' shall resolve to a supported member of the current Component.",
        ]));
        expect(messages.some(message => message.includes('unsafe'))).toBe(false);
    });

    test('matches templated child instance names from assembly parameters', async () => {
        const document = await parseInProject(`assembly <Side = "Left"> Demo

configure {Side}Receiver
{
    count = 1i32
}

Root: demo.Root
{
    child += {Side}Receiver: demo.Child
}
`);

        expect(getMessages(document)).toEqual([]);
    });

    test('concretizes nested assembly instance names from template arguments', async () => {
        const document = await parseInProject(`assembly Demo

configure Bus.leaf
{
    count = 1i32
}

Root: demo.System
{
    bus += Bus: NestedAsm<Target = "leaf">
}
`, [
            ['nested.xsmpasb', `assembly <Target = "child"> NestedAsm

NestedRoot: demo.Root
{
    child += {Target}: demo.Child
}
`]
        ]);

        expect(getMessages(document)).toEqual([]);
    });

    test('reports unknown placeholders in assembly paths', async () => {
        const document = await parseInProject(`assembly Demo

configure {Missing}Receiver
{
    count = 1i32
}

Root: demo.Root
{
    child += LeftReceiver: demo.Child
}
`);

        expect(getMessages(document)).toEqual([
            "The placeholder '{Missing}' shall resolve to a Template Argument of the enclosing Assembly.",
        ]);
    });

    test('supports template placeholders followed by suffix text in instance names', async () => {
        const document = await parseInProject(`assembly <Index = 1, Suffix = "Tail"> Demo

configure Unit{Index}_{Suffix}
{
    count = 1i32
}

Root: demo.Root
{
    child += Unit{Index}_{Suffix}: demo.Child
}
`);

        expect(getMessages(document)).toEqual([]);
    });

    test('validates that a sub-instance type matches the selected container', async () => {
        const document = await parseInProject(`assembly Demo

Root: demo.Root
{
    child += Nested: NestedAsm
}
`, [
            ['nested.xsmpasb', `assembly NestedAsm

NestedRoot: demo.System
{
}
`]
        ]);

        expect(getMessages(document)).toEqual([
            'The type of the sub-instance shall be compatible with the selected Container.',
        ]);
    });

    test('reports when a container upper bound is exceeded', async () => {
        const document = await parseInProject(`assembly Demo

Root: demo.Root
{
    child += Left: demo.Child
    child += Right: demo.Child
}
`);

        expect(getMessages(document)).toEqual([
            "The Container 'child' shall not contain more than 1 sub-instance(s).",
        ]);
    });

    test('reports when a reference upper bound is exceeded across nested assembly occurrences', async () => {
        const document = await parseInProject(`assembly Demo

Root: demo.System
{
    bus += Bus: NestedAsm
    interface link Bus : logger -> Bus.Child
}
`, [
            ['nested.xsmpasb', `assembly NestedAsm

NestedRoot: demo.Root
{
    child += Child: demo.Child
    interface link . : logger -> Child
}
`]
        ]);

        expect(getMessages(document)).toEqual([
            "The Reference 'logger' of instance '/Bus' shall not be connected more than 1 time(s).",
        ]);
    });

    test('warns when an assembly template parameter is not used', async () => {
        const document = await parseInProject(`assembly <Used = "Left", Unused = "Right"> Demo

configure {Used}Receiver
{
    count = 1i32
}

Root: demo.Root
{
    child += {Used}Receiver: demo.Child
}
`);

        expect(getMessages(document)).toEqual([
            "The Template Parameter 'Unused' is not used.",
        ]);
    });
});

async function parseInProject(source: string, extraAssemblies: Array<[string, string]> = []): Promise<LangiumDocument<Assembly>> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmpasb-validating-'));
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
    const extraAssemblyDocuments = await Promise.all(extraAssemblies.map(async ([fileName, assemblySource]) => await parseAssembly(assemblySource, {
        documentUri: URI.file(path.join(tempDir, 'src', fileName)).toString(),
    })));
    const assemblyDocument = await parseAssembly(source, {
        documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmpasb')).toString(),
    });

    documents.push(projectDocument, catalogueDocument, ...extraAssemblyDocuments, assemblyDocument);
    expect(projectDocument.parseResult.parserErrors).toHaveLength(0);
    expect(catalogueDocument.parseResult.parserErrors).toHaveLength(0);
    for (const extraAssemblyDocument of extraAssemblyDocuments) {
        expect(extraAssemblyDocument.parseResult.parserErrors).toHaveLength(0);
    }
    expect(assemblyDocument.parseResult.parserErrors).toHaveLength(0);

    return assemblyDocument;
}

function getMessages(document: LangiumDocument<Assembly>): string[] {
    expect(isAssembly(document.parseResult.value)).toBe(true);
    return document.diagnostics?.map(diagnostic => diagnostic.message) ?? [];
}
