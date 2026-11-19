import { afterEach, beforeAll, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';

const services = createXsmpServices(EmptyFileSystem);
const parse = parseHelper(services.xsmpcat);
const documents: LangiumDocument[] = [];
beforeAll(async () => services.shared.workspace.WorkspaceManager.initializeWorkspace([]));
afterEach(async () => clearDocuments(services.shared, documents.splice(0)));

async function validate(declarations: string, kind = 'model') {
    const document = await parse(`
        catalogue Properties namespace properties {
            /** @uuid 81000000-0000-4000-8000-000000000101 */
            public ${kind} Probe { ${declarations} }
        }
    `, { validation: true });
    documents.push(document);
    expect(document.parseResult.parserErrors).toEqual([]);
    return document;
}

test.each(['', 'readOnly', 'readWrite', 'writeOnly'])('rejects attached pointer accessors with %j access without a generator profile', async access => {
    const document = await validate(`field Int32 storage @ByPointer ${access} property Int32 value -> storage`);
    const errors = (document.diagnostics ?? []).filter(diagnostic => diagnostic.severity === 1);
    expect(errors.map(diagnostic => diagnostic.message)).toEqual(['ByPointer is not supported for a Property with an attached field.']);
    expect(document.textDocument.getText(errors[0].range)).toBe('storage');
});

test.each(['', 'readOnly', 'readWrite'])('rejects a mutable reference from a const getter with %j access', async access => {
    const document = await validate(`field Int32 storage @ByReference @ConstGetter ${access} property Int32 value -> storage`);
    const errors = (document.diagnostics ?? []).filter(diagnostic => diagnostic.severity === 1);
    expect(errors.map(diagnostic => diagnostic.message)).toEqual(['A const Property getter cannot return a non-const reference to a non-mutable, non-static attached field.']);
    expect(document.textDocument.getText(errors[0].range)).toBe('storage');
});

test.each(['model', 'class'])('preserves compatible property modes in a %s', async kind => {
    const document = await validate(`
        field Int32 storage
        @Mutable field Int32 mutableStorage
        @Static field Int32 staticStorage
        @ByPointer property Int32 unattached
        @ByPointer(false) property Int32 value -> storage
        @ByReference property Int32 reference -> storage
        @ConstGetter @ByReference @Const readOnly property Int32 constReference -> storage
        @ConstGetter @ByReference property Int32 mutableReference -> mutableStorage
        @ConstGetter @ByReference property Int32 staticReference -> staticStorage
        @ConstGetter @ByReference writeOnly property Int32 writeOnlyReference -> storage
        @ConstGetter(false) @ByReference property Int32 nonConstGetter -> storage
        @ConstGetter @ByReference(false) property Int32 byValue -> storage
    `, kind);
    expect((document.diagnostics ?? []).filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
});

test('honors false Const, Mutable and Static annotations', async () => {
    const document = await validate(`
        @Mutable(false) @Static(false) field Int32 storage
        @Const(false) @ConstGetter @ByReference property Int32 value -> storage
    `);
    expect((document.diagnostics ?? []).filter(diagnostic => diagnostic.severity === 1).map(diagnostic => diagnostic.message))
        .toEqual(['A const Property getter cannot return a non-const reference to a non-mutable, non-static attached field.']);
});
