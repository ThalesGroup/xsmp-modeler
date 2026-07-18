import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument, URI } from "langium";
import { expandToString as s } from "langium/generate";
import { clearDocuments, parseHelper, type ParseHelperOptions } from "langium/test";
import { DiagnosticSeverity, type Diagnostic } from "vscode-languageserver-types";
import { createXsmpServices } from '@xsmp/core';
import { Assembly, Catalogue, Project, isCatalogue } from '@xsmp/core/ast-partial';
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

    test('rejects component references in ECSS_SMP_2020', async () => {
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
                }
            }
        `, 'ECSS_SMP_2020');

        const messages = (projectDocument.diagnostics ?? []).map(diagnostic => diagnostic.message);
        expect(messages).toEqual(expect.arrayContaining([
            'A Reference in ECSS_SMP_2020 shall target an Interface.',
        ]));
    });

    test('accepts component references in ECSS_SMP_2025', async () => {
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
                }
            }
        `, 'ECSS_SMP_2025');

        expect((projectDocument.diagnostics ?? []).filter(d => d.severity === DiagnosticSeverity.Error)).toHaveLength(0);
    });

    test('allows non-ValueType fields in composite types with a warning', async () => {
        document = await parse(`
            catalogue FieldWarning

            namespace fieldWarning
            {
                /** @uuid cff269a6-8e4e-4eb9-a0d9-841e3a690c70 */
                public interface IBus
                {
                }

                /** @uuid 3aa1b85b-3ffb-4fe7-a8aa-0f0c449d3ec1 */
                public model Child
                {
                }

                /** @uuid 0509d41d-4073-4ed1-bda8-28dd1bfb1968 */
                public struct Packet
                {
                    field fieldWarning.IBus bus
                }

                /** @uuid d54c461f-f312-455b-b15a-3f83d809cc24 */
                public class Holder
                {
                    field fieldWarning.Child child
                }
            }
        `, { documentUri: 'field-language-type-warning.xsmpcat' });

        const diagnostics = document.diagnostics ?? [];
        expect(diagnostics.filter(d => d.severity === DiagnosticSeverity.Error)).toHaveLength(0);
        expect(diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning).map(d => d.message)).toEqual(expect.arrayContaining([
            'Field type is not a ValueType. This is allowed outside Model/Service but is not SMP compatible.',
            'Field type is not a ValueType. This is allowed outside Model/Service but is not SMP compatible.',
        ]));
    });

    test('rejects direct non-ValueType fields in models and services', async () => {
        document = await parse(`
            catalogue FieldDirect

            namespace fieldDirect
            {
                /** @uuid de0534bb-8077-4028-a713-34629816c8b4 */
                public interface IBus
                {
                }

                /** @uuid 90c060f8-4a3b-49a5-b021-a544890b84e2 */
                public model Root
                {
                    field fieldDirect.IBus bus
                }
            }
        `, { documentUri: 'field-language-type-model-error.xsmpcat' });

        const errorMessages = (document.diagnostics ?? [])
            .filter(d => d.severity === DiagnosticSeverity.Error)
            .map(d => d.message);

        expect(errorMessages).toContain('A Field of a Model or Service shall have a ValueType type.');
    });

    test('rejects direct String8 fields in models and services', async () => {
        document = await parse(`
            catalogue FieldString8Direct

            namespace fieldString8Direct
            {
                /** @uuid 1a9c318b-3e5c-4b8a-9a3b-6e6f0a2a9e01 */
                public model Root
                {
                    field Smp.String8 name
                }
            }
        `, { documentUri: 'field-string8-model-error.xsmpcat' });

        const errorMessages = (document.diagnostics ?? [])
            .filter(d => d.severity === DiagnosticSeverity.Error)
            .map(d => d.message);

        expect(errorMessages).toContain('A Field of a Model or Service shall not use the String8 type.');
    });

    test('rejects fields of an array-of-String8 type in models and services', async () => {
        document = await parse(`
            catalogue FieldString8ArrayDirect

            namespace fieldString8ArrayDirect
            {
                /** @uuid ed574447-6b50-48a7-a595-574ee4196294 */
                public array Messages = Smp.String8[4]

                /** @uuid 1a9c318b-3e5c-4b8a-9a3b-6e6f0a2a9e06 */
                public model Root
                {
                    field fieldString8ArrayDirect.Messages messages
                }
            }
        `, { documentUri: 'field-string8-array-model-error.xsmpcat' });

        const errorMessages = (document.diagnostics ?? [])
            .filter(d => d.severity === DiagnosticSeverity.Error)
            .map(d => d.message);

        expect(errorMessages).toContain('A Field of a Model or Service shall not use the String8 type.');
    });

    test('correctly flags a String8 field shared by two sibling branches and reused directly elsewhere', async () => {
        // Regression test for a caching hazard: Outer has two sibling fields (viaB, viaC) that both
        // transitively reach the SAME shared struct (Packet, containing a String8 field) within one
        // top-level traversal. A naive cache that memoizes intermediate/nested types visited along the
        // way (not just the field's own directly-declared type) can end up permanently caching an
        // incomplete result for one of the shared branches, which would then silently suppress the
        // diagnostic for `direct` and `viaCDirect` below, which reference the same nested types directly.
        document = await parse(`
            catalogue FieldString8Diamond

            namespace fieldString8Diamond
            {
                /** @uuid 8cd9004c-aacb-4d9a-b8a5-23ab699e935d */
                public struct Packet
                {
                    field Smp.String8 label
                }

                /** @uuid b16aa34d-b3e9-4b66-9bdc-5f8604091c0c */
                public struct WrapperB
                {
                    field fieldString8Diamond.Packet viaB
                }

                /** @uuid f2ad730a-bef5-47bb-ac06-397e422506e9 */
                public struct WrapperC
                {
                    field fieldString8Diamond.Packet viaC
                }

                /** @uuid 5cba6a1c-33df-461b-8211-6ba8f5f5b7f6 */
                public struct Outer
                {
                    field fieldString8Diamond.WrapperB b
                    field fieldString8Diamond.WrapperC c
                }

                /** @uuid 4c6cadcb-d3e5-4f32-9e41-0f35d574cdca */
                public model Root
                {
                    field fieldString8Diamond.Outer wide
                    field fieldString8Diamond.WrapperC viaCDirect
                    field fieldString8Diamond.Packet direct
                }
            }
        `, { documentUri: 'field-string8-diamond-error.xsmpcat' });

        const errors = (document.diagnostics ?? [])
            .filter(d => d.severity === DiagnosticSeverity.Error && d.message === 'A Field of a Model or Service shall not use a type containing a String8 field.');

        expect(errors).toHaveLength(3);
        for (const error of errors) {
            expect(error.relatedInformation?.[0]?.message).toContain('label');
        }
    });

    test('rejects model fields whose value type contains a String8 field', async () => {
        document = await parse(`
            catalogue FieldString8Transitive

            namespace fieldString8Transitive
            {
                /** @uuid 2b8b6a0c-4f5d-4c9a-8b1a-7f6f0a2a9e02 */
                public struct Packet
                {
                    field Smp.String8 label
                }

                /** @uuid 3c9c7b1d-5a6e-4d0b-9c2b-8a7a0b3a9e03 */
                public struct Envelope
                {
                    field fieldString8Transitive.Packet packet
                }

                /** @uuid 4d0d8c2e-6b7f-4e1c-ad3c-9b8b0c4a9e04 */
                public model Root
                {
                    field fieldString8Transitive.Envelope envelope
                }
            }
        `, { documentUri: 'field-string8-transitive-model-error.xsmpcat' });

        const errors = (document.diagnostics ?? [])
            .filter(d => d.severity === DiagnosticSeverity.Error && d.message === 'A Field of a Model or Service shall not use a type containing a String8 field.');

        expect(errors).toHaveLength(1);
        expect(errors[0].relatedInformation?.[0]?.message).toContain('label');
    });

    test('warns on direct String8 fields in structs and classes', async () => {
        document = await parse(`
            catalogue FieldString8StructWarning

            namespace fieldString8StructWarning
            {
                /** @uuid 5e1d9d3f-7c8f-4f2d-be4d-ac9c1d5a9e05 */
                public struct Packet
                {
                    field Smp.String8 label
                }

                /** @uuid 6f2eae40-8d90-403e-cf5e-bdad2e6b9f06 */
                public class Envelope
                {
                    field Smp.String8 tag
                }
            }
        `, { documentUri: 'field-string8-struct-warning.xsmpcat' });

        const diagnostics = document.diagnostics ?? [];
        expect(diagnostics.filter(d => d.severity === DiagnosticSeverity.Error)).toHaveLength(0);
        expect(diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning).map(d => d.message)).toEqual(expect.arrayContaining([
            'Field type is String8. This is allowed outside Model/Service but is not SMP compatible.',
            'Field type is String8. This is allowed outside Model/Service but is not SMP compatible.',
        ]));
    });

    test('warns on fields of an array-of-String8 type in structs and classes', async () => {
        document = await parse(`
            catalogue FieldString8ArrayWarning

            namespace fieldString8ArrayWarning
            {
                /** @uuid 18071710-ba26-40ff-bf1b-7afda003e66d */
                public array Messages = Smp.String8[4]

                /** @uuid 6f2eae40-8d90-403e-cf5e-bdad2e6b9f07 */
                public struct Log
                {
                    field fieldString8ArrayWarning.Messages messages
                }
            }
        `, { documentUri: 'field-string8-array-struct-warning.xsmpcat' });

        const diagnostics = document.diagnostics ?? [];
        expect(diagnostics.filter(d => d.severity === DiagnosticSeverity.Error)).toHaveLength(0);
        expect(diagnostics.filter(d => d.severity === DiagnosticSeverity.Warning).map(d => d.message)).toContain(
            'Field type is String8. This is allowed outside Model/Service but is not SMP compatible.'
        );
    });

    test('warns on struct fields whose value type transitively contains a String8 field', async () => {
        document = await parse(`
            catalogue FieldString8TransitiveWarning

            namespace fieldString8TransitiveWarning
            {
                /** @uuid 7a3fbf51-9ea1-414f-d06f-cebe3f7ca017 */
                public struct Packet
                {
                    field Smp.String8 label
                }

                /** @uuid 8b40c062-af02-425f-e17f-dfcf408db128 */
                public struct Envelope
                {
                    field fieldString8TransitiveWarning.Packet packet
                }
            }
        `, { documentUri: 'field-string8-transitive-struct-warning.xsmpcat' });

        const warnings = (document.diagnostics ?? [])
            .filter(d => d.severity === DiagnosticSeverity.Warning && d.message === 'Field type contains a String8 field. This is allowed outside Model/Service but is not SMP compatible.');

        expect(warnings).toHaveLength(1);
        expect(warnings[0].relatedInformation?.[0]?.message).toContain('label');
    });

    test('rejects model fields whose value type contains non-ValueType fields', async () => {
        document = await parse(`
            catalogue FieldTransitive

            namespace fieldTransitive
            {
                /** @uuid 6dac01fd-5ba3-462e-b7ff-f5bf724dd2cf */
                public interface IBus
                {
                }

                /** @uuid d2e23c63-5926-4605-83fd-20a64834f18b */
                public struct Packet
                {
                    field fieldTransitive.IBus bus
                }

                /** @uuid f20cb753-04f0-49da-a940-4fc13755c5c8 */
                public struct Envelope
                {
                    field fieldTransitive.Packet packet
                }

                /** @uuid 83f46138-d276-4a66-b942-044306aa4eb6 */
                public array PacketArray = fieldTransitive.Packet[1]

                /** @uuid bbb614b0-36af-405d-a3c6-79adbf4462d6 */
                public model Root
                {
                    field fieldTransitive.Envelope envelope
                    field fieldTransitive.PacketArray packets
                }
            }
        `, { documentUri: 'field-language-type-transitive-error.xsmpcat' });

        const errors = (document.diagnostics ?? [])
            .filter(d => d.severity === DiagnosticSeverity.Error && d.message === 'A Field of a Model or Service shall not use a type containing non-ValueType fields.');

        expect(errors).toHaveLength(2);
        expect(errors[0].relatedInformation?.[0]?.message).toContain('bus');
    });

    test('rejects nested and inherited non-ValueType fields used by models', async () => {
        document = await parse(`
            catalogue FieldNestedInherited

            namespace fieldNested
            {
                /** @uuid f3fba50e-b8b1-47be-9956-0bcd95a6b22a */
                public interface IBus
                {
                }

                /** @uuid 19335562-7255-42a4-a29b-e68b8f60db6c */
                public struct C
                {
                    field fieldNested.IBus bus
                }

                /** @uuid f85942da-6f59-4a7d-84ef-4562291926d8 */
                public struct B
                {
                    field fieldNested.C c
                }

                /** @uuid 908368c7-503f-43bc-8a88-ecbb336bd05f */
                public struct A
                {
                    field fieldNested.B b
                }

                /** @uuid ef3d0da2-9075-4f81-b335-c48ad3dd4597 */
                public class Base
                {
                    field fieldNested.IBus inheritedBus
                }

                /** @uuid c0dab4a1-6dc1-4a62-b51d-73854b1b9e3b */
                public class Derived extends fieldNested.Base
                {
                }

                /** @uuid d11cd831-a513-45d4-9c7f-6a58824437f6 */
                public model Root
                {
                    field fieldNested.A nested
                    field fieldNested.Derived derived
                }
            }
        `, { documentUri: 'field-language-type-nested-inherited-error.xsmpcat' });

        const errors = (document.diagnostics ?? [])
            .filter(d => d.severity === DiagnosticSeverity.Error && d.message === 'A Field of a Model or Service shall not use a type containing non-ValueType fields.');

        expect(errors).toHaveLength(2);
        expect(errors.some(error => error.relatedInformation?.[0]?.message.includes('inheritedBus'))).toBe(true);
    });

    test('keeps value-only composite fields valid in models', async () => {
        document = await parse(`
            catalogue FieldValueOnly

            namespace valueOnly
            {
                /** @uuid 63fdb001-0fc8-476f-8569-73217b5e2c0f */
                public enum Mode
                {
                    Off = 0,
                    On = 1
                }

                /** @uuid 4e828d3b-e639-4c99-81f4-2bd4632a9916 */
                public struct Packet
                {
                    field valueOnly.Mode mode
                }

                /** @uuid 5f8f3932-241c-4b2f-8a6f-d6a7882b3765 */
                public struct Envelope
                {
                    field valueOnly.Packet packet
                }

                /** @uuid 4c17f9ff-0b20-47cf-9f54-6d4ee23e9ed8 */
                public model Root
                {
                    field valueOnly.Envelope envelope
                }
            }
        `, { documentUri: 'field-language-type-value-only-valid.xsmpcat' });

        expect((document.diagnostics ?? []).filter(d => d.severity === DiagnosticSeverity.Error)).toHaveLength(0);
        expect((document.diagnostics ?? []).filter(d => d.severity === DiagnosticSeverity.Warning).map(d => d.message)).not.toContain(
            'Field type is not a ValueType. This is allowed outside Model/Service but is not SMP compatible.',
        );
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
