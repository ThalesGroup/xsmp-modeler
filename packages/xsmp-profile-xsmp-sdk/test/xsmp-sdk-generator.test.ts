import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { AstUtils, type LangiumDocument, URI } from 'langium';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import * as ast from 'xsmp/ast';
import { setClangFormat, setGeneratedBy } from 'xsmp/generator';
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
