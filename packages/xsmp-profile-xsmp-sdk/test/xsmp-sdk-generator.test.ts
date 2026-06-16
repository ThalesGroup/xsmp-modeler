import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { AstUtils, type LangiumDocument, URI } from 'langium';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import * as ast from '@xsmp/core/ast';
import { setClangFormat, setGeneratedBy } from '@xsmp/core/generator';
import { XsmpValueConverter } from '../../xsmp/src/parser/value-converter.js';
import { DiagnosticSeverity } from 'vscode-languageserver';
import {
    assertGeneratedTree,
    cleanupProfileGeneratorTestContext,
    createProfileGeneratorTestContext,
    generateProfileTree,
    parseProfileGeneratorFixture,
    type ProfileGeneratorTestContext,
} from '../../xsmp/test/profile-generator-test-utils.js';
import { rebuildTestDocuments } from '../../xsmp/test/test-services.js';

let context: ProfileGeneratorTestContext;

class TestableXsmpSdkGenerator extends XsmpSdkGenerator {
    canInvoke(element: ast.Invokable): boolean {
        return this.isInvokable(element);
    }
}

beforeAll(async () => {
    context = await createProfileGeneratorTestContext();
});

afterEach(async () => {
    setClangFormat(true);
    setGeneratedBy(true);
    await cleanupProfileGeneratorTestContext(context);
});

describe('@xsmp/profile-xsmp-sdk generator', () => {
    test('generates the expected C++ tree', async () => {
        const document = await parseProfileGeneratorFixture(context);
        const generator = new XsmpSdkGenerator(context.services.shared);
        setClangFormat(false);
        setGeneratedBy(false);

        const outputDir = await generateProfileTree(context, generator, document, 'xsmp-sdk-generator-');
        assertGeneratedTree(outputDir, path.resolve(__dirname, 'expected', 'generator-cpp'));
    });

    test('does not expose operations with non-input String8 parameters as invokable', async () => {
        const document = await parseProfileGeneratorSource(`
            catalogue XsmpSdkInvokable

            namespace demo
            {
                /** @uuid a7d27c20-ea06-4ee4-ab7f-b7fdbb1d7614 */
                public model Root
                {
                    def void implicitInString(Smp.String8 value)
                    def void explicitInString(in Smp.String8 value)
                    def void outString(out Smp.String8 value)
                    def void inoutString(inout Smp.String8 value)
                    def void outBool(out Smp.Bool value)
                    def Smp.String8 returnString()
                    def Smp.Bool returnBool()
                }
            }
        `);
        const generator = new TestableXsmpSdkGenerator(context.services.shared);
        const operations = new Map(
            AstUtils.streamAllContents(document.parseResult.value)
                .filter(ast.isOperation)
                .map(operation => [operation.name, operation])
        );

        expect(generator.canInvoke(operations.get('implicitInString')!)).toBe(true);
        expect(generator.canInvoke(operations.get('explicitInString')!)).toBe(true);
        expect(generator.canInvoke(operations.get('outString')!)).toBe(false);
        expect(generator.canInvoke(operations.get('inoutString')!)).toBe(false);
        expect(generator.canInvoke(operations.get('outBool')!)).toBe(true);
        expect(generator.canInvoke(operations.get('returnString')!)).toBe(false);
        expect(generator.canInvoke(operations.get('returnBool')!)).toBe(true);

        setClangFormat(false);
        setGeneratedBy(false);
        const outputDir = await generateProfileTree(context, generator, document, 'xsmp-sdk-invokable-generator-');
        const generatedSource = fs.readFileSync(path.join(outputDir, 'src-gen', 'demo', 'RootGen.cpp'), 'utf-8');

        expect(generatedSource).toContain('auto p_value = request->GetParameterValue(request->GetParameterIndex("value"));');
        expect(generatedSource).toContain('component->implicitInString(static_cast<::Smp::String8>(p_value));');
        expect(generatedSource).toContain('component->explicitInString(static_cast<::Smp::String8>(p_value));');
        expect(generatedSource).not.toContain('::Xsmp::Request::get<::Smp::String8>');
        expect(generatedSource).not.toContain('Handler for Operation outString');
        expect(generatedSource).not.toContain('Handler for Operation inoutString');
        expect(generatedSource).not.toContain('Handler for Operation returnString');
    });
    // A @unit tag is free user text emitted verbatim into a C++ string literal in the
    // generated _Register_ function. A quote or backslash in it must be escaped, otherwise
    // it terminates the literal and injects tokens into the generated source.
    const HOSTILE_UNIT = 'kg\\m"s';

    function extractUnitLiteral(generated: string): string {
        const match = generated.match(/"((?:[^"\\]|\\.)*)", \/\/ Unit/);
        expect(match, `Unit is not a well-formed C++ string literal in:\n${generated}`).not.toBeNull();
        return new XsmpValueConverter().convertString(`"${match![1]}"`);
    }

    test('escapes the @unit tag in the generated integer registration', async () => {
        const document = await parseProfileGeneratorSource(`
            catalogue UnitEscapingInteger

            namespace demo
            {
                /**
                 * @unit ${HOSTILE_UNIT}
                 * @uuid 11111111-1111-1111-1111-111111111111
                 */
                public integer Measure
            }
        `);
        const generator = new XsmpSdkGenerator(context.services.shared);
        const integer = AstUtils.streamAllContents(document.parseResult.value).find(ast.isInteger)!;

        const generated = (await generator.generateIntegerSourceGen(integer, false))!;

        expect(extractUnitLiteral(generated)).toBe(HOSTILE_UNIT);
    });

    test('escapes the @unit tag in the generated float registration', async () => {
        const document = await parseProfileGeneratorSource(`
            catalogue UnitEscapingFloat

            namespace demo
            {
                /**
                 * @unit ${HOSTILE_UNIT}
                 * @uuid 22222222-2222-2222-2222-222222222222
                 */
                public float Measure
            }
        `);
        const generator = new XsmpSdkGenerator(context.services.shared);
        const float = AstUtils.streamAllContents(document.parseResult.value).find(ast.isFloat)!;

        const generated = (await generator.generateFloatSourceGen(float, false))!;

        expect(extractUnitLiteral(generated)).toBe(HOSTILE_UNIT);
    });
});

async function parseProfileGeneratorSource(source: string): Promise<LangiumDocument<ast.Catalogue>> {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-sdk-generator-source-'));
    context.tempDirs.push(workspaceDir);
    fs.mkdirSync(path.join(workspaceDir, 'src'), { recursive: true });

    const projectDocument = await context.parseProject(`project 'xsmp-sdk-generator-source' using 'ECSS_SMP_2025'\nsource 'src'\n`, {
        documentUri: URI.file(path.join(workspaceDir, 'xsmp.project')).toString(),
    });
    const catalogueDocument = await context.parseCatalogue(source, {
        documentUri: URI.file(path.join(workspaceDir, 'src', 'catalogue.xsmpcat')).toString(),
    });
    context.documents.push(projectDocument, catalogueDocument);

    expect(projectDocument.parseResult.parserErrors).toHaveLength(0);
    expect(catalogueDocument.parseResult.parserErrors).toHaveLength(0);

    await rebuildTestDocuments(context.services, [projectDocument, catalogueDocument]);
    expect(getErrorMessages(projectDocument)).toEqual([]);
    expect(getErrorMessages(catalogueDocument)).toEqual([]);

    return catalogueDocument;
}

function getErrorMessages(document: LangiumDocument): string[] {
    return document.diagnostics?.filter(diagnostic => diagnostic.severity === DiagnosticSeverity.Error)
        .map(diagnostic => diagnostic.message) ?? [];
}
