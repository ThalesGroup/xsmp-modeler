import { afterEach, beforeAll, describe, expect, test } from 'vitest';
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

async function validate(declaration: string) {
    await clearDocuments(services.shared, documents.splice(0));
    const document = await parseHelper(services.xsmpcat)(`catalogue Bounds namespace bounds {
        /** @uuid f768a54b-f13d-4f2c-b1cd-eaa810a18101 */
        public model Child {}
        /** @uuid f768a54b-f13d-4f2c-b1cd-eaa810a18102 */
        public interface ChildInterface {}
        /** @uuid f768a54b-f13d-4f2c-b1cd-eaa810a18103 */
        public model Parent { ${declaration} }
    }`, { validation: true });
    documents.push(document);
    expect(document.parseResult.lexerErrors).toEqual([]);
    expect(document.parseResult.parserErrors).toEqual([]);
    return document.diagnostics?.filter(diagnostic => diagnostic.severity === 1).map(diagnostic => diagnostic.message) ?? [];
}

describe.each(['container Child', 'reference ChildInterface'])('%s multiplicities', declaration => {
    test.each([
        ['"bad"', 'String8 cannot be converted to Int64.'],
        ['1.5', 'Float64 cannot be converted to Int64.'],
        ['1 / 0', 'Division by zero.'],
        ['9223372036854775808U', 'UInt64 cannot be converted to Int64.'],
    ])('diagnoses the invalid bound %s', async (bound, message) => {
        expect(await validate(`${declaration}[${bound}] children`)).toEqual([message]);
        expect(await validate(`${declaration}[0 ... ${bound}] children`)).toEqual([message]);
    });

    test('checks both explicit bounds', async () => {
        expect(await validate(`${declaration}["bad" ... 1 / 0] children`)).toEqual([
            'String8 cannot be converted to Int64.',
            'Division by zero.',
        ]);
    });

    test.each(['', '?', '*', '+', '[]', '[*]', '[+]', '[0]', '[1 + 1]', '[1 ... 4]', '[1 ... *]', '[0 ... -1]'])('accepts %s', async suffix => {
        expect(await validate(`${declaration}${suffix} children`)).toEqual([]);
    });

    test.each(['[-1]', '[2 ... 1]', '[0 ... -2]'])('still rejects invalid ranges %s', async suffix => {
        expect(await validate(`${declaration}${suffix} children`)).toHaveLength(1);
    });
});
