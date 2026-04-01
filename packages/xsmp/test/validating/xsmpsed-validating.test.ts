import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { clearDocuments, parseHelper, type ParseHelperOptions } from 'langium/test';
import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { createXsmpServices } from 'xsmp';
import { Assembly, Catalogue, Project, Schedule, isSchedule } from 'xsmp/ast-partial';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { rebuildTestDocuments } from '../test-services.js';

let services: ReturnType<typeof createXsmpServices>;
let parseProject: ReturnType<typeof parseHelper<Project>>;
let parseCatalogue: ReturnType<typeof parseHelper<Catalogue>>;
let parseSchedule: ReturnType<typeof parseHelper<Schedule>>;
let parseAssembly: ReturnType<typeof parseHelper<Assembly>>;
const documents: LangiumDocument[] = [];
const tempDirs: string[] = [];

const catalogueSource = `catalogue DemoTypes

namespace demo
{
    public event FlagEvent extends Smp.Bool

    public model Child
    {
        input field Smp.Int32 inValue
        output field Smp.Int32 outValue

        /** child reset */
        public def void reset()

        /** child trigger */
        entrypoint step
        {
            in inValue
            out outValue
        }

        eventsink demo.FlagEvent inbound
        eventsource demo.FlagEvent outbound
    }

    public model Root
    {
        field Smp.Bool enabledState
        field Smp.Int32 countState
        output field Smp.Int32 outValue
        input field Smp.Int32 inValue
        container Child child = demo.Child

        /** root enabled */
        public property Smp.Bool enabled -> enabledState
        /** root count */
        public property Smp.Int32 count -> countState

        /** root reset */
        public def void reset()
        /** root apply */
        public def void apply(in Smp.Int32 nextCount, in Smp.Float64 nextRatio)

        /** root trigger */
        entrypoint step
        {
            in inValue
            out outValue
        }

        eventsink demo.FlagEvent inbound
        eventsource demo.FlagEvent outbound
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
    const doParseSchedule = parseHelper<Schedule>(services.xsmpsed);
    parseSchedule = (input: string, options?: ParseHelperOptions) => doParseSchedule(input, { validation: true, ...options });

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

describe('Validating Xsmpsed', () => {
    test('validates typed schedule paths, execute compatibility and honors unsafe', async () => {
        const document = await parseInProject(`schedule Demo

task Main on demo.Root
{
    call enabled()
    call unsafe enabled()
    property child = true
    transfer outValue -> Child.outValue
    trig missing
    execute Worker at /
}

task Worker on demo.Child
{
    call reset()
}

event Main mission "PT1S"
`);

        const messages = getMessages(document);
        expect(messages).toEqual(expect.arrayContaining([
            "The path segment 'enabled' shall resolve to a supported member of the current Component.",
            "The path segment 'child' shall resolve to a supported member of the current Component.",
            "The path segment 'outValue' shall resolve to a Field marked as Input of the current Component.",
            "The path segment 'missing' shall resolve to a supported member of the current Component.",
            'The root path shall resolve to a Component compatible with the execution context of task Worker.',
        ]));
        expect(messages.some(message => message.includes('unsafe'))).toBe(false);
    });

    test('resolves templated schedule paths with schedule defaults', async () => {
        const document = await parseInProject(`schedule <Target = "Child"> Demo

task Main on demo.Root
{
    call {Target}.reset()
}
`);

        expect(getMessages(document)).toEqual([]);
    });

    test('rejects duplicate document names across document kinds', async () => {
        const document = await parseInProject(`schedule <Root = "root"> DemoAsm

task Main on DemoAsm
{
    call Child{Lane}.reset()
}
`, assemblySource);

        expect(getMessages(document)).toContain('Duplicated Document name.');
    });

    test('allows unsuffixed numeric values when the safe resolved target type is known', async () => {
        const document = await parseInProject(`schedule <Root = "root"> Demo

task Main on demo.Root
{
    property count = 2
    call apply(nextCount = 3, nextRatio = 1.5)
}
`);

        expect(getMessages(document)).toEqual([]);
    });

    test('reports unknown placeholders and invalid expanded schedule path segments', async () => {
        const unknownPlaceholder = await parseInProject(`schedule <Root = "child"> DemoMissingPlaceholder

task Main on demo.Root
{
    call {Missing}.reset()
}
`);
        expect(getMessages(unknownPlaceholder)).toEqual([
            "The placeholder '{Missing}' shall resolve to a Template Argument of the enclosing Schedule.",
        ]);

        const invalidExpansion = await parseInProject(`schedule <Target = "1bad"> DemoInvalidExpansion

task Main on demo.Root
{
    call {Target}.reset()
}
`);
        expect(getMessages(invalidExpansion)).toEqual([
            "The expanded path segment '1bad' is not valid for SMP Level 2.",
        ]);
    });

    test('warns when a schedule template parameter is not used', async () => {
        const document = await parseInProject(`schedule <Target = "Child", Unused = 7> Demo

task Main on demo.Root
{
    call {Target}.reset()
}
`);

        expect(getMessages(document)).toEqual([
            "The Template Parameter 'Unused' is not used.",
        ]);
    });

    test('accepts assembly execution contexts and resolves inherited template parameters in paths', async () => {
        const document = await parseInProject(`schedule <Root = "root"> Demo

task Main on DemoAsm
{
    call Child{Lane}.reset()
    trig Child{Lane}.step
}
`, assemblySource);

        expect(getMessages(document)).toEqual([]);
    });

    test('requires a root String8 parameter even when the schedule only uses task-scoped paths', async () => {
        const document = await parseInProject(`schedule Demo

task Main on demo.Root
{
    call reset()
}
`);

        expect(getMessages(document)).toEqual([
            'A Schedule shall declare at least one String8 Template Argument for the root path.',
        ]);
    });

    test('rejects parent traversal in schedule paths', async () => {
        const document = await parseInProject(`schedule <Root = "root"> Demo

task Main on demo.Root
{
    call ../child.reset()
    execute Worker at ../child
}

task Worker on demo.Child
{
    call reset()
}
`);

        expect(getMessages(document).filter(message => message === 'Paths shall not contain \'..\'.')).toHaveLength(2);
    });

    test('requires explicit schedule template values and unique names', async () => {
        const document = await parseInProject(`schedule <Root: string, Root = "root", Lane: int32> Demo

task Main on demo.Root
{
}
`);

        const messages = getMessages(document);
        expect(messages).toEqual(expect.arrayContaining([
            'Duplicated template argument name.',
            'A Template Argument shall have a Value feature.',
        ]));
        expect(messages.filter(message => message === 'A Template Argument shall have a Value feature.')).toHaveLength(2);
    });

    test('validates duplicate and unknown schedule operation parameters', async () => {
        const document = await parseInProject(`schedule <Root = "root"> Demo

task Main on demo.Root
{
    call apply(nextCount = 1i32, nextCount = 2i32, missing = 3i32)
}
`);

        expect(getMessages(document)).toEqual(expect.arrayContaining([
            'Duplicated parameter name.',
            "The parameter 'missing' shall resolve to a Parameter of operation apply.",
        ]));
    });
});

async function parseInProject(source: string, assemblyText?: string): Promise<LangiumDocument<Schedule>> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmpsed-validating-'));
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
    const assemblyDocument = assemblyText
        ? await parseAssembly(assemblyText, {
            documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmpasb')).toString(),
        })
        : undefined;
    const scheduleDocument = await parseSchedule(source, {
        documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmpsed')).toString(),
    });

    documents.push(projectDocument, catalogueDocument, ...(assemblyDocument ? [assemblyDocument] : []), scheduleDocument);
    expect(projectDocument.parseResult.parserErrors).toHaveLength(0);
    expect(catalogueDocument.parseResult.parserErrors).toHaveLength(0);
    expect(assemblyDocument?.parseResult.parserErrors ?? []).toHaveLength(0);
    expect(scheduleDocument.parseResult.parserErrors).toHaveLength(0);
    await rebuildTestDocuments(services, [projectDocument, catalogueDocument, ...(assemblyDocument ? [assemblyDocument] : []), scheduleDocument]);

    return scheduleDocument;
}

function getMessages(document: LangiumDocument<Schedule>): string[] {
    expect(isSchedule(document.parseResult.value)).toBe(true);
    return document.diagnostics?.map(diagnostic => diagnostic.message) ?? [];
}
