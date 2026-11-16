import { afterEach, beforeAll, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';

let services: ReturnType<typeof createXsmpServices>;
const documents: LangiumDocument[] = [];

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

afterEach(async () => clearDocuments(services.shared, documents.splice(0)));

test.each([
    ['field Empty value = {}', undefined],
    ['field Empty value', undefined],
    ['field Empty value = {1}', 'The array type expect 0 element(s), got 1 element(s).'],
    ['input field Empty value = {1, 2}', 'The array type expect 0 element(s), got 2 element(s).'],
    ['output field Empty value = {1}', 'The array type expect 0 element(s), got 1 element(s).'],
    ['field Nested value = {{}}', undefined],
    ['field Nested value = {{1}}', 'The array type expect 0 element(s), got 1 element(s).'],
    ['field One value = {1}', undefined],
    ['field One value = {1, 2}', 'The array type expect 1 element(s), got 2 element(s).'],
])('validates %s', async (member, error) => {
    const document = await parseHelper(services.xsmpcat)(`catalogue EmptyArrays namespace arrays {
        /** @uuid b17b5a87-6099-47d2-b055-7a6acda66301 */
        public array Empty = Int32[0]
        /** @uuid b17b5a87-6099-47d2-b055-7a6acda66302 */
        public array Nested = Empty[1]
        /** @uuid b17b5a87-6099-47d2-b055-7a6acda66303 */
        public array One = Int32[1]
        /** @uuid b17b5a87-6099-47d2-b055-7a6acda66304 */
        public model Probe { ${member} }
    }`, { validation: true });
    documents.push(document);
    expect(document.parseResult.lexerErrors).toEqual([]);
    expect(document.parseResult.parserErrors).toEqual([]);
    expect(document.diagnostics?.filter(diagnostic => diagnostic.severity === 1).map(diagnostic => diagnostic.message)).toEqual(error ? [error] : []);
});
