import { afterAll, beforeAll, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem, GrammarUtils, URI, type LangiumDocument } from 'langium';
import { parseHelper } from 'langium/test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast-partial';

let directory: string;
let services: ReturnType<typeof createXsmpServices>;
let baseDocument: LangiumDocument;
let derivedDocument: LangiumDocument;

beforeAll(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-hierarchy-uri-'));
    services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
    await parseHelper(services.xsmpproject)('project "Hierarchy" using "ECSS_SMP_2025" source "."', {
        documentUri: URI.file(path.join(directory, 'xsmp.project')).toString(), validation: true,
    });
    baseDocument = await parseHelper(services.xsmpcat)(`catalogue BaseTypes namespace demo {
        /** @uuid 6a000000-0000-4000-8000-000000000001 */ public class Base {}
    }`, { documentUri: URI.file(path.join(directory, 'base.xsmpcat')).toString(), validation: true });
    derivedDocument = await parseHelper(services.xsmpcat)(`catalogue DerivedTypes namespace other {
        /** @uuid 6a000000-0000-4000-8000-000000000002 */
        public class Derived extends demo.Base {}
        /** @uuid 6a000000-0000-4000-8000-000000000003 */
        public integer Count extends Int32
    }`, { documentUri: URI.file(path.join(directory, 'derived.xsmpcat')).toString(), validation: true });
    for (const document of [baseDocument, derivedDocument]) {
        expect(document.parseResult.parserErrors).toEqual([]);
        expect(document.diagnostics?.filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
    }
});

afterAll(() => { fs.rmSync(directory, { recursive: true, force: true }); });

async function prepare(document: LangiumDocument, text: string) {
    const offset = document.textDocument.getText().indexOf(text);
    expect(offset).toBeGreaterThanOrEqual(0);
    return await services.xsmpcat.lsp.TypeHierarchyProvider!.prepareTypeHierarchy(document, {
        textDocument: { uri: document.uri.toString() }, position: document.textDocument.positionAt(offset),
    }) ?? [];
}

test('keeps declaration locations and their subtypes', async () => {
    const [item] = await prepare(baseDocument, 'Base {}');
    expect(item.uri).toBe(baseDocument.uri.toString());
    expect(baseDocument.textDocument.getText(item.selectionRange)).toBe('Base');
    const children = await services.xsmpcat.lsp.TypeHierarchyProvider!.subtypes({ item });
    expect(children?.map(child => [child.name, child.uri])).toEqual([['Derived', derivedDocument.uri.toString()]]);
});

test('uses the declaration document when preparing from an external reference', async () => {
    const [declaration] = await prepare(baseDocument, 'Base {}');
    const [reference] = await prepare(derivedDocument, 'Base {}');
    expect(reference).toEqual(declaration);
    const provider = services.xsmpcat.lsp.TypeHierarchyProvider!;
    expect(await provider.subtypes({ item: reference })).toEqual(await provider.subtypes({ item: declaration }));
});

test('keeps builtin declaration URIs when preparing from project source', async () => {
    const integer = AstUtils.streamAllContents(derivedDocument.parseResult.value).find(ast.isInteger)!;
    const primitive = integer.primitiveType!.ref!;
    const builtin = AstUtils.getDocument(primitive);
    const provider = services.xsmpcat.lsp.TypeHierarchyProvider!;
    const [declaration] = await provider.prepareTypeHierarchy(builtin, {
        textDocument: { uri: builtin.uri.toString() },
        position: GrammarUtils.findNodeForProperty(primitive.$cstNode, 'name')!.range.start,
    }) ?? [];
    const [reference] = await prepare(derivedDocument, 'Int32');
    expect(builtin.uri.scheme).toBe('xsmp');
    expect(reference).toEqual(declaration);
    const children = await provider.subtypes({ item: reference }) ?? [];
    expect(children.filter(child => child.uri === derivedDocument.uri.toString()).map(child => child.name)).toEqual(['Count']);
});
