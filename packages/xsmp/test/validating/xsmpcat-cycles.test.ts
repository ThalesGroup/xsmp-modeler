import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { clearDocuments, parseHelper } from 'langium/test';
import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { createXsmpServices } from 'xsmp';
import { Catalogue, Project } from 'xsmp/ast-partial';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { rebuildTestDocuments } from '../test-services.js';

let services: ReturnType<typeof createXsmpServices>;
let parseProject: ReturnType<typeof parseHelper<Project>>;
let parseCatalogue: ReturnType<typeof parseHelper<Catalogue>>;
const documents: LangiumDocument[] = [];
const tempDirs: string[] = [];

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parseProject = parseHelper<Project>(services.xsmpproject);
    parseCatalogue = parseHelper<Catalogue>(services.xsmpcat);

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

describe('Catalogue cycle validation', () => {
    test('reports circular dependencies across two catalogues', async () => {
        const [catalogueA, catalogueB] = await parseCataloguesInProject({
            'a.xsmpcat': `
catalogue A

namespace demo
{
    /** @uuid 11111111-1111-1111-1111-111111111111 */
    public interface IA
    {
    }

    /** @uuid 11111111-1111-1111-1111-111111111112 */
    public model UsesB
    {
        reference demo.IB target
    }
}
`,
            'b.xsmpcat': `
catalogue B

namespace demo
{
    /** @uuid 22222222-2222-2222-2222-222222222221 */
    public interface IB
    {
    }

    /** @uuid 22222222-2222-2222-2222-222222222222 */
    public model UsesA
    {
        reference demo.IA target
    }
}
`,
        });

        expectCycleDiagnostic(catalogueA, 1);
        expectCycleDiagnostic(catalogueB, 1);
    });

    test('reports circular dependencies across three catalogues', async () => {
        const [catalogueA, catalogueB, catalogueC] = await parseCataloguesInProject({
            'a.xsmpcat': `
catalogue A

namespace demo
{
    /** @uuid 33333333-3333-3333-3333-333333333331 */
    public interface IA
    {
    }

    /** @uuid 33333333-3333-3333-3333-333333333332 */
    public model UsesB
    {
        reference demo.IB target
    }
}
`,
            'b.xsmpcat': `
catalogue B

namespace demo
{
    /** @uuid 44444444-4444-4444-4444-444444444441 */
    public interface IB
    {
    }

    /** @uuid 44444444-4444-4444-4444-444444444442 */
    public model UsesC
    {
        reference demo.IC target
    }
}
`,
            'c.xsmpcat': `
catalogue C

namespace demo
{
    /** @uuid 55555555-5555-5555-5555-555555555551 */
    public interface IC
    {
    }

    /** @uuid 55555555-5555-5555-5555-555555555552 */
    public model UsesA
    {
        reference demo.IA target
    }
}
`,
        });

        expectCycleDiagnostic(catalogueA, 2);
        expectCycleDiagnostic(catalogueB, 2);
        expectCycleDiagnostic(catalogueC, 2);
    });
});

async function parseCataloguesInProject(files: Record<string, string>): Promise<LangiumDocument<Catalogue>[]> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmpcat-cycles-'));
    tempDirs.push(tempDir);

    const projectDocument = await parseProject(
        `project "Demo" using "ECSS_SMP_2025"
source "src"
`,
        { documentUri: URI.file(path.join(tempDir, 'xsmp.project')).toString() }
    );

    const catalogueDocuments = await Promise.all(Object.entries(files).map(async ([fileName, content]) => {
        return parseCatalogue(content, {
            documentUri: URI.file(path.join(tempDir, 'src', fileName)).toString(),
        });
    }));

    documents.push(projectDocument, ...catalogueDocuments);
    expect(projectDocument.parseResult.parserErrors).toHaveLength(0);
    for (const document of catalogueDocuments) {
        expect(document.parseResult.parserErrors).toHaveLength(0);
    }
    await rebuildTestDocuments(services, [projectDocument, ...catalogueDocuments]);

    return catalogueDocuments;
}

function expectCycleDiagnostic(document: LangiumDocument<Catalogue>, relatedInformationCount: number): void {
    const diagnostic = document.diagnostics?.find(item => item.message === 'Catalogues shall not have circular dependencies.');
    expect(diagnostic).toBeDefined();
    expect(diagnostic?.relatedInformation).toHaveLength(relatedInformationCount);
}
