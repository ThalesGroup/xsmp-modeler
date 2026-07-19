import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { type LangiumDocument, URI } from 'langium';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { EsaCdkGenerator } from '@xsmp/profile-esa-cdk';
import * as ast from '@xsmp/core/ast';
import { setClangFormat, setGeneratedBy } from '@xsmp/core/generator';
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

beforeAll(async () => {
    context = await createProfileGeneratorTestContext();
});

afterEach(async () => {
    setClangFormat(true);
    setGeneratedBy(true);
    await cleanupProfileGeneratorTestContext(context);
});

describe('@xsmp/profile-esa-cdk generator', () => {
    test('generates the expected C++ tree', async () => {
        const document = await parseProfileGeneratorFixture(context);
        const generator = new EsaCdkGenerator(context.services.shared);
        setClangFormat(false);
        setGeneratedBy(false);

        const outputDir = await generateProfileTree(context, generator, document, 'esa-cdk-generator-');
        assertGeneratedTree(outputDir, path.resolve(__dirname, 'expected', 'generator-cpp'));
    });

    test('documents why an Operation is not published/invokable instead of silently dropping it', async () => {
        const document = await parseProfileGeneratorSource(`
            catalogue EsaCdkInvokable

            namespace demo
            {
                /** @uuid c990f25f-1f55-4ae8-9124-e1e9bee9825c */
                public string Label[16]

                /** @uuid 7bfd360e-5a85-4278-a2be-44cb83ac3ac8 */
                public model Root
                {
                    def void noView()

                    @View(ViewKind.VK_All)
                    def void withStringParam(in demo.Label s)

                    @View(ViewKind.VK_All)
                    def void withOutParam(out Smp.Bool b)

                    @View(ViewKind.VK_All)
                    def void ok(in Smp.Bool b)
                }
            }
        `);
        const generator = new EsaCdkGenerator(context.services.shared);

        setClangFormat(false);
        setGeneratedBy(false);
        const outputDir = await generateProfileTree(context, generator, document, 'esa-cdk-invokable-generator-');
        const generatedSource = fs.readFileSync(path.join(outputDir, 'src-gen', 'demo', 'RootGen.cpp'), 'utf-8');

        expect(generatedSource).not.toContain('"noView", // Name');
        expect(generatedSource).not.toContain('"withStringParam", // Name');
        expect(generatedSource).not.toContain('"withOutParam", // Name');
        expect(generatedSource).toContain('"ok", // Name');
        expect(generatedSource).toContain('// WARNING: Operation noView is not invokable: it has no @View attribute.');
        expect(generatedSource).toContain("// WARNING: Operation withStringParam is not invokable: its 's' parameter is of a String type, which is not supported for dynamic invocation.");
        expect(generatedSource).toContain("// WARNING: Operation withOutParam is not invokable: its 'b' out parameter is not supported for dynamic invocation (only 'in' parameters are supported).");
    });
});

async function parseProfileGeneratorSource(source: string): Promise<LangiumDocument<ast.Catalogue>> {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'esa-cdk-generator-source-'));
    context.tempDirs.push(workspaceDir);
    fs.mkdirSync(path.join(workspaceDir, 'src'), { recursive: true });

    const projectDocument = await context.parseProject(`project 'esa-cdk-generator-source' using 'ECSS_SMP_2025'\nsource 'src'\n`, {
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
