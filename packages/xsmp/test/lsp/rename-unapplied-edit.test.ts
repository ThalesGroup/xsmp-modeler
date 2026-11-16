import { expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import { isStructure } from '@xsmp/core/ast-partial';
import { TextDocument } from 'vscode-languageserver-textdocument';

test('an unapplied rename leaves the AST and subsequent rename requests unchanged', async () => {
    const services = createXsmpServices(EmptyFileSystem);
    const text = `catalogue Demo namespace demo {
        /** @uuid f8999d3f-e4fb-4f99-9428-4f040ec47b0f */
        public struct Thing {}
        /** @uuid e73f7a91-cc94-4e92-a9ae-fa418206a83f */
        public model Root { field Thing value }
    }`;
    const document = await parseHelper(services.xsmpcat)(text);
    expect(document.parseResult.parserErrors).toEqual([]);
    expect(document.references.every(reference => !reference.error)).toBe(true);
    const structure = AstUtils.streamAllContents(document.parseResult.value).find(isStructure)!;
    const params = {
        textDocument: { uri: document.uri.toString() },
        position: document.textDocument.positionAt(text.indexOf('Thing')),
    };
    const symbols = await services.xsmpcat.lsp.DocumentSymbolProvider!.getSymbols(document, params);
    for (const newName of ['Renamed', 'Third']) {
        const edit = await services.xsmpcat.lsp.RenameProvider!.rename(document, { ...params, newName });
        const changes = edit?.changes?.[document.uri.toString()] ?? [];
        expect(changes).toHaveLength(2);
        const renamed = TextDocument.applyEdits(document.textDocument, changes);
        expect(renamed).toContain(`struct ${newName}`);
        expect(renamed).toContain(`field ${newName} value`);
        expect(structure.name).toBe('Thing');
        expect(document.textDocument.getText()).toBe(text);
        expect(await services.xsmpcat.lsp.DocumentSymbolProvider!.getSymbols(document, params)).toEqual(symbols);
    }
});
