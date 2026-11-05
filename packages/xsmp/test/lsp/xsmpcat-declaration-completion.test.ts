import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import type { Catalogue } from '@xsmp/core/ast';
import { createXsmpServices } from '@xsmp/core';
import { createCompletionProbe, findSnippetItem } from './completion-test-utils.js';

let services: ReturnType<typeof createXsmpServices>;
let getCatalogueCompletion: ReturnType<typeof createCompletionProbe>;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    getCatalogueCompletion = createCompletionProbe(services.xsmpcat);
});

describe('Xsmpcat declaration completion', () => {
    test.each(['Container', 'Reference'])('inserts a syntactically valid %s declaration', async keyword => {
        const source = `catalogue Snippets
namespace demo
{
    public interface Face {}
    public model Child {}
    public model Root
    {
        @@
    }
}`;
        const cursor = extractCursor(source);
        const items = await getCompletionItems(cursor.text, cursor.cursor, `memory:///declaration-${keyword}.xsmpcat`);
        const snippet = findSnippetItem(items, keyword);
        expect(snippet).toBeDefined();
        const expanded = snippet!.insertText!
            .replace(/\$\{\d+\|([^|]*)\|\}/g, (_, choices: string) => choices.split(',')[0])
            .replace(/\$\{\d+:([^}]*)\}/g, '$1')
            .replace(/\$\d+/g, '');
        const document = await parseHelper<Catalogue>(services.xsmpcat)(source.replace('@@', expanded), {
            documentUri: `memory:///expanded-${keyword}.xsmpcat`,
        });
        try {
            expect(document.parseResult.parserErrors).toHaveLength(0);
            expect(expanded).toMatch(/\* name$/);
        } finally {
            await clearDocuments(services.shared, [document]);
        }
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
