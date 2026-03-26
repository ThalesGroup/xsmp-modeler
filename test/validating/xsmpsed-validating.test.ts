import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { clearDocuments, parseHelper, type ParseHelperOptions } from 'langium/test';
import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { createXsmpServices } from '../../src/language/xsmp-module.js';
import { Catalogue, Project, Schedule, isSchedule } from '../../src/language/generated/ast.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let services: ReturnType<typeof createXsmpServices>;
let parseProject: ReturnType<typeof parseHelper<Project>>;
let parseCatalogue: ReturnType<typeof parseHelper<Catalogue>>;
let parseSchedule: ReturnType<typeof parseHelper<Schedule>>;
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
        output field Smp.Int32 outValue
        input field Smp.Int32 inValue
        container Child child = demo.Child

        /** root enabled */
        public property Smp.Bool enabled -> enabledState

        /** root reset */
        public def void reset()

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

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parseProject = parseHelper<Project>(services.xsmpproject);
    parseCatalogue = parseHelper<Catalogue>(services.xsmpcat);
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

task Main: demo.Root
{
    call enabled()
    call unsafe enabled()
    property child = true
    transfer outValue -> child.outValue
    trig missing
    execute Worker at /
}

task Worker: demo.Child
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
            'The root path shall resolve to a Component compatible with task Worker.',
        ]));
        expect(messages.some(message => message.includes('unsafe'))).toBe(false);
    });
});

async function parseInProject(source: string): Promise<LangiumDocument<Schedule>> {
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
    const scheduleDocument = await parseSchedule(source, {
        documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmpsed')).toString(),
    });

    documents.push(projectDocument, catalogueDocument, scheduleDocument);
    expect(projectDocument.parseResult.parserErrors).toHaveLength(0);
    expect(catalogueDocument.parseResult.parserErrors).toHaveLength(0);
    expect(scheduleDocument.parseResult.parserErrors).toHaveLength(0);

    return scheduleDocument;
}

function getMessages(document: LangiumDocument<Schedule>): string[] {
    expect(isSchedule(document.parseResult.value)).toBe(true);
    return document.diagnostics?.map(diagnostic => diagnostic.message) ?? [];
}
