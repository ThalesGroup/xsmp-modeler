import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { parseHelper, type ParseHelperOptions } from 'langium/test';
import { createXsmpServices } from '../../src/language/xsmp-module.js';
import { Schedule, isSchedule } from '../../src/language/generated/ast.js';

let services: ReturnType<typeof createXsmpServices>;
let parse: ReturnType<typeof parseHelper<Schedule>>;
let document: LangiumDocument<Schedule> | undefined;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    const doParse = parseHelper<Schedule>(services.xsmpsed);
    parse = (input: string, options?: ParseHelperOptions) => doParse(input, { validation: true, ...options });

    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

describe('Validating Xsmpsed', () => {

    test('check validation issues', async () => {
        document = await parse(`
            schedule Test epoch "bad-date" mission "bad-start"

            task Main
            {
                trig local.ep
                call rel.op(a=1i32, a=2i32)
            }

            event Main mission "bad-duration" cycle "bad-cycle" repeat -1
            event Main on "BootCompleted" delay "bad-delay"
        `, { documentUri: 'test.xsmpsed' });

        const messages = getMessages(document);
        expect(messages).toEqual(expect.arrayContaining([
            'EpochTime shall be a valid DateTime (e.g: 1970-01-01T00:00:00Z).',
            'MissionStart shall be a valid DateTime (e.g: 1970-01-01T00:00:00Z).',
            'A Schedule using relative paths shall declare at least one String8 Template Argument for the root path.',
            'Duplicated parameter name.',
            'MissionTime shall be a valid Duration (e.g: PT1S).',
            'CycleTime shall be a valid Duration (e.g: PT1S).',
            'RepeatCount shall be a positive number or 0.',
            'Delay shall be a valid Duration (e.g: PT1S).',
        ]));
    });
});

function getMessages(document: LangiumDocument<Schedule>): string[] {
    expect(document.parseResult.parserErrors).toHaveLength(0);
    expect(document.parseResult.value).toBeDefined();
    expect(isSchedule(document.parseResult.value)).toBe(true);
    return document.diagnostics?.map(diagnostic => diagnostic.message) ?? [];
}
