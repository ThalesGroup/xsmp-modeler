import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { expandToString as s } from "langium/generate";
import { parseHelper } from "langium/test";
import { DiagnosticSeverity, type Diagnostic } from "vscode-languageserver-types";
import { createXsmpServices } from 'xsmp';
import { Catalogue, isCatalogue, } from 'xsmp/ast-partial';
import * as path from 'path';
import * as fs from 'fs';

let services: ReturnType<typeof createXsmpServices>;
let parse: ReturnType<typeof parseHelper<Catalogue>>;
let document: LangiumDocument<Catalogue> | undefined;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    const doParse = parseHelper<Catalogue>(services.xsmpcat);
    parse = (input: string) => doParse(input, { validation: true });

    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

describe('Validating Xsmpcat', () => {

    test('check validation issues', async () => {

        document = await parse(fs.readFileSync(path.resolve(__dirname, 'test.xsmpcat')).toString(), { documentUri: 'test.xsmpcat' });

        expect(
            checkDocumentValid(document) ?? document.diagnostics?.map(diagnosticToString)?.join('\n')
            ).toBe(fs.readFileSync(path.resolve(__dirname, 'xsmpcat-validating.expected.txt')).toString().trimEnd());
    });

    test('accepts shorthand multiplicities', async () => {
        document = await parse(`
            catalogue test

            namespace demo
            {
                /** @uuid ad9c7c0c-173b-4341-8be3-21ed8725896a */
                public interface ILogger
                {
                }

                /** @uuid 95f0dc0d-b10a-45fa-8160-3bb523fcad78 */
                public model Sensor
                {
                }

                /** @uuid 749f7302-7fa4-41b8-9185-b2d047c0a4c2 */
                public model Platform
                {
                    container demo.Sensor* sensors
                    reference demo.ILogger+ loggers
                }
            }
        `, { documentUri: 'shorthand-multiplicity.xsmpcat' });

        expect(checkDocumentValid(document)).toBeUndefined();
        expect((document.diagnostics ?? []).filter(d => d.severity === DiagnosticSeverity.Error)).toHaveLength(0);
    });

    test('does not duplicate unresolved enumeration literal diagnostics with a generic invalid element error', async () => {
        document = await parse(`
            catalogue test

            namespace demo
            {
                /** @uuid 3ca6b13b-7fc6-4e4a-a13d-67d30ce5bc51 */
                public enum Mode
                {
                    Standby = 0
                }

                /** @uuid 275c3ec4-f884-4b33-a4dc-e3d3ebcb4fcc */
                public struct UsesMode
                {
                    field demo.Mode mode = demo.Mode.Standby1
                }
            }
        `, { documentUri: 'unresolved-enum-literal.xsmpcat' });

        const errorMessages = (document.diagnostics ?? [])
            .filter(diagnostic => diagnostic.severity === DiagnosticSeverity.Error)
            .map(diagnostic => diagnostic.message);

        expect(errorMessages).toContain(`Could not resolve reference to ConstantOrEnumerationLiteral named 'demo.Mode.Standby1'.`);
        expect(errorMessages).not.toContain('Invalid element.');
    });

});

function checkDocumentValid(document: LangiumDocument): string | undefined {
    return document.parseResult.parserErrors.length && s`
        Parser errors: ${document.parseResult.parserErrors.map(e => e.message).join('\n  ')}
    `
        || document.parseResult.value === undefined && `ParseResult is 'undefined'.`
        || !isCatalogue(document.parseResult.value) && `Root AST object is a ${document.parseResult.value.$type}, expected a '${Catalogue}'.`
        || undefined;
}

function diagnosticToString(d: Diagnostic) {
    return `[${d.range.start.line}:${d.range.start.character}..${d.range.end.line}:${d.range.end.character}]: ${d.message}`;
}
