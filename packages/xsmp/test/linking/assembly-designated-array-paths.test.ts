import { beforeEach, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem, URI } from 'langium';
import { parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast-partial';

let services: ReturnType<typeof createXsmpServices>;
let id = 0;

beforeEach(async () => {
    services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

async function parse(value: string) {
    const root = `/designated-array-paths-${id++}`;
    const project = await parseHelper(services.xsmpproject)('project "Demo" using "ECSS_SMP_2025" source "src"', {
        documentUri: URI.file(`${root}/xsmp.project`).toString(),
    });
    const catalogue = await parseHelper(services.xsmpcat)(`catalogue Demo namespace demo {
        /** @uuid 1436123a-301a-4ab1-ac97-123679609451 */
        public array Values = Smp.Int32[2]
        /** @uuid 2436123a-301a-4ab1-ac97-123679609451 */
        public struct Payload { field Values values field Smp.Int32 number }
        /** @uuid 3436123a-301a-4ab1-ac97-123679609451 */
        public array Payloads = Payload[2]
        /** @uuid 4436123a-301a-4ab1-ac97-123679609451 */
        public struct Wrapper { field Payload payload field Payload other }
        /** @uuid 5436123a-301a-4ab1-ac97-123679609451 */
        public model Root { field Payload payload field Payloads payloads field Wrapper wrapper }
    }`, { documentUri: URI.file(`${root}/src/demo.xsmpcat`).toString() });
    const document = await parseHelper(services.xsmpasb)(`assembly Runtime Root: demo.Root { ${value} }`, {
        documentUri: URI.file(`${root}/src/demo.xsmpasb`).toString(),
    });
    await services.shared.workspace.DocumentBuilder.build([project, catalogue, document], { validation: true });
    for (const source of [project, catalogue, document]) {
        expect(source.parseResult.lexerErrors).toEqual([]);
        expect(source.parseResult.parserErrors).toEqual([]);
    }
    expect(catalogue.diagnostics?.filter(d => d.severity === 1)).toEqual([]);
    return document;
}

test.each([
    'payload = { values[0] = 1i32 }',
    'payload = { values = [1i32] }',
    'payload.values[0] = 1i32',
    'payloads = [{ values[1] = 1i32 }]',
    'wrapper = { payload = { values[1] = 1i32 } }',
    'wrapper = { { values[1] = 1i32 } }',
    'wrapper = { payload.number = 1i32, { values[1] = 1i32 } }',
    'payload = { values[0] = 1i32, 2i32 }',
])('resolves and validates structure paths: %s', async value => {
    const document = await parse(value);
    expect(document.diagnostics?.filter(d => d.severity === 1)).toEqual([]);
    for (const segment of AstUtils.streamAllContents(document.parseResult.value).filter(ast.isConcretePathNamedSegment)) {
        const text = segment.reference?.$refText;
        const offset = segment.$cstNode!.offset;
        const definitions = await services.xsmpasb.lsp.DefinitionProvider!.getDefinition(document, {
            textDocument: { uri: document.uri.toString() }, position: document.textDocument.positionAt(offset),
        });
        expect(definitions, text).toHaveLength(1);
        expect(definitions?.[0].targetUri).toContain('demo.xsmpcat');
    }
});

test.each([
    ['payload = { values[2] = 1i32 }', 'out of bounds'],
    ['payload = { values[-1] = 1i32 }', 'shall not be negative'],
    ['payload = { values[99] = [1i32, 2i32] }', 'out of bounds'],
    ['payload = { values[0] = [1i32] }', 'compatible with type Smp.Int32'],
    ['payload = { number[0] = 1i32 }', 'only be applied to array-typed'],
])('rejects invalid designated paths: %s', async (value, message) => {
    const document = await parse(value);
    expect(document.diagnostics?.map(d => d.message).join('\n')).toContain(message);
});

test('retains the explicit unsafe escape hatch', async () => {
    const document = await parse('payload = { unsafe values[99] = [1i32] }');
    expect(document.diagnostics?.filter(d => d.severity === 1)).toEqual([]);
});
