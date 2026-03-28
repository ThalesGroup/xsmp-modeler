import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import type { LangiumDocument } from 'langium';
import { EmptyFileSystem } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { CompletionItemKind, InsertTextFormat, type CompletionItem } from 'vscode-languageserver';
import { createXsmpServices } from 'xsmp';
import type { Catalogue } from 'xsmp/ast-partial';

let services: ReturnType<typeof createXsmpServices>;
let parse: ReturnType<typeof parseHelper<Catalogue>>;
let document: LangiumDocument<Catalogue> | undefined;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parse = parseHelper<Catalogue>(services.xsmpcat);
});

afterEach(async () => {
    if (document) {
        await clearDocuments(services.shared, [document]);
        document = undefined;
    }
});

describe('Xsmpcat completion provider', () => {
    test('offers contextual root, namespace and classifier snippets', async () => {
        let cursor = extractCursor('@@');
        document = await parse(cursor.text, { documentUri: 'memory:///demo-root.xsmpcat' });
        let items = await getCompletionItems(document, cursor.cursor);
        expect(labels(items)).toContain('Catalogue');
        expect(labels(items)).not.toContain('catalogue');

        cursor = extractCursor(`catalogue demo
@@
`);
        document = await parse(cursor.text, { documentUri: 'memory:///demo-catalogue.xsmpcat' });
        items = await getCompletionItems(document, cursor.cursor);
        expect(labels(items)).toContain('Namespace');
        expect(labels(items)).not.toContain('namespace');
        expect(findSnippetItem(items, 'Namespace')?.insertText).toContain('demo::foundation');
        expect(findSnippetItem(items, 'Model')?.insertText).toContain('/** @uuid ');
        expect(labels(items)).toContain('Model');

        cursor = extractCursor(`catalogue demo
namespace demo
{
    model M
    {
        @@
    }
}
`);
        document = await parse(cursor.text, { documentUri: 'memory:///demo-model.xsmpcat' });
        items = await getCompletionItems(document, cursor.cursor);
        expect(labels(items)).toContain('Field');
        expect(labels(items)).toContain('Reference');
        expect(labels(items)).not.toContain('field');
        expect(labels(items)).not.toContain('reference');

    });

    test('offers typed attribute value completions', async () => {
        const cursor = extractCursor(`catalogue demo
namespace Smp
{
    public primitive Bool
}
namespace Attribute
{
    public attribute Bool AnAttribute = @@
}
`);
        document = await parse(cursor.text, { documentUri: 'memory:///demo.xsmpcat' });
        const items = await getCompletionItems(document, cursor.cursor);
        expect(labels(items)).toContain('false');
        expect(labels(items)).toContain('true');
        expect(labels(items)).toContain('Default Value');
        expect(labels(items)).toContain('nullptr');
    });

    test('completes attribute types from visible value types', async () => {
        const cursor = extractCursor(`catalogue demo
namespace Smp
{
    public primitive Bool
    public primitive Int32
}
namespace Attribute
{
    public attribute @@
}
`);
        document = await parse(cursor.text, { documentUri: 'memory:///demo.xsmpcat' });
        const items = await getCompletionItems(document, cursor.cursor);
        expect(labels(items)).toContain('Bool');
        expect(labels(items)).toContain('Smp.Bool');
        expect(labels(items)).toContain('Int32');
    });

    test('builds reference and realization snippets from visible reference types', async () => {
        const referenceText = `
        catalogue Demo
        namespace demo
        {
            public interface Bus
            {
            }

            public model Child
            {
            }

            public model M
            {
                reference @@ target
            }
        }`;

        const referenceCursor = extractCursor(referenceText);
        document = await parse(referenceCursor.text, { documentUri: 'memory:///completion-reference.xsmpcat' });
        let items = await getCompletionItems(document, referenceCursor.cursor);
        expect(labels(items)).toContain('Bus');
        expect(labels(items)).toContain('Child');
        expect(labels(items)).toContain('demo.Bus');
        expect(labels(items)).toContain('demo.Child');

        const snippetCursor = extractCursor(`
        catalogue Demo
        namespace demo
        {
            public interface Bus
            {
            }

            public model Child
            {
            }

            public model M
            {
                @@
                reference demo.Bus target
            }
        }`);
        document = await parse(snippetCursor.text, { documentUri: 'memory:///completion-snippet.xsmpcat' });
        items = await getCompletionItems(document, snippetCursor.cursor);
        const referenceSnippet = items.find(item =>
            item.label === 'Reference'
            && item.kind === CompletionItemKind.Snippet
            && item.insertTextFormat === InsertTextFormat.Snippet
        );
        expect(referenceSnippet?.insertText).toContain('Bus');
        expect(referenceSnippet?.insertText).toContain('demo.Bus');

        const realizationSnippet = items.find(item =>
            item.label === 'Realization'
            && item.kind === CompletionItemKind.Snippet
            && item.insertTextFormat === InsertTextFormat.Snippet
        );
        expect(realizationSnippet?.insertText).toContain('demo.Bus');
    });
});

async function getCompletionItems(document: LangiumDocument, offset: number): Promise<CompletionItem[]> {
    const completion = await services.xsmpcat.lsp.CompletionProvider?.getCompletion(document, {
        textDocument: { uri: document.textDocument.uri },
        position: document.textDocument.positionAt(offset),
    });
    return completion?.items ?? [];
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

function labels(items: CompletionItem[]): string[] {
    return items.map(item => item.label);
}

function findSnippetItem(items: CompletionItem[], label: string): CompletionItem | undefined {
    return items.find(item => item.label === label && item.insertTextFormat === InsertTextFormat.Snippet);
}
