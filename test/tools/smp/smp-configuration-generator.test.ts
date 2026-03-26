import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { expandToString as s } from 'langium/generate';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from '../../../src/language/xsmp-module.js';
import { Catalogue, Configuration, Project, isConfiguration } from '../../../src/language/generated/ast.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SmpGenerator } from '../../../src/language/tools/smp/generator.js';
import { setGeneratedBy } from '../../../src/language/generator/generator.js';

let services: ReturnType<typeof createXsmpServices>;
let parseProject: ReturnType<typeof parseHelper<Project>>;
let parseCatalogue: ReturnType<typeof parseHelper<Catalogue>>;
let parseConfiguration: ReturnType<typeof parseHelper<Configuration>>;
const documents: LangiumDocument[] = [];
const tempDirs: string[] = [];

const catalogueSource = `catalogue Demo

namespace demo
{
    public array IntPair = Smp.Int32[2]

    public struct Counters
    {
        field Smp.Int32 count
        field Smp.Bool enabled
        field IntPair values
    }

    public model Child
    {
        field Smp.Int32 value
    }

    public model Root
    {
        field Counters state
        field Smp.Bool flag
        field Smp.Float64 ratio
        container Child child
    }
}
`;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parseProject = parseHelper<Project>(services.xsmpproject);
    parseCatalogue = parseHelper<Catalogue>(services.xsmpcat);
    parseConfiguration = parseHelper<Configuration>(services.xsmpcfg);

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

describe('SMP configuration generator tests', () => {
    test('test configuration', async () => {
        const generator = new SmpGenerator(services.shared);
        const document = await parseFixture('test.xsmpcfg');
        setGeneratedBy(false);

        const actualXml = checkDocumentValid(document) ??
            await generator.doGenerateConfiguration(document.parseResult.value, undefined);

        const expectedPath = path.resolve(__dirname, 'test.smpcfg');
        if (process.env.UPDATE_EXPECTATIONS === '1') {
            fs.writeFileSync(expectedPath, actualXml);
        }

        expect(actualXml).toBe(fs.readFileSync(expectedPath).toString());
    });

    test('writes configuration file to disk before returning', async () => {
        const generator = new SmpGenerator(services.shared);
        const document = await parseFixture('write-test.xsmpcfg');
        setGeneratedBy(false);

        const parsed = checkDocumentValid(document);
        expect(parsed).toBeUndefined();

        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-smp-configuration-'));
        try {
            const projectUri = URI.file(tmpDir);
            const expected = await generator.doGenerateConfiguration(document.parseResult.value, undefined);

            await generator.generateConfiguration(document.parseResult.value, projectUri, undefined);

            const configurationPath = path.join(tmpDir, 'smdl-gen', 'write-test.smpcfg');
            expect(fs.existsSync(configurationPath)).toBe(true);
            expect(fs.readFileSync(configurationPath).toString()).toBe(expected);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});

async function parseFixture(fileName: string): Promise<LangiumDocument<Configuration>> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-smp-configuration-fixture-'));
    tempDirs.push(tempDir);

    const projectDocument = await parseProject(
        `project "Demo" using "ECSS_SMP_2025"
source "src"
`,
        { documentUri: URI.file(path.join(tempDir, 'xsmp.project')).toString() }
    );
    const catalogueDocument = await parseCatalogue(catalogueSource, {
        documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmpcat')).toString(),
    });
    const configurationDocument = await parseConfiguration(fs.readFileSync(path.resolve(__dirname, 'test.xsmpcfg')).toString(), {
        documentUri: URI.file(path.join(tempDir, 'src', fileName)).toString(),
    });

    documents.push(projectDocument, catalogueDocument, configurationDocument);
    expect(projectDocument.parseResult.parserErrors).toHaveLength(0);
    expect(catalogueDocument.parseResult.parserErrors).toHaveLength(0);
    expect(configurationDocument.parseResult.parserErrors).toHaveLength(0);

    return configurationDocument;
}

function checkDocumentValid(document: LangiumDocument): string | undefined {
    return document.parseResult.parserErrors.length && s`
        Parser errors:
          ${document.parseResult.parserErrors.map(e => e.message).join('\n  ')}
    `
        || document.parseResult.value === undefined && `ParseResult is 'undefined'.`
        || !isConfiguration(document.parseResult.value) && `Root AST object is a ${document.parseResult.value.$type}, expected a '${Configuration}'.`
        || undefined;
}
