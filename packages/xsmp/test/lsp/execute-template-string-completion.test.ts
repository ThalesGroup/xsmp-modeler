import { expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import { isInt32Argument, isStringArgument, isStringParameter } from '@xsmp/core/ast-partial';
import { TextDocument } from 'vscode-languageserver-textdocument';

test.each([
    '"platform"',
    '""',
    String.raw`"a\\b"`,
    String.raw`"quoted \x22value\x22"`,
    '"$name}"',
    String.raw`"line\nnext"`,
])('execute snippets preserve string template literal %s', async literal => {
    const services = createXsmpServices(EmptyFileSystem);
    const source = `schedule <Root = ${literal}, Count = 7> Demo
        task Worker {}
        task Main {

        }`;
    const document = await parseHelper(services.xsmpsed)(source);
    expect(document.parseResult.lexerErrors).toEqual([]);
    expect(document.parseResult.parserErrors).toEqual([]);
    const stringParameter = AstUtils.streamAllContents(document.parseResult.value).find(isStringParameter)!;
    const completion = await services.xsmpsed.lsp.CompletionProvider!.getCompletion(document, {
        textDocument: { uri: document.uri.toString() },
        position: document.textDocument.positionAt(source.indexOf('\n        }')),
    });
    const item = completion?.items.find(item => item.label === 'execute Worker');
    expect(item?.textEdit).toBeDefined();
    const edit = item!.textEdit!;
    expect('range' in edit).toBe(true);
    if (!('range' in edit)) throw new Error('Expected replacement edit');
    // Expand default snippet placeholders, including escaped backslashes, dollars and closing braces.
    const expanded = edit.newText.replace(/\$\{\d+:((?:\\.|[^}\\])*)\}/g, (_, value: string) => value.replace(/\\([\\$}])/g, '$1'));
    const inserted = TextDocument.applyEdits(document.textDocument, [{ ...edit, newText: expanded }]);
    const parsed = services.xsmpsed.parser.LangiumParser.parse(inserted);
    expect(parsed.lexerErrors).toEqual([]);
    expect(parsed.parserErrors).toEqual([]);
    const nodes = AstUtils.streamAllContents(parsed.value).toArray();
    expect(nodes.find(isStringArgument)?.value).toBe(stringParameter.value);
    expect(nodes.find(isInt32Argument)?.value).toBe(7);
});
