import { afterEach, describe, expect, test, vi } from 'vitest';
import { AstUtils, EmptyFileSystem, URI } from 'langium';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast-partial';

afterEach(() => vi.restoreAllMocks());

describe('Filtered local scopes', () => {
    test('filters a large local scope once per reference type while linking every field', async () => {
        const services = createXsmpServices(EmptyFileSystem);
        const count = 128;
        const document = services.shared.workspace.LangiumDocumentFactory.fromString(`catalogue Test
            namespace Smp { public primitive Int32 }
            namespace demo { public struct Data {
                constant Int32 Initial = 7
                ${Array.from({ length: count }, (_, index) => `field Int32 value${index} = Initial`).join('\n')}
            } }`, URI.parse('memory:///local-scopes.xsmpcat'));
        services.shared.workspace.LangiumDocuments.addDocument(document);
        const subtype = vi.spyOn(services.shared.AstReflection, 'isSubtype');
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });
        expect(document.parseResult.parserErrors).toEqual([]);
        expect(document.references.flatMap(reference => reference.error?.message ?? [])).toEqual([]);
        const fieldTypeChecks = subtype.mock.calls.filter(([type, target]) => type === ast.Field.$type && target === ast.Type.$type);
        // The original provider tested all 128 fields again for each field's type reference.
        expect(fieldTypeChecks).toHaveLength(count);
        const references = AstUtils.streamAllContents(document.parseResult.value).filter(ast.isNamedElementReference).toArray();
        expect(references).toHaveLength(count);
        expect(references.every(reference => ast.isConstant(reference.value.ref))).toBe(true);
    });

    test('refreshes inherited local scopes when their defining document changes', async () => {
        const services = createXsmpServices(EmptyFileSystem);
        const documents = services.shared.workspace.LangiumDocuments;
        const factory = services.shared.workspace.LangiumDocumentFactory;
        const create = (text: string, name: string) => {
            const document = factory.fromString(text, URI.parse(`memory:///scopes/${name}`));
            documents.addDocument(document);
            return document;
        };
        create("project 'Scopes' source '.'", 'xsmp.project');
        const baseText = `catalogue Base namespace Smp { public primitive Int32 }
            namespace demo { public class Base { public constant Int32 Initial = 7 } }`;
        const base = create(baseText, 'base.xsmpcat');
        const derived = create(`catalogue Derived namespace demo {
            public class Derived extends demo.Base { field Int32 value = Initial }
        }`, 'derived.xsmpcat');
        const builder = services.shared.workspace.DocumentBuilder;
        await builder.build(documents.all.toArray(), { validation: false });
        expect(derived.parseResult.parserErrors).toEqual([]);
        expect(derived.references.flatMap(reference => reference.error?.message ?? [])).toEqual([]);
        const consumer = derived.parseResult.value;
        const reference = AstUtils.streamAllContents(consumer).find(ast.isNamedElementReference)!;
        const previous = reference.value.ref;
        const updated = TextDocument.create(base.uri.toString(), 'xsmpcat', 1, baseText.replace('= 7', '= 8'));
        vi.spyOn(services.shared.workspace.TextDocuments, 'get').mockImplementation(uri => uri === base.uri.toString() ? updated : undefined);
        await builder.update([base.uri], []);
        expect(derived.parseResult.value).toBe(consumer);
        expect(derived.references.flatMap(reference => reference.error?.message ?? [])).toEqual([]);
        expect(reference.value.ref).not.toBe(previous);
        const newConstant = AstUtils.streamAllContents(base.parseResult.value).find(ast.isConstant)!;
        expect(reference.value.ref).toBe(newConstant);
    });
});
