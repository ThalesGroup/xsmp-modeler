import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { expandToString as s } from 'langium/generate';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from '../../../src/language/xsmp-module.js';
import { Assembly, Catalogue, Project, isAssembly } from '../../../src/language/generated/ast.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SmpGenerator } from '../../../src/language/tools/smp/generator.js';
import { setGeneratedBy } from '../../../src/language/generator/generator.js';

let services: ReturnType<typeof createXsmpServices>;
let parseProject: ReturnType<typeof parseHelper<Project>>;
let parseCatalogue: ReturnType<typeof parseHelper<Catalogue>>;
let parseAssembly: ReturnType<typeof parseHelper<Assembly>>;
const documents: LangiumDocument[] = [];
const tempDirs: string[] = [];

const catalogueSource = `catalogue Demo

namespace demo
{
    public event FlagEvent extends Smp.Bool

    public model Child
    {
        field Smp.Int32 count
        input field Smp.Int32 inValue
        output field Smp.Int32 outValue

        eventsink demo.FlagEvent inbound
        eventsource demo.FlagEvent outbound
    }

    public model Root
    {
        output field Smp.Int32 outValue
        container Child child = demo.Child

        eventsink demo.FlagEvent inbound
        eventsource demo.FlagEvent outbound
    }
}
`;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parseProject = parseHelper<Project>(services.xsmpproject);
    parseCatalogue = parseHelper<Catalogue>(services.xsmpcat);
    parseAssembly = parseHelper<Assembly>(services.xsmpasb);

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

describe('SMP assembly generator tests', () => {
    test('test assembly', async () => {
        const generator = new SmpGenerator(services.shared);
        const document = await parseFixture('test.xsmpasb');
        setGeneratedBy(false);

        const actualXml = checkDocumentValid(document) ??
            await generator.doGenerateAssembly(document.parseResult.value, undefined);

        expect(actualXml.includes('unsafe')).toBe(false);

        const expectedPath = path.resolve(__dirname, 'test.smpasb');
        if (process.env.UPDATE_EXPECTATIONS === '1') {
            fs.writeFileSync(expectedPath, actualXml);
        }

        expect(actualXml).toBe(fs.readFileSync(expectedPath).toString());
    });

    test('preserves templated instance names and paths in generated assembly XML', async () => {
        const generator = new SmpGenerator(services.shared);
        const document = await parseSource(`assembly <Index = 1, Suffix = "Tail"> Demo

configure Unit{Index}_{Suffix}
{
    count = 1i32
}

Root: demo.Root
{
    child += Unit{Index}_{Suffix}: demo.Child
}
`);
        setGeneratedBy(false);

        const actualXml = checkDocumentValid(document) ??
            await generator.doGenerateAssembly(document.parseResult.value, undefined);

        expect(actualXml).toContain('InstancePath="Unit{Index}_{Suffix}"');
        expect(actualXml).toContain('Name="Unit{Index}_{Suffix}"');
        expect(actualXml.includes('unsafe')).toBe(false);
    });
});

async function parseFixture(fileName: string): Promise<LangiumDocument<Assembly>> {
    return parseSource(fs.readFileSync(path.resolve(__dirname, fileName)).toString(), fileName);
}

async function parseSource(source: string, fileName = 'demo.xsmpasb'): Promise<LangiumDocument<Assembly>> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-smp-assembly-fixture-'));
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
    const assemblyDocument = await parseAssembly(source, {
        documentUri: URI.file(path.join(tempDir, 'src', fileName)).toString(),
    });

    documents.push(projectDocument, catalogueDocument, assemblyDocument);
    expect(projectDocument.parseResult.parserErrors).toHaveLength(0);
    expect(catalogueDocument.parseResult.parserErrors).toHaveLength(0);
    expect(assemblyDocument.parseResult.parserErrors).toHaveLength(0);
    return assemblyDocument;
}

function checkDocumentValid(document: LangiumDocument): string | undefined {
    return document.parseResult.parserErrors.length && s`
        Parser errors:
          ${document.parseResult.parserErrors.map(error => error.message).join('\n  ')}
    `
        || document.parseResult.value === undefined && `ParseResult is 'undefined'.`
        || !isAssembly(document.parseResult.value) && `Root AST object is a ${document.parseResult.value.$type}, expected a '${Assembly}'.`
        || undefined;
}
