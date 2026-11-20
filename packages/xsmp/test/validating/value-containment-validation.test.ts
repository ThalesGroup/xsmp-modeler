import { afterEach, beforeAll, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import { createCompletionProbe, labels } from '../lsp/completion-test-utils.js';

const services = createXsmpServices(EmptyFileSystem);
const parse = parseHelper(services.xsmpcat);
const complete = createCompletionProbe(services.xsmpcat);
const documents: LangiumDocument[] = [];
beforeAll(async () => services.shared.workspace.WorkspaceManager.initializeWorkspace([]));
afterEach(async () => clearDocuments(services.shared, documents.splice(0)));

function catalogue(declarations: string): string {
    let id = 0;
    return `catalogue Containment namespace graph { ${declarations.replace(/public (?:class|array|struct) \w+/g,
        declaration => `/** @uuid 35000000-0000-4000-8000-${String(++id).padStart(12, '0')} */ ${declaration}`)} }`;
}

test.each([
    ['derived instance in base', 'public class Base { public field Derived child } public class Derived extends Base {}', 1],
    ['transitive base', 'public class Base { public field Leaf child } public class Middle extends Base {} public class Leaf extends Middle {}', 1],
    ['base and array', 'public class Base { public field Items children } public class Derived extends Base {} public array Items = Derived[1]', 2],
    ['mutual instance fields', 'public class A { public field B child } public class B { public field A child }', 2],
    ['static self', 'public class Value { @Static public field Value singleton }', 0],
    ['mutual static fields', 'public class A { @Static public field B child } public class B { @Static public field A child }', 0],
    ['transitive static break', 'public class A { public field B child } public class B { @Static public field A singleton }', 0],
    ['base and static break', 'public class Base { @Static public field Derived singleton } public class Derived extends Base {}', 0],
    ['array and static break', 'public array Items = Value[1] public class Value { @Static public field Items singleton }', 0],
    ['false Static annotation', 'public class Value { @Static(false) public field Value child }', 1],
    ['ordinary inheritance', 'public class Base { public field Int32 value } public class Derived extends Base { public field Base child }', 0],
] as const)('validates value containment: %s', async (_name, declarations, count) => {
    const document = await parse(catalogue(declarations), { validation: true });
    documents.push(document);
    const errors = (document.diagnostics ?? []).filter(diagnostic => diagnostic.severity === 1).map(diagnostic => diagnostic.message);
    expect(errors).toHaveLength(count);
    for (const error of errors) expect(error).toMatch(/^Recursive (Field|Array) Type\.$/);
});

test.each([
    ['inherited instance', 'public class Base { public field |Int32 child } public class Derived extends Base {}', [], ['Base', 'Derived']],
    ['static self', 'public class Value { @Static public field |Int32 singleton }', ['Value'], []],
    ['transitive static break', 'public class A { public field |Int32 child } public class B { @Static public field A singleton }', ['B'], ['A']],
    ['array with static break', 'public array Items = |Int32[1] public class Value { @Static public field Items singleton }', ['Value'], ['Items']],
    ['array through inheritance', 'public array Items = |Int32[1] public class Base { public field Items children } public class Derived extends Base {}', [], ['Items', 'Base', 'Derived']],
] as const)('completion respects value containment: %s', async (_name, declarations, included, excluded) => {
    const marked = catalogue(declarations);
    const offset = marked.indexOf('|');
    const sourceText = marked.slice(0, offset) + marked.slice(offset + 1);
    const result = await complete({ sourceText, offset });
    const actual = labels(result.items);
    for (const name of included) expect(actual).toContain(name);
    for (const name of excluded) expect(actual).not.toContain(name);
    expect(actual).toContain('Int32');
});
