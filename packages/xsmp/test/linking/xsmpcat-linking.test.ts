import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { expandToString as s } from "langium/generate";
import { clearDocuments, parseHelper } from "langium/test";
import { createXsmpServices } from 'xsmp';
import { Catalogue, isCatalogue } from 'xsmp/ast-partial';

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
