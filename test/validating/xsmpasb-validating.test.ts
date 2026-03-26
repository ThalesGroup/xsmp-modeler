import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { parseHelper, type ParseHelperOptions } from 'langium/test';
import { createXsmpServices } from '../../src/language/xsmp-module.js';
import { Assembly, isAssembly } from '../../src/language/generated/ast.js';

let services: ReturnType<typeof createXsmpServices>;
let parse: ReturnType<typeof parseHelper<Assembly>>;
let document: LangiumDocument<Assembly> | undefined;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    const doParse = parseHelper<Assembly>(services.xsmpasb);
    parse = (input: string, options?: ParseHelperOptions) => doParse(input, { validation: true, ...options });

    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

describe('Validating Xsmpasb', () => {

    test('check validation issues', async () => {
        document = await parse(`
            assembly <_root:string> Test

            configure /Current
            {
            }

            Root: "Impl"
            {
                A += _child: "Impl"
                B += _child: "Impl"
                /state = 1i32
                field link /source -> /target
                call op(a=1i32, a=2i32)
            }
        `, { documentUri: 'test.xsmpasb' });

	        const messages = getMessages(document);
	        expect(messages).toEqual(expect.arrayContaining([
	            'A name shall start with a letter.',
	            'A Template Argument shall have a Value feature.',
	            'InstancePath shall be relative.',
	            'Child Model Instance and Assembly Instance names shall be unique at the same hierarchy level.',
            'Field paths in an Assembly shall be relative to the current component instance.',
            'The Owner Path shall refer to the current Model Instance or one of its children.',
            'The Client Path shall refer to the current Model Instance or one of its children.',
            'Duplicated parameter name.',
        ]));
    });
});

function getMessages(document: LangiumDocument<Assembly>): string[] {
    expect(document.parseResult.parserErrors).toHaveLength(0);
    expect(document.parseResult.value).toBeDefined();
    expect(isAssembly(document.parseResult.value)).toBe(true);
    return document.diagnostics?.map(diagnostic => diagnostic.message) ?? [];
}
