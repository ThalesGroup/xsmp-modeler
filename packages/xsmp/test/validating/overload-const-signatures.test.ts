import { afterEach, beforeAll, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem, type LangiumDocument } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast-partial';
import { getOperationInvocationIssue } from '../../src/utils/operation-invocation.js';

const services = createXsmpServices(EmptyFileSystem);
const parse = parseHelper(services.xsmpcat);
const documents: LangiumDocument[] = [];
beforeAll(async () => services.shared.workspace.WorkspaceManager.initializeWorkspace([]));
afterEach(async () => clearDocuments(services.shared, documents.splice(0)));

async function parseTypes(body: string) {
    let id = 0;
    const document = await parse(`catalogue Signatures namespace signatures { ${body.replace(/public (?:class|model) \w+/g,
        declaration => `/** @uuid 37000000-0000-4000-8000-${String(++id).padStart(12, '0')} */ ${declaration}`)} }`, { validation: true });
    documents.push(document);
    return document;
}

test.each([
    ['top-level parameter const', 'public def void f(in Int32 value) public def void f(@Const in Int32 value)', 1],
    ['member const', 'public def void f() @Const public def void f()', 0],
    ['member const with value parameter', 'public def void f(in Int32 value) @Const public def void f(@Const in Int32 value)', 0],
    ['pointee const', 'public def void f(@ByPointer in Int32 value) public def void f(@Const @ByPointer in Int32 value)', 0],
    ['referent const', 'public def void f(@ByReference in Int32 value) public def void f(@Const @ByReference in Int32 value)', 0],
    ['false member Const', 'public def void f() @Const(false) public def void f()', 1],
    ['static versus const member', '@Static public def void f() @Const public def void f()', 1],
    ['const member versus static', '@Const public def void f() @Static public def void f()', 1],
    ['two static methods', '@Static public def void f() @Const @Static public def void f()', 1],
    ['different parameter types', '@Static public def void f(in Int32 value) @Const public def void f(in Float64 value)', 0],
] as const)('compares C++ signatures: %s', async (_name, members, count) => {
    const document = await parseTypes(`public class Probe { ${members} }`);
    const errors = (document.diagnostics ?? []).filter(diagnostic => diagnostic.severity === 1).map(diagnostic => diagnostic.message);
    expect(errors).toEqual(Array.from({ length: count }, () => 'Duplicated identifier.'));
});

test('distinguishes const member overloads in document symbols and dynamic invocation', async () => {
    const document = await parseTypes('public model Probe { def void f() @Const def void f() }');
    expect((document.diagnostics ?? []).filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
    const operations = AstUtils.streamAllContents(document.parseResult.value).filter(ast.isOperation).toArray();
    for (const operation of operations) expect(getOperationInvocationIssue(operation, services.shared.AttributeHelper))
        .toBe('overloaded operation names cannot be distinguished by Smp::IRequest');
    const symbols = await services.xsmpcat.lsp.DocumentSymbolProvider!.getSymbols(document, { textDocument: { uri: document.uri.toString() } });
    const members = symbols[0].children?.[0].children?.[0].children;
    expect(members?.map(symbol => symbol.name)).toEqual(['f()', 'f() const']);
});

test('does not mistake const by-value overrides for dynamic overloads', async () => {
    const document = await parseTypes('public model Base { def void f(in Int32 value) } public model Derived extends Base { def void f(@Const in Int32 value) }');
    expect((document.diagnostics ?? []).filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
    const operations = AstUtils.streamAllContents(document.parseResult.value).filter(ast.isOperation).toArray();
    expect(getOperationInvocationIssue(operations[1], services.shared.AttributeHelper)).toBeUndefined();
});
