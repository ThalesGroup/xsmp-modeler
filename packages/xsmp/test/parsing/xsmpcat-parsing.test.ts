import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { expandToString as s } from "langium/generate";
import { parseHelper } from "langium/test";
import { createXsmpServices } from 'xsmp';
import * as ast from 'xsmp/ast-partial';
import { Catalogue, isCatalogue } from 'xsmp/ast-partial';

let services: ReturnType<typeof createXsmpServices>;
let parse:    ReturnType<typeof parseHelper<Catalogue>>;
let document: LangiumDocument<Catalogue> | undefined;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parse = parseHelper<Catalogue>(services.xsmpcat);

     await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

describe('Parsing tests', () => {

    test('parse simple model', async () => {
        document = await parse(`
            catalogue test

            namespace a
            {
            }
        `);

        // check for absensce of parser errors the classic way:
        //  deacivated, find a much more human readable way below!
        // expect(document.parseResult.parserErrors).toHaveLength(0);

        expect(
            // here we use a (tagged) template expression to create a human readable representation
            //  of the AST part we are interested in and that is to be compared to our expectation;
            // prior to the tagged template expression we check for validity of the parsed document object
            //  by means of the reusable function 'checkDocumentValid()' to sort out (critical) typos first;
            checkDocumentValid(document) ?? s`
                Namespaces:
                  ${document.parseResult.value?.elements?.map(p => p.name)?.join('\n  ')}
            `
        ).toBe(s`
            Namespaces:
              a
        `);
    });

    test('parse shorthand multiplicities for container and reference', async () => {
        document = await parse(`
            catalogue test

            namespace demo
            {
                public interface ILogger
                {
                }

                public model Sensor
                {
                }

                public model Platform
                {
                    container demo.Sensor* sensors
                    reference demo.ILogger+ loggers
                }
            }
        `);

        expect(checkDocumentValid(document)).toBeUndefined();
        const namespace = document.parseResult.value?.elements?.[0];
        const platform = namespace?.elements?.find((element): element is ast.Model => ast.isModel(element) && element.name === 'Platform');
        expect(platform?.elements?.some(ast.isContainer)).toBe(true);
        expect(platform?.elements?.some(ast.isReference)).toBe(true);
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
