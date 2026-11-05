import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { createXsmpServices } from '@xsmp/core';
import { createCompletionProbe, labels } from './completion-test-utils.js';

let services: ReturnType<typeof createXsmpServices>;
let getCatalogueCompletion: ReturnType<typeof createCompletionProbe>;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    getCatalogueCompletion = createCompletionProbe(services.xsmpcat);
});

describe('Xsmpcat aggregate completion', () => {
    test.each([
        ['negative length', 'public array A = Smp.Int32[-1]'],
        ['length beyond JavaScript safe integers', 'public array A = Smp.Int32[9007199254740993L]'],
        ['large nested aggregate', 'public array Values = Smp.Int32[100] public array A = Values[100]'],
    ])('omits aggregate defaults with %s', async (_name, declarations) => {
        const cursor = extractCursor(`catalogue LargeDefaults
namespace Smp { public primitive Int32 }
namespace demo
{
    ${declarations}
    public model M { field A value =@@ }
}`);
        const items = await getCompletionItems(cursor.text, cursor.cursor, 'memory:///large-defaults.xsmpcat');
        expect(labels(items).filter(label => label.startsWith('{'))).toEqual([]);
    });

    test.each([
        ['self-referencing array', 'public array A = A[1]'],
        ['mutually referencing arrays', 'public array A = B[1] public array B = A[1]'],
        ['self-referencing structure', 'public struct A { field A self }'],
        ['mutually referencing structures', 'public struct A { field B b } public struct B { field A a }'],
    ])('omits aggregate defaults for a %s', async (_name, declarations) => {
        const cursor = extractCursor(`catalogue CyclicDefaults
namespace demo
{
    ${declarations}
    public model M { field A value =@@ }
}`);
        const items = await getCompletionItems(cursor.text, cursor.cursor, 'memory:///cyclic-defaults.xsmpcat');
        expect(labels(items).filter(label => label.startsWith('{'))).toEqual([]);
    });

    test('completes repeated non-cyclic aggregate types independently', async () => {
        const cursor = extractCursor(`catalogue SharedDefaults
namespace Smp { public primitive Int32 }
namespace demo
{
    public array Values = Smp.Int32[2]
    public struct Pair { field Values first field Values second }
    public model M { field Pair value =@@ }
}`);
        const items = await getCompletionItems(cursor.text, cursor.cursor, 'memory:///shared-defaults.xsmpcat');
        expect(labels(items)[0]).toBe('{.first = {0, 0}, .second = {0, 0}}');
    });

});

async function getCompletionItems(sourceText: string, offset: number, documentUri: string) {
    const { items } = await getCatalogueCompletion({
        sourceText,
        offset,
        parseOptions: { documentUri },
    });
    return items;
}

function extractCursor(text: string): { text: string; cursor: number } {
    const cursor = text.indexOf('@@');
    if (cursor < 0) {
        throw new Error('Missing cursor marker.');
    }
    return {
        text: text.replace('@@', ''),
        cursor,
    };
}
