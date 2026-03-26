import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { parseHelper, type ParseHelperOptions } from 'langium/test';
import { createXsmpServices } from '../../src/language/xsmp-module.js';
import { LinkBase, isLinkBase } from '../../src/language/generated/ast.js';

let services: ReturnType<typeof createXsmpServices>;
let parse: ReturnType<typeof parseHelper<LinkBase>>;
let document: LangiumDocument<LinkBase> | undefined;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    const doParse = parseHelper<LinkBase>(services.xsmplnk);
    parse = (input: string, options?: ParseHelperOptions) => doParse(input, { validation: true, ...options });

    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

describe('Validating Xsmplnk', () => {

    test('check empty link base', async () => {
        document = await parse(`
            link LinkBase
        `, { documentUri: 'empty.xsmplnk' });

        expect(getMessages(document)).toContain('A Link Base shall contain at least one Component Link Base.');
    });

    test('check component link base without link', async () => {
        document = await parse(`
            link LinkBase

            Comp
            {
            }
        `, { documentUri: 'component.xsmplnk' });

        expect(getMessages(document)).toContain('A Component Link Base shall contain at least one Link.');
    });
});

function getMessages(document: LangiumDocument<LinkBase>): string[] {
    expect(document.parseResult.parserErrors).toHaveLength(0);
    expect(document.parseResult.value).toBeDefined();
    expect(isLinkBase(document.parseResult.value)).toBe(true);
    return document.diagnostics?.map(diagnostic => diagnostic.message) ?? [];
}
