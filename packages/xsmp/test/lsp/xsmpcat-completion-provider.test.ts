import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { CompletionItemKind, InsertTextFormat } from 'vscode-languageserver';
import { createXsmpServices } from 'xsmp';
import { applyCompletion, createCompletionProbe, findSnippetItem, labels } from './completion-test-utils.js';

let services: ReturnType<typeof createXsmpServices>;
let getCatalogueCompletion: ReturnType<typeof createCompletionProbe>;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    getCatalogueCompletion = createCompletionProbe(services.xsmpcat);
});

describe('Xsmpcat completion provider', () => {
    test('offers the catalogue snippet in an empty document', async () => {
        const cursor = extractCursor('@@');
        const items = await getCompletionItems(cursor.text, cursor.cursor, 'memory:///demo-root.xsmpcat');
        expect(labels(items)).toContain('Catalogue');
        expect(labels(items)).not.toContain('catalogue');
        expect(findSnippetItem(items, 'Catalogue')?.insertText).toContain('catalogue ${1:Catalogue}');
    });

    test('offers only namespace snippets at catalogue level', async () => {
        const cursor = extractCursor(`catalogue demo
@@
`);
        const items = await getCompletionItems(cursor.text, cursor.cursor, 'memory:///demo-catalogue.xsmpcat');
        expect(labels(items)).toContain('Namespace');
        expect(labels(items)).not.toContain('namespace');
        expect(findSnippetItem(items, 'Namespace')?.insertText).toContain('namespace ${1:Namespace}');
        expect(labels(items)).not.toContain('Model');
        expect(labels(items)).not.toContain('Structure');
        expect(labels(items)).not.toContain('Interface');
    });

    test('offers namespace snippets for catalogue-level prefixes', async () => {
        const cursor = extractCursor(`catalogue demo
na@@
`);
        const items = await getCompletionItems(cursor.text, cursor.cursor, 'memory:///demo-catalogue-prefix.xsmpcat');
        expect(labels(items)).toContain('Namespace');
        expect(labels(items)).not.toContain('Model');
    });

    test('offers type definitions inside a namespace', async () => {
        const cursor = extractCursor(`catalogue demo
namespace demo
{
    @@
}
`);
        const items = await getCompletionItems(cursor.text, cursor.cursor, 'memory:///demo-namespace.xsmpcat');
        expect(findSnippetItem(items, 'Model')?.insertText).toContain('/** @uuid ');
        expect(items.filter(item => item.label === 'Model')).toHaveLength(1);
        expect(items.filter(item => item.label === 'Structure')).toHaveLength(1);
        expect(items.filter(item => item.label === 'Interface')).toHaveLength(1);
        expect(labels(items)).toContain('Model');
        expect(labels(items)).not.toContain('Constant');
        expect(labels(items)).not.toContain('Property');
        expect(labels(items)).not.toContain('Operation');
    });

    test('returns to namespace-level snippets after a closed classifier', async () => {
        const cursor = extractCursor(`catalogue demo
namespace demo
{
    /** @uuid 8aacd110-f87d-4ef5-a3ef-1f727f7c561e */
    array BoolArray = Bool[10]

    /** @uuid fc225edd-ffbc-48c2-b6ee-be095f83c595 */
    class MyClass
    {
        association BoolArray a
        constant Int8 f = 0
        field Int32 name
    }
    @@
}
`);
        const items = await getCompletionItems(cursor.text, cursor.cursor, 'memory:///demo-namespace-after-class.xsmpcat');
        expect(labels(items)).toContain('Model');
        expect(labels(items)).toContain('Structure');
        expect(labels(items)).not.toContain('Constant');
        expect(labels(items)).not.toContain('Property');
        expect(labels(items)).not.toContain('Operation');
    });

    test('returns to catalogue-level snippets after a closed namespace', async () => {
        const cursor = extractCursor(`catalogue Test

namespace demo::foundation
{

    /** @uuid afb4bd71-93c9-4dd1-8055-c7d80c1dbe7b */
    model M1
    {
        field Bool bField

    }
    
}

@@
`);
        const items = await getCompletionItems(cursor.text, cursor.cursor, 'memory:///demo-catalogue-after-namespace.xsmpcat');
        expect(labels(items)).toContain('Namespace');
        expect(labels(items)).not.toContain('Model');
        expect(labels(items)).not.toContain('Structure');
        expect(labels(items)).not.toContain('Field');
        expect(labels(items)).not.toContain('Constant');
        expect(labels(items)).not.toContain('Property');
        expect(labels(items)).not.toContain('Operation');
    });

    test('offers classifier members inside a model', async () => {
        const cursor = extractCursor(`catalogue demo
namespace demo
{
    model M
    {
        @@
    }
}
`);
        const items = await getCompletionItems(cursor.text, cursor.cursor, 'memory:///demo-model.xsmpcat');
        expect(labels(items)).toContain('Field');
        expect(labels(items)).toContain('Reference');
        expect(labels(items)).not.toContain('field');
        expect(labels(items)).not.toContain('reference');
    });

    test('prioritizes boolean literals before typed constants', async () => {
        const cursor = extractCursor(`catalogue demo
namespace Smp
{
    public primitive Bool
    public primitive Int32
}
namespace demo
{
    public model M
    {
        public constant Smp.Bool Enabled = true
        public constant Smp.Int32 Count = 0
        field Smp.Bool enabled =@@
    }
}
`);
        const items = await getCompletionItems(cursor.text, cursor.cursor, 'memory:///demo.xsmpcat');
        expect(labels(items)).toContain('false');
        expect(labels(items)).toContain('true');
        expect(labels(items)).toContain('Enabled');
        expect(labels(items)).not.toContain('Count');
        expect(items.filter(item => item.label === 'false')).toHaveLength(1);
        expect(items.filter(item => item.label === 'true')).toHaveLength(1);
        expect(labels(items)).not.toContain('Default Value');
        expect(labels(items)).not.toContain('nullptr');
        expect(labels(items)[0]).toBe('false');
        expect(labels(items).indexOf('true')).toBeLessThan(labels(items).indexOf('Enabled'));
    });

    test('keeps typed constants after direct value completions', async () => {
        const cursor = extractCursor(`catalogue Test
namespace Smp
{
    public primitive Bool
}
namespace a
{
    public struct Vector
    {
        constant Smp.Bool ON = true
    }
}
namespace demo
{
    public struct Vector
    {
        constant Smp.Bool ON = true
    }

    model M1
    {
        field Smp.Bool boolField =@@
    }
}
`);
        const items = await getCompletionItems(cursor.text, cursor.cursor, 'memory:///demo-bool-constants.xsmpcat');
        expect(labels(items)[0]).toBe('false');
        expect(labels(items)[1]).toBe('true');
        expect(labels(items)).toContain('Vector.ON');
        expect(labels(items)).toContain('a.Vector.ON');
        expect(labels(items).indexOf('true')).toBeLessThan(labels(items).indexOf('Vector.ON'));
    });

    test('prioritizes integral literals before typed constants', async () => {
        const cursor = extractCursor(`catalogue demo
namespace Smp
{
    public primitive Int32
    public primitive Int64
    public primitive Float32
}
namespace demo
{
    public model M
    {
        public constant Smp.Int32 Count = 0
        public constant Smp.Int64 BigCount = 0L
        public constant Smp.Float32 Ratio = 1.0f
        field Smp.Int32 value =@@
    }
}
`);
        const items = await getCompletionItems(cursor.text, cursor.cursor, 'memory:///demo-integral-values.xsmpcat');
        expect(labels(items)).toContain('0');
        expect(labels(items)).toContain('Count');
        expect(labels(items)).not.toContain('BigCount');
        expect(labels(items)).not.toContain('Ratio');
        expect(labels(items)[0]).toBe('0');
        expect(items[0]?.preselect).toBe(true);
        expect(labels(items).indexOf('0')).toBeLessThan(labels(items).indexOf('Count'));
    });

    test('prioritizes floating-point literals before typed constants', async () => {
        const cursor = extractCursor(`catalogue demo
namespace Smp
{
    public primitive Int32
    public primitive Float32
    public primitive Float64
}
namespace demo
{
    public model M
    {
        public constant Smp.Float32 Ratio = 1.0f
        public constant Smp.Float64 PreciseRatio = 1.0
        public constant Smp.Int32 Count = 0
        field Smp.Float32 value =@@
    }
}
`);
        const items = await getCompletionItems(cursor.text, cursor.cursor, 'memory:///demo-float-values.xsmpcat');
        expect(labels(items)).toContain('0.f');
        expect(labels(items)).toContain('$PI');
        expect(labels(items)).toContain('$E');
        expect(labels(items)).toContain('Ratio');
        expect(labels(items)).not.toContain('PreciseRatio');
        expect(labels(items)).not.toContain('Count');
        expect(labels(items)).not.toContain('Default Value');
        expect(labels(items)[0]).toBe('0.f');
        expect(items[0]?.preselect).toBe(true);
        expect(labels(items).indexOf('$E')).toBeLessThan(labels(items).indexOf('Ratio'));
    });

    test('prioritizes default value completion for structured field initializers', async () => {
        const cursor = extractCursor(`catalogue Test

namespace Smp
{
    public primitive Float32
}
namespace demo::foundation
{
    /** @uuid 78a37ad7-03f3-4609-8f19-2109f3d426f3 */
    struct Vector
    {
        field Smp.Float32 x
        field Smp.Float32 y
        field Smp.Float32 z
    }

    /** @uuid afb4bd71-93c9-4dd1-8055-c7d80c1dbe7b */
    model M1
    {
        field Vector bField =@@
    }
}
`);
        const items = await getCompletionItems(cursor.text, cursor.cursor, 'memory:///demo-structured-default.xsmpcat');
        expect(labels(items)[0]).toBe('{.x = 0.0f, .y = 0.0f, .z = 0.0f}');
        expect(items[0]?.preselect).toBe(true);
        expect(items[0]?.insertText?.startsWith(' ')).toBe(true);
        expect(labels(items)).not.toContain('false');
        expect(labels(items)).not.toContain('Default Value');
    });

    test('prioritizes enumeration literals before typed constants', async () => {
        const cursor = extractCursor(`catalogue Test

namespace Smp
{
    public primitive Bool
}
namespace demo
{
    enum Mode
    {
        Nominal = 0,
        Safe = 1
    }

    model M
    {
        public constant Mode DefaultMode = demo.Mode.Nominal
        public constant Smp.Bool Enabled = true
        field Mode mode =@@
    }
}
`);
        const items = await getCompletionItems(cursor.text, cursor.cursor, 'memory:///demo-enum-default.xsmpcat');
        expect(labels(items)[0]).toBe('demo.Mode.Nominal');
        expect(labels(items)[1]).toBe('demo.Mode.Safe');
        expect(labels(items)).toContain('DefaultMode');
        expect(labels(items)).not.toContain('Enabled');
        expect(labels(items)).not.toContain('Default Value');
        expect(items[0]?.preselect).toBe(true);
        expect(items[0]?.insertText?.startsWith(' ')).toBe(true);
        expect(labels(items).indexOf('demo.Mode.Safe')).toBeLessThan(labels(items).indexOf('DefaultMode'));
    });

    test('offers only aggregate default values for aggregate initializers', async () => {
        const structCursor = extractCursor(`catalogue demo
namespace Smp
{
    public primitive Bool
    public primitive Int32
}
namespace demo
{
    public struct State
    {
        field Smp.Bool enabled
    }

    public model M
    {
        field State state =@@
    }
}
`);
        let items = await getCompletionItems(structCursor.text, structCursor.cursor, 'memory:///demo-struct-values.xsmpcat');
        expect(labels(items)).toContain('{.enabled = false}');
        expect(labels(items)).not.toContain('DefaultState');
        expect(labels(items)).not.toContain('false');
        expect(labels(items)).not.toContain('Default Value');
        expect(labels(items)[0]).toBe('{.enabled = false}');

        const arrayCursor = extractCursor(`catalogue demo
namespace Smp
{
    public primitive Int32
}
namespace demo
{
    public array IntArray = Smp.Int32[2]

    public model M
    {
        field IntArray values =@@
    }
}
        `);
        items = await getCompletionItems(arrayCursor.text, arrayCursor.cursor, 'memory:///demo-array-values.xsmpcat');
        expect(labels(items)).toContain('{0, 0}');
        expect(labels(items)).not.toContain('Defaults');
        expect(labels(items)).not.toContain('0');
        expect(labels(items)).not.toContain('Default Value');
        expect(labels(items)[0]).toBe('{0, 0}');
    });

    test('does not duplicate the member keyword when completing a field type', async () => {
        const cursor = extractCursor(`catalogue demo
namespace demo
{
    public struct State
    {
        field Smp.Bool enabled
    }

    public model M
    {
        field @@
    }
}
`);
        const items = await getCompletionItems(cursor.text, cursor.cursor, 'memory:///demo-field-type.xsmpcat');
        const stateItem = items.find(item => item.label === 'State' || item.label === 'demo.State');
        const inserted = stateItem?.textEdit?.newText ?? stateItem?.insertText;
        expect(inserted).toBe('State');
    });

    test('replaces only the type when a field name already exists', async () => {
        const cursor = extractCursor(`catalogue demo
namespace demo
{
    public enum AccessKind
    {
        ReadOnly = 0,
        WriteOnly = 1
    }

    public struct State
    {
        field Smp.Bool enabled
    }

    public model M
    {
        field @@AccessKind toto
    }
}
`);
        const items = await getCompletionItems(cursor.text, cursor.cursor, 'memory:///demo-replace-field-type.xsmpcat');
        const stateItem = items.find(item => item.label === 'State');
        expect(applyCompletion(cursor.text, stateItem!)).toContain('field State toto');
    });

    test('replaces the existing type token instead of prefixing it', async () => {
        const cursor = extractCursor(`catalogue demo
namespace demo
{
    public enum AccessKind
    {
        ReadOnly = 0,
        WriteOnly = 1
    }

    public primitive Bool

    public model M
    {
        field @@Bool name
    }
}
`);
        const items = await getCompletionItems(cursor.text, cursor.cursor, 'memory:///demo-replace-existing-type.xsmpcat');
        const accessKindItem = items.find(item => item.label === 'AccessKind');
        expect(applyCompletion(cursor.text, accessKindItem!)).toContain('field AccessKind name');
    });

    test('prioritizes primitive types before composite types in member type completion', async () => {
        const cursor = extractCursor(`catalogue demo
namespace demo
{
    public primitive AccessKind

    public struct Vector
    {
        field Smp.Int32 x
    }

    public model M
    {
        field @@Vector name
    }
}
`);
        const items = await getCompletionItems(cursor.text, cursor.cursor, 'memory:///demo-primitive-type-priority.xsmpcat');
        expect(labels(items).indexOf('AccessKind')).toBeGreaterThanOrEqual(0);
        expect(labels(items).indexOf('Vector')).toBeGreaterThanOrEqual(0);
        expect(labels(items).indexOf('AccessKind')).toBeLessThan(labels(items).indexOf('Vector'));
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
        const items = await getCompletionItems(cursor.text, cursor.cursor, 'memory:///demo.xsmpcat');
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
        let items = await getCompletionItems(referenceCursor.text, referenceCursor.cursor, 'memory:///completion-reference.xsmpcat');
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
        items = await getCompletionItems(snippetCursor.text, snippetCursor.cursor, 'memory:///completion-snippet.xsmpcat');
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
