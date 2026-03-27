import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { clearDocuments, parseHelper, type ParseHelperOptions } from 'langium/test';
import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { createXsmpServices } from 'xsmp';
import { Catalogue, Configuration, Project, isConfiguration } from 'xsmp/ast-partial';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { rebuildTestDocuments } from '../test-services.js';

let services: ReturnType<typeof createXsmpServices>;
let parseProject: ReturnType<typeof parseHelper<Project>>;
let parseCatalogue: ReturnType<typeof parseHelper<Catalogue>>;
let parseConfiguration: ReturnType<typeof parseHelper<Configuration>>;
const documents: LangiumDocument[] = [];
const tempDirs: string[] = [];

const catalogueSource = `catalogue Demo

namespace demo
{
    public array IntPair = Smp.Int32[2]
    public integer TinyCounter extends Smp.UInt8 in 1 ... 3
    public float SmallRatio extends Smp.Float32 in 0.0 ..< 2.0

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
        field Smp.UInt8 byteValue
        field TinyCounter tiny
        field SmallRatio smallRatio
        field Counters state
        field Smp.Bool flag
        field Smp.Float64 ratio
        container Child child
    }
}
`;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parseProject = parseHelper<Project>(services.xsmpproject);
    parseCatalogue = parseHelper<Catalogue>(services.xsmpcat);
    const doParseConfiguration = parseHelper<Configuration>(services.xsmpcfg);
    parseConfiguration = (input: string, options?: ParseHelperOptions) => doParseConfiguration(input, { validation: true, ...options });

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

describe('Validating Xsmpcfg', () => {
    test('keeps legacy text mode when no component is defined', async () => {
        const document = await parseInProject(`configuration Legacy
/Root
{
    flag = 1i32
    child
    {
        value = true
    }
}
`);

        expect(getMessages(document)).toEqual([]);
    });

    test('allows unsuffixed numeric values when the safe resolved target type is known', async () => {
        const document = await parseInProject(`configuration Demo
/Root: demo.Root
{
    byteValue = 255
    tiny = 2
    smallRatio = 1.5f32
    ratio = 1.5
    state = {
        count = 1,
        values = [1, 2]
    }
    child
    {
        value = 2
    }
}
`);

        expect(getMessages(document)).toEqual([]);
    });

    test('validates typed field paths and values and honors unsafe paths', async () => {
        const document = await parseInProject(`configuration Demo
/Root: demo.Root
{
    flag = 1i32
    state.unknown = 1i32
    state = {
        count = true,
        missing = 1i32,
        unsafe skipped = 1i32,
        values = [1i32, true]
    }
    flag
    {
        value = 1i32
    }
    include Other at flag
    include Other at unsafe flag
}
`);

        const messages = getMessages(document);
        expect(messages).toEqual(expect.arrayContaining([
            'The value shall be compatible with type Smp.Bool.',
            "The path segment 'unknown' shall resolve to a Field of the current Structure value.",
            "The structure field 'missing' does not exist on type demo.Counters.",
            'The value shall be compatible with type Smp.Int32.',
            "The path segment 'flag' shall resolve to a Container or Reference of the current Component.",
        ]));
        expect(messages.some(message => message.includes('skipped'))).toBe(false);
    });

    test('rejects unsuffixed numeric values outside safe resolved typing', async () => {
        const document = await parseInProject(`configuration Demo
/Root
{
    flag = 1
}
/Typed: demo.Root
{
    unsafe ratio = 1.5
    state = {
        unsafe count = 1
    }
}
`);

        expect(getMessages(document)).toEqual(expect.arrayContaining([
            'An unsuffixed integer value shall only be used when the target type can be deduced from a resolved safe path.',
            'An unsuffixed floating-point value shall only be used when the target type can be deduced from a resolved safe path.',
        ]));
    });

    test('validates primitive and derived numeric ranges', async () => {
        const document = await parseInProject(`configuration Demo
/Root: demo.Root
{
    byteValue = 256
    tiny = 0
    smallRatio = 2.0f32
}
`);

        expect(getMessages(document)).toEqual(expect.arrayContaining([
            'Conversion overflow for type UInt8.',
            'Integral value shall be greater than or equal to 1.',
            'Float value shall be less than 2.',
        ]));
    });

    test('inherits the effective component in nested component configurations', async () => {
        const document = await parseInProject(`configuration Demo
/Root: demo.Root
{
    child
    {
        value = 2i32
    }
}
`);

        expect(getMessages(document)).toEqual([]);
    });
});

async function parseInProject(source: string): Promise<LangiumDocument<Configuration>> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmpcfg-validating-'));
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
    const configurationDocument = await parseConfiguration(source, {
        documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmpcfg')).toString(),
    });

    documents.push(projectDocument, catalogueDocument, otherConfigurationDocument, configurationDocument);
    expect(projectDocument.parseResult.parserErrors).toHaveLength(0);
    expect(catalogueDocument.parseResult.parserErrors).toHaveLength(0);
    expect(otherConfigurationDocument.parseResult.parserErrors).toHaveLength(0);
    expect(configurationDocument.parseResult.parserErrors).toHaveLength(0);
    await rebuildTestDocuments(services, [projectDocument, catalogueDocument, otherConfigurationDocument, configurationDocument]);

    return configurationDocument;
}

function getMessages(document: LangiumDocument<Configuration>): string[] {
    expect(isConfiguration(document.parseResult.value)).toBe(true);
    return document.diagnostics?.map(diagnostic => diagnostic.message) ?? [];
}
