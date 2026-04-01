import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument, URI } from "langium";
import { expandToString as s } from "langium/generate";
import { clearDocuments, parseHelper, type ParseHelperOptions } from "langium/test";
import { DiagnosticSeverity, type Diagnostic } from "vscode-languageserver-types";
import { createXsmpServices } from 'xsmp';
import { Assembly, Catalogue, Project, isCatalogue } from 'xsmp/ast-partial';
import { rebuildTestDocuments } from '../test-services.js';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

let services: ReturnType<typeof createXsmpServices>;
let parseProject: ReturnType<typeof parseHelper<Project>>;
let parse: ReturnType<typeof parseHelper<Catalogue>>;
let parseAssembly: ReturnType<typeof parseHelper<Assembly>>;
let document: LangiumDocument<Catalogue> | undefined;
const documents: LangiumDocument[] = [];
const tempDirs: string[] = [];

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parseProject = parseHelper<Project>(services.xsmpproject);
    parseAssembly = parseHelper<Assembly>(services.xsmpasb);
    const doParse = parseHelper<Catalogue>(services.xsmpcat);
    parse = (input: string, options?: ParseHelperOptions) => doParse(input, { validation: true, ...options });

    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

afterEach(async () => {
    if (documents.length > 0) {
        await clearDocuments(services.shared, documents.splice(0));
    }
    while (tempDirs.length > 0) {
        fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
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

    test('rejects component references and realizations in ECSS_SMP_2020', async () => {
        const projectDocument = await parseCatalogueInProject(`
            catalogue Demo

            namespace demo
            {
                /** @uuid 5f7c28f2-f0e0-4b7d-96f0-45bbf3f0f140 */
                public interface IBus
                {
                }

                /** @uuid 0d52d6cb-715f-4f37-bde4-d0dcb0531f81 */
                public model Child
                {
                }

                /** @uuid 9f070b9c-4a9f-46f0-9555-5b505fe97f28 */
                public model Root
                {
                    reference demo.Child childRef
                    realization demo.IBus bus
                }
            }
        `, 'ECSS_SMP_2020');

        const messages = (projectDocument.diagnostics ?? []).map(diagnostic => diagnostic.message);
        expect(messages).toEqual(expect.arrayContaining([
            'A Reference in ECSS_SMP_2020 shall target an Interface.',
            'Realization is only available in ECSS_SMP_2025.',
        ]));
    });

    test('accepts component references and realizations in ECSS_SMP_2025', async () => {
        const projectDocument = await parseCatalogueInProject(`
            catalogue Demo

            namespace demo
            {
                /** @uuid 44d7a689-c4a8-4531-b422-c2cf4bd8cc8a */
                public interface IBus
                {
                }

                /** @uuid d66d74aa-db7d-4611-a66b-0e9f6c0f4be6 */
                public model Child
                {
                }

                /** @uuid 0bb8778b-2d90-4a09-ab60-02f0fa56e0a7 */
                public model Root
                {
                    reference demo.Child childRef
                    realization demo.IBus bus
                }
            }
        `, 'ECSS_SMP_2025');

        expect((projectDocument.diagnostics ?? []).filter(d => d.severity === DiagnosticSeverity.Error)).toHaveLength(0);
    });

    test('rejects duplicate document names across document kinds', async () => {
        const projectDocument = await parseCatalogueInProject(`
            catalogue DemoAsm

            namespace demo
            {
                /** @uuid 7a2ca3c8-41e0-4fb8-a9a6-7c0dc16f2982 */
                public model Root
                {
                }
            }
        `, 'ECSS_SMP_2025', `assembly DemoAsm

Root: demo.Root
{
}
`);

        const messages = (projectDocument.diagnostics ?? []).map(diagnostic => diagnostic.message);
        expect(messages).toContain('Duplicated Document name.');
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

async function parseCatalogueInProject(
    source: string,
    standard: 'ECSS_SMP_2020' | 'ECSS_SMP_2025',
    extraAssemblySource?: string,
): Promise<LangiumDocument<Catalogue>> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmpcat-validating-'));
    tempDirs.push(tempDir);

    const projectDocument = await parseProject(
        `project "Demo" using "${standard}"\nsource "src"\n`,
        { documentUri: URI.file(path.join(tempDir, 'xsmp.project')).toString() }
    );
    const catalogueDocument = await parse(source, {
        documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmpcat')).toString(),
    });
    const assemblyDocument = extraAssemblySource
        ? await parseAssembly(extraAssemblySource, {
            documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmpasb')).toString(),
        })
        : undefined;

    documents.push(projectDocument, catalogueDocument, ...(assemblyDocument ? [assemblyDocument] : []));
    await rebuildTestDocuments(services, [projectDocument, catalogueDocument, ...(assemblyDocument ? [assemblyDocument] : [])]);
    return catalogueDocument;
}
