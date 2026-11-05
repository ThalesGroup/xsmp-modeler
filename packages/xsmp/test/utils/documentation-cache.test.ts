import { describe, expect, test, vi } from 'vitest';
import { AstUtils, EmptyFileSystem, URI, type AstNode, type AstNodeWithComment, type JSDocComment } from 'langium';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast-partial';
import { TextDocument } from 'vscode-languageserver-textdocument';

describe('Documentation cache', () => {
    test('retains unchanged documentation through updates and reads reparsed comments', async () => {
        const services = createXsmpServices(EmptyFileSystem);
        const documents = services.shared.workspace.LangiumDocuments;
        const factory = services.shared.workspace.LangiumDocumentFactory;
        const builder = services.shared.workspace.DocumentBuilder;
        const helper = services.shared.DocumentationHelper;
        const firstUri = URI.parse('memory:///first.xsmpcat');
        const first = factory.fromString('catalogue First namespace demo { /** First documentation. */ public struct First {} }', firstUri);
        const second = factory.fromString('catalogue Second namespace demo { /** Second documentation. */ public struct Second {} }', URI.parse('memory:///second.xsmpcat'));
        documents.addDocument(first);
        documents.addDocument(second);
        await builder.build([first, second], { validation: false });
        const firstNode = AstUtils.streamAllContents(first.parseResult.value).find(ast.isStructure)!;
        const secondNode = AstUtils.streamAllContents(second.parseResult.value).find(ast.isStructure)!;
        const firstComment = helper.getJSDoc(firstNode);
        const secondComment = helper.getJSDoc(secondNode);
        expect(firstComment?.toString()).toContain('First documentation.');

        const updated = TextDocument.create(firstUri.toString(), 'xsmpcat', 1,
            'catalogue First namespace demo { /** Updated documentation. */ public struct First {} }');
        vi.spyOn(services.shared.workspace.TextDocuments, 'get').mockImplementation(uri => uri === firstUri.toString() ? updated : undefined);
        await builder.update([firstUri], []);

        expect(helper.getJSDoc(secondNode)).toBe(secondComment);
        expect(second.parseResult.value).toBe(AstUtils.getDocument(secondNode).parseResult.value);
        const updatedNode = AstUtils.streamAllContents(first.parseResult.value).find(ast.isStructure)!;
        expect(updatedNode).not.toBe(firstNode);
        expect(helper.getJSDoc(updatedNode)?.toString()).toContain('Updated documentation.');
        expect(helper.getJSDoc(updatedNode)).not.toBe(firstComment);
        vi.restoreAllMocks();
    });

    test('memoizes absent comments and supports synthetic nodes without a document', () => {
        const helper = createXsmpServices(EmptyFileSystem).shared.DocumentationHelper;
        const parser = vi.spyOn(helper as unknown as { parseDocumentation(node: AstNode): JSDocComment | undefined }, 'parseDocumentation');
        const undocumented: AstNode = { $type: ast.Structure.$type };
        expect(helper.getJSDoc(undocumented)).toBeUndefined();
        expect(helper.getJSDoc(undocumented)).toBeUndefined();
        expect(parser).toHaveBeenCalledTimes(1);

        const synthetic: AstNodeWithComment = { $type: ast.Structure.$type, $comment: '/** Imported documentation. */' };
        const parsed = helper.getJSDoc(synthetic);
        expect(parsed?.toString()).toContain('Imported documentation.');
        expect(helper.getJSDoc(synthetic)).toBe(parsed);
        const builtin = { $type: ast.BuiltInConstant.$type, name: 'PI' };
        expect(helper.getJSDoc(builtin)?.toString()).toContain('pi');
        expect(helper.getJSDoc(builtin)).toBe(helper.getJSDoc(builtin));
        vi.restoreAllMocks();
    });
});
