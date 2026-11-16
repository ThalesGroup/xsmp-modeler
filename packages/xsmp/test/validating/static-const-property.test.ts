import { expect, test } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import type { Catalogue } from '@xsmp/core/ast';

async function validate(properties: string) {
    const services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
    const document = await parseHelper<Catalogue>(services.xsmpcat)(`
        catalogue Properties
        namespace properties {
            /** @uuid 81000000-0000-4000-8000-000000000201 */
            public model Probe { ${properties} }
        }
    `, { documentUri: 'static-const-property.xsmpcat', validation: true });
    expect(document.parseResult.parserErrors).toEqual([]);
    return document;
}

test.each(['', 'readOnly', 'readWrite'])('rejects a static const getter with %j access without a generator profile', async access => {
    const document = await validate(`@Static @ConstGetter ${access} property Int32 value`);
    const errors = (document.diagnostics ?? []).filter(diagnostic => diagnostic.severity === 1);
    expect(errors.map(diagnostic => diagnostic.message)).toEqual(['A static Property getter shall not be const.']);
    const range = errors[0].range;
    expect(document.textDocument.getText(range)).toBe('@ConstGetter');
});

test('preserves instance const getters, static non-const getters and write-only properties', async () => {
    const document = await validate(`
        @ConstGetter property Int32 instance
        @Static(false) @ConstGetter property Int32 explicitInstance
        @Static @ConstGetter(false) property Int32 shared
        @Static @ConstGetter writeOnly property Int32 writeOnlyValue
    `);
    expect((document.diagnostics ?? []).filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
});
