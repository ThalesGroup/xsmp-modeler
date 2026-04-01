import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { clearDocuments, parseHelper, type ParseHelperOptions } from 'langium/test';
import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { DiagnosticSeverity } from 'vscode-languageserver-types';
import { createXsmpServices } from 'xsmp';
import { Assembly, Catalogue, Configuration, Project, isConfiguration } from 'xsmp/ast-partial';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { rebuildTestDocuments } from '../test-services.js';

let services: ReturnType<typeof createXsmpServices>;
let parseProject: ReturnType<typeof parseHelper<Project>>;
let parseCatalogue: ReturnType<typeof parseHelper<Catalogue>>;
let parseConfiguration: ReturnType<typeof parseHelper<Configuration>>;
let parseAssembly: ReturnType<typeof parseHelper<Assembly>>;
const documents: LangiumDocument[] = [];
const tempDirs: string[] = [];

const catalogueSource = `catalogue DemoTypes

namespace demo
{
    public array IntPair = Smp.Int32[2]
    @SimpleArray
    public array SimpleIntQuad = Smp.Int32[4]
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
        field SimpleIntQuad simpleValues
        field Counters state
        field Smp.Bool flag
        field Smp.Float64 ratio
        container Child child
    }
}
`;

const assemblySource = `assembly <Lane = "Ops"> DemoAsm
Root: demo.Root
{
    child += Child{Lane}: demo.Child
}
`;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parseProject = parseHelper<Project>(services.xsmpproject);
    parseCatalogue = parseHelper<Catalogue>(services.xsmpcat);
    parseAssembly = parseHelper<Assembly>(services.xsmpasb);
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
}
`);

        expect(getMessages(document)).toEqual([]);
    });

    test('rejects duplicate document names across document kinds', async () => {
        const document = await parseInProject(`configuration DemoAsm
/Root: demo.Root
{
}
`);

        expect(getMessages(document)).toContain('Duplicated Document name.');
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
            'A safe Component Configuration inside a Component-backed context shall declare an explicit context.',
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

    test('inherits the effective component in nested component configurations with an explicit context', async () => {
        const document = await parseInProject(`configuration Demo
/Root: demo.Root
{
    ShadowChild: demo.Child
    {
        value = 2
    }
}
`);

        expect(getMessages(document)).toEqual([]);
    });

    test('allows explicit nested component contexts inside a component-backed configuration without resolving a container', async () => {
        const document = await parseInProject(`configuration Demo
/Root: demo.Root
{
    ShadowChild: demo.Child
    {
        value = 2i32
    }
}
`);

        expect(getMessages(document)).toEqual([]);
    });

    test('rejects safe nested component configurations without an explicit context inside a component-backed configuration', async () => {
        const document = await parseInProject(`configuration Demo
/Root: demo.Root
{
    child
    {
        value = 2i32
    }
}
`);

        expect(getMessages(document)).toEqual([
            'A safe Component Configuration inside a Component-backed context shall declare an explicit context.',
        ]);
    });

    test('allows safe configuration usage paths inside a component-backed configuration', async () => {
        const document = await parseInProject(`configuration Demo
/Root: demo.Root
{
    include Other at child
}
`);

        expect(getMessages(document)).toEqual([]);
    });

    test('accepts an assembly context and resolves inherited template parameters in paths', async () => {
        const document = await parseInProject(`configuration Demo
/Root: DemoAsm
{
    flag = true
    Child{Lane}
    {
        value = 2i32
    }
}
`);

        expect(getMessages(document)).toEqual([]);
    });

    test('rejects explicit nested contexts inside an assembly-backed configuration when the path is safe', async () => {
        const document = await parseInProject(`configuration Demo
/Root: DemoAsm
{
    Child{Lane}: demo.Child
    {
        value = 2i32
    }
}
`);

        expect(getMessages(document)).toEqual([
            'A safe Component Configuration inside an Assembly-backed context shall not declare an explicit context.',
        ]);
    });

    test('allows explicit nested contexts inside an assembly-backed configuration when the path is unsafe', async () => {
        const document = await parseInProject(`configuration Demo
/Root: DemoAsm
{
    unsafe ShadowChild: demo.Child
    {
        value = 2i32
    }
}
`);

        expect(getMessages(document)).toEqual([]);
    });

    test('warns when unsafe is useless on a nested component configuration with an explicit component context', async () => {
        const document = await parseInProject(`configuration Demo
/Root: demo.Root
{
    unsafe ShadowChild: demo.Child
    {
        value = 2i32
    }
}
`);

        expect(getDiagnostics(document).map(diagnostic => [diagnostic.severity, diagnostic.message])).toEqual([
            [DiagnosticSeverity.Warning, 'The `unsafe` modifier is unnecessary when a nested Component Configuration already declares an explicit Component context.'],
        ]);
    });

    test('warns when unsafe is useless on a configuration usage inside a component-backed context', async () => {
        const document = await parseInProject(`configuration Demo
/Root: demo.Root
{
    include Other at unsafe child
}
`);

        expect(getDiagnostics(document).map(diagnostic => [diagnostic.severity, diagnostic.message])).toEqual([
            [DiagnosticSeverity.Warning, 'The `unsafe` modifier is unnecessary for a Configuration Usage inside a Component-backed context.'],
        ]);
    });

    test('accepts StartIndex for simple arrays in ECSS_SMP_2025 and rejects unsupported cases', async () => {
        const valid2025 = await parseInProject(`configuration DemoStartIndexOk
/Root: demo.Root
{
    simpleValues = [1: 2, 3]
}
`);
        expect(getMessages(valid2025)).toEqual([]);

        const invalid2025 = await parseInProject(`configuration DemoStartIndexInvalid2025
/Root: demo.Root
{
    state = {
        values = [1: 2]
    }
}
`);
        expect(getMessages(invalid2025)).toEqual([
            'StartIndex is only allowed for SimpleArray values.',
        ]);

        const invalid2020 = await parseInProject(`configuration DemoStartIndexInvalid2020
/Root: demo.Root
{
    simpleValues = [1: 2, 3]
}
`, 'ECSS_SMP_2020');
        expect(getMessages(invalid2020)).toEqual([
            'StartIndex is only available in ECSS_SMP_2025.',
        ]);
    });

    test('infers types for positional structure and array values', async () => {
        const document = await parseInProject(`configuration Demo
/Root: demo.Root
{
    state = {
        1,
        true,
        [1, 2]
    }
}
`);

        expect(getMessages(document)).toEqual([]);
    });

    test('reports array overflow, duplicate structure fields, and excess positional structure values', async () => {
        const document = await parseInProject(`configuration Demo
/Root: demo.Root
{
    simpleValues = [2: 7, 8, 9]
    state = {
        count = 1i32,
        count = 2i32,
        true,
        [1i32, 2i32],
        false
    }
}
`);

        expect(getMessages(document)).toEqual(expect.arrayContaining([
            'The array value shall not exceed 4 item(s) when StartIndex is applied.',
            "The structure field 'count' shall not be initialized more than once.",
            'The structure value shall not contain more values than the fields of demo.Counters.',
        ]));
    });

    test('rejects non-collection values for typed array and structure fields', async () => {
        const document = await parseInProject(`configuration Demo
/Root: demo.Root
{
    simpleValues = true
    state = false
}
`);

        expect(getMessages(document)).toEqual(expect.arrayContaining([
            'The value shall be compatible with type demo.SimpleIntQuad.',
            'The value shall be compatible with type demo.Counters.',
        ]));
    });

    test('resolves include paths from an assembly context and reports missing placeholders', async () => {
        const valid = await parseInProject(`configuration DemoIncludeOk
/Root: DemoAsm
{
    include Other at Child{Lane}
}
`);
        expect(getMessages(valid)).toEqual([]);

        const invalid = await parseInProject(`configuration DemoIncludeInvalid
/Root: DemoAsm
{
    include Other at Child{Missing}
}
`);
        expect(getMessages(invalid)).toEqual([
            "The placeholder '{Missing}' shall resolve to a Template Argument of the enclosing Assembly context.",
        ]);
    });

    test('refreshes cached configuration path resolutions after the build reaches linked documents', async () => {
        const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmpcfg-validating-'));
        tempDirs.push(tempDir);
        const documentFactory = services.shared.workspace.LangiumDocumentFactory;
        const projectDocument = documentFactory.fromString<Project>(
            `project "Demo" using "ECSS_SMP_2025"
source "src"
`,
            URI.file(path.join(tempDir, 'xsmp.project'))
        );
        const catalogueDocument = documentFactory.fromString<Catalogue>(catalogueSource, URI.file(path.join(tempDir, 'src', 'demo.xsmpcat')));
        const assemblyDocument = documentFactory.fromString<Assembly>(assemblySource, URI.file(path.join(tempDir, 'src', 'demo.xsmpasb')));
        const otherConfigurationDocument = documentFactory.fromString<Configuration>(`configuration Other
/Other
{
}
`, URI.file(path.join(tempDir, 'src', 'other.xsmpcfg')));
        const configurationDocument = documentFactory.fromString<Configuration>(`configuration Demo
/Root: demo.Root
{
    flag = true
}
`, URI.file(path.join(tempDir, 'src', 'demo.xsmpcfg')));

        services.shared.workspace.LangiumDocuments.addDocument(projectDocument);
        services.shared.workspace.LangiumDocuments.addDocument(catalogueDocument);
        services.shared.workspace.LangiumDocuments.addDocument(assemblyDocument);
        services.shared.workspace.LangiumDocuments.addDocument(otherConfigurationDocument);
        services.shared.workspace.LangiumDocuments.addDocument(configurationDocument);

        documents.push(projectDocument, catalogueDocument, assemblyDocument, otherConfigurationDocument, configurationDocument);
        expect(projectDocument.parseResult.parserErrors).toHaveLength(0);
        expect(catalogueDocument.parseResult.parserErrors).toHaveLength(0);
        expect(assemblyDocument.parseResult.parserErrors).toHaveLength(0);
        expect(otherConfigurationDocument.parseResult.parserErrors).toHaveLength(0);
        expect(configurationDocument.parseResult.parserErrors).toHaveLength(0);

        const configuration = configurationDocument.parseResult.value;
        expect(configuration.$type).toBe('Configuration');
        const rootConfiguration = configuration.elements[0];
        expect(rootConfiguration?.$type).toBe('ComponentConfiguration');
        if (rootConfiguration?.$type !== 'ComponentConfiguration') {
            throw new Error('Expected a root component configuration.');
        }

        const beforeBuild = services.shared.CfgPathResolver.getConfigurationComponentContext(rootConfiguration);
        expect(beforeBuild.component).toBeUndefined();

        await services.shared.workspace.DocumentBuilder.build(
            [projectDocument, catalogueDocument, assemblyDocument, otherConfigurationDocument, configurationDocument],
            { validation: true }
        );

        const afterBuild = services.shared.CfgPathResolver.getConfigurationComponentContext(rootConfiguration);
        expect(afterBuild.component?.name).toBe('Root');
        expect(getMessages(configurationDocument)).toEqual([]);
    });
});

async function parseInProject(source: string, standard: 'ECSS_SMP_2020' | 'ECSS_SMP_2025' = 'ECSS_SMP_2025'): Promise<LangiumDocument<Configuration>> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmpcfg-validating-'));
    tempDirs.push(tempDir);

    const projectDocument = await parseProject(
        `project "Demo" using "${standard}"
source "src"
`,
        { documentUri: URI.file(path.join(tempDir, 'xsmp.project')).toString() }
    );
    const catalogueDocument = await parseCatalogue(catalogueSource, {
        documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmpcat')).toString(),
    });
    const assemblyDocument = await parseAssembly(assemblySource, {
        documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmpasb')).toString(),
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

    documents.push(projectDocument, catalogueDocument, assemblyDocument, otherConfigurationDocument, configurationDocument);
    expect(projectDocument.parseResult.parserErrors).toHaveLength(0);
    expect(catalogueDocument.parseResult.parserErrors).toHaveLength(0);
    expect(assemblyDocument.parseResult.parserErrors).toHaveLength(0);
    expect(otherConfigurationDocument.parseResult.parserErrors).toHaveLength(0);
    expect(configurationDocument.parseResult.parserErrors).toHaveLength(0);
    await rebuildTestDocuments(services, [projectDocument, catalogueDocument, assemblyDocument, otherConfigurationDocument, configurationDocument]);

    return configurationDocument;
}

function getMessages(document: LangiumDocument<Configuration>): string[] {
    expect(isConfiguration(document.parseResult.value)).toBe(true);
    return document.diagnostics?.map(diagnostic => diagnostic.message) ?? [];
}

function getDiagnostics(document: LangiumDocument<Configuration>) {
    expect(isConfiguration(document.parseResult.value)).toBe(true);
    return document.diagnostics ?? [];
}
