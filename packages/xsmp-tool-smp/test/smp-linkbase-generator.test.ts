import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { expandToString as s } from 'langium/generate';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from 'xsmp';
import * as ast from 'xsmp/ast';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SmpGenerator } from '@xsmp/tool-smp';
import { setGeneratedBy } from 'xsmp/generator';
import { rebuildTestDocuments } from './test-services.js';

let services: ReturnType<typeof createXsmpServices>;
let parseProject: ReturnType<typeof parseHelper<ast.Project>>;
let parseCatalogue: ReturnType<typeof parseHelper<ast.Catalogue>>;
let parseAssembly: ReturnType<typeof parseHelper<ast.Assembly>>;
let parseLinkBase: ReturnType<typeof parseHelper<ast.LinkBase>>;
const documents: LangiumDocument[] = [];
const tempDirs: string[] = [];

const catalogueSource = `catalogue Demo

namespace demo
{
    public event FlagEvent extends Smp.Bool

    public model Child
    {
        input field Smp.Int32 inValue
        output field Smp.Int32 outValue

        eventsink demo.FlagEvent inbound
        eventsource demo.FlagEvent outbound
    }

    public model Root
    {
        output field Smp.Int32 outValue
        container Child child = demo.Child
    }
}
`;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parseProject = parseHelper<ast.Project>(services.xsmpproject);
    parseCatalogue = parseHelper<ast.Catalogue>(services.xsmpcat);
    parseAssembly = parseHelper<ast.Assembly>(services.xsmpasb);
    parseLinkBase = parseHelper<ast.LinkBase>(services.xsmplnk);

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

describe('SMP link base generator tests', () => {
    test('test link base', async () => {
        const generator = new SmpGenerator(services.shared);
        const document = await parseFixture('test.xsmplnk');
        setGeneratedBy(false);

        const actualXml = checkDocumentValid(document) ??
            await generator.doGenerateLinkBase(document.parseResult.value, undefined);

        expect(actualXml.includes('unsafe')).toBe(false);

        const expectedPath = path.resolve(__dirname, 'test.smplnk');
        if (process.env.UPDATE_EXPECTATIONS === '1') {
            fs.writeFileSync(expectedPath, actualXml);
        }

        expect(actualXml).toBe(fs.readFileSync(expectedPath).toString());
    });

    test('preserves templated paths in generated link base XML', async () => {
        const generator = new SmpGenerator(services.shared);
        const document = await parseSource(`link Demo for DemoAsm

/
{
    field link outValue -> {Target}.inValue
}
`, `assembly <Target = "child"> DemoAsm

Root: demo.Root
{
    child += Leaf: demo.Child
}
`);
        setGeneratedBy(false);

        const actualXml = checkDocumentValid(document) ??
            await generator.doGenerateLinkBase(document.parseResult.value, undefined);

        expect(actualXml).toContain('<ClientPath>{Target}.inValue</ClientPath>');
        expect(actualXml.includes('unsafe')).toBe(false);
    });
});

async function parseFixture(fileName: string): Promise<LangiumDocument<ast.LinkBase>> {
    return parseSource(fs.readFileSync(path.resolve(__dirname, fileName)).toString());
}

async function parseSource(source: string, assemblySource?: string, fileName = 'demo.xsmplnk'): Promise<LangiumDocument<ast.LinkBase>> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-smp-linkbase-fixture-'));
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
    const assemblyDocument = assemblySource
        ? await parseAssembly(assemblySource, {
            documentUri: URI.file(path.join(tempDir, 'src', 'demoasm.xsmpasb')).toString(),
        })
        : undefined;
    const linkBaseDocument = await parseLinkBase(source, {
        documentUri: URI.file(path.join(tempDir, 'src', fileName)).toString(),
    });

    documents.push(projectDocument, catalogueDocument, ...(assemblyDocument ? [assemblyDocument] : []), linkBaseDocument);
    expect(projectDocument.parseResult.parserErrors).toHaveLength(0);
    expect(catalogueDocument.parseResult.parserErrors).toHaveLength(0);
    expect(assemblyDocument?.parseResult.parserErrors ?? []).toHaveLength(0);
    expect(linkBaseDocument.parseResult.parserErrors).toHaveLength(0);
    await rebuildTestDocuments(services, [projectDocument, catalogueDocument, ...(assemblyDocument ? [assemblyDocument] : []), linkBaseDocument], false);

    return linkBaseDocument;
}

function checkDocumentValid(document: LangiumDocument): string | undefined {
    return document.parseResult.parserErrors.length && s`
        Parser errors:
          ${document.parseResult.parserErrors.map(error => error.message).join('\n  ')}
    `
        || document.parseResult.value === undefined && `ParseResult is 'undefined'.`
        || !ast.isLinkBase(document.parseResult.value) && `Root AST object is a ${document.parseResult.value.$type}, expected a '${ast.LinkBase.$type}'.`
        || undefined;
}
