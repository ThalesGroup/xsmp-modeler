import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { expandToString as s } from "langium/generate";
import { clearDocuments, parseHelper } from "langium/test";
import { createXsmpServices } from '@xsmp/core';
import { Catalogue, isCatalogue, isClass, isNamespace, isOperation } from '@xsmp/core/ast-partial';

let services: ReturnType<typeof createXsmpServices>;
let parse: ReturnType<typeof parseHelper<Catalogue>>;
let document: LangiumDocument<Catalogue> | undefined;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parse = parseHelper<Catalogue>(services.xsmpcat);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

afterEach(async () => {
    document && clearDocuments(services.shared, [document]);
});

describe('Linking tests', () => {

    test('linking of greetings', async () => {
        document = await parse(`
            catalogue test

            namespace ns
            {
               struct a
               {
                    field Smp.Int64 a
                    field Int64 b
               }
            }
            namespace ns2
            {
            }
        `);

        expect(
            // here we first check for validity of the parsed document object by means of the reusable function
            //  'checkDocumentValid()' to sort out (critical) typos first,
            // and then evaluate the cross references we're interested in by checking
            //  the referenced AST element as well as for a potential error message;
            checkDocumentValid(document)
            ?? document.parseResult.value.elements.map(g => g.name).join('\n')
        ).toBe(s`
            ns
            ns2
        `);
    });

    test('operation names do not shadow type names', async () => {
        document = await parse(`
            catalogue test

            namespace ns
            {
                /** @uuid 830b6e43-91ac-408a-a991-8f34c071bae5 */
                class Toto
                {
                    @Constructor
                    def void Toto()

                    def void Copy(Toto other)
                }
            }
        `);

        const namespace = document.parseResult.value.elements[0];
        if (!namespace || !isNamespace(namespace)) {
            throw new Error(`Root element is a ${namespace?.$type ?? 'undefined'}, expected a namespace.`);
        }

        const clazz = namespace.elements[0];
        if (!clazz || !isClass(clazz)) {
            throw new Error(`Namespace element is a ${clazz?.$type ?? 'undefined'}, expected a class.`);
        }

        const constructor = clazz.elements.find(element => isOperation(element) && element.name === 'Toto');
        const copy = clazz.elements.find(element => isOperation(element) && element.name === 'Copy');

        expect(checkDocumentValid(document)).toBeUndefined();
        expect(copy).toBeDefined();
        expect(constructor).toBeDefined();
        expect(copy?.parameter[0]?.type.ref).toBe(clazz);
        expect(copy?.parameter[0]?.type.ref).not.toBe(constructor);
    });
});

function checkDocumentValid(document: LangiumDocument): string | undefined {
    return document.parseResult.parserErrors.length && s`
        Parser errors:
          ${document.parseResult.parserErrors.map(e => e.message).join('\n  ')}
    `
        || document.parseResult.value === undefined && `ParseResult is 'undefined'.`
        || !isCatalogue(document.parseResult.value) && `Root AST object is a ${document.parseResult.value.$type}, expected a '${Catalogue}'.`
        || undefined;
}
