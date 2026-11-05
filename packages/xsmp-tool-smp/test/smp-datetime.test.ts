import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast';
import { getValueAs, PTK } from '@xsmp/core/utils';
import { SmpGenerator } from '@xsmp/tool-smp';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { assertXmlConformsToXsd, hasXmllint } from './xsd-test-utils.js';

let services: ReturnType<typeof createXsmpServices>;
const documents: LangiumDocument[] = [];
const tempDirs: string[] = [];

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

afterEach(async () => {
    await clearDocuments(services.shared, documents.splice(0));
    for (const dir of tempDirs.splice(0)) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

async function createProject(standard: 'ECSS_SMP_2020' | 'ECSS_SMP_2025') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-smp-values-'));
    tempDirs.push(dir);
    fs.mkdirSync(path.join(dir, 'src'));
    const project = await parseHelper<ast.Project>(services.xsmpproject)(
        `project 'Values' using '${standard}'\nsource 'src'\n`,
        { documentUri: URI.file(path.join(dir, 'xsmp.project')).toString() },
    );
    documents.push(project);
    return dir;
}

async function validateDocuments() {
    await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });
    for (const document of documents) {
        expect(document.parseResult.parserErrors).toEqual([]);
        expect(document.diagnostics?.filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
    }
}

describe('SMP DateTime serialization', () => {
    test.each(['ECSS_SMP_2020', 'ECSS_SMP_2025'] as const)('uses the SMP epoch and valid fractions for %s', async standard => {
        const dir = await createProject(standard);
        const catalogue = await parseHelper<ast.Catalogue>(services.xsmpcat)(`catalogue Values
namespace demo {
    /** @uuid bcc68197-9213-412a-9fd7-6ef9f7383220 */
    public array Dates = Smp.DateTime[3]
    /** @uuid cc70dd68-3bd2-40e9-992e-d2a505d31b86 */
    public model Model {
        field Smp.DateTime zero = 0
        field Smp.DateTime before = -1
        field Smp.DateTime after = 1
        field Smp.DateTime january = "2024-01-01T00:00:00Z"
        field Smp.DateTime precision = "2024-01-01T00:00:00.123456789Z"
        field Dates dates = { -1, 0, 1 }
    }
}`, { documentUri: URI.file(path.join(dir, 'src', 'values.xsmpcat')).toString() });
        documents.push(catalogue);
        await validateDocuments();
        const fields = new Map(AstUtils.streamAllContents(catalogue.parseResult.value).filter(ast.isField).map(field => [field.name, field]));
        expect(getValueAs(fields.get('january')!.default, PTK.DateTime)?.getValue()).toBe(757_339_200_000_000_000n);
        const xml = await new SmpGenerator(services.shared).doGenerateCatalogue(catalogue.parseResult.value, undefined);
        expect(xml).toContain('Value="2000-01-01T12:00:00.000000000Z"');
        expect(xml).toContain('Value="2000-01-01T11:59:59.999999999Z"');
        expect(xml).toContain('Value="2000-01-01T12:00:00.000000001Z"');
        expect(xml).toContain('Value="2024-01-01T00:00:00.000000000Z"');
        expect(xml).toContain('Value="2024-01-01T00:00:00.123456789Z"');
        expect(xml).toContain('<ItemValue Value="2000-01-01T11:59:59.999999999Z"/>');
        const xmlPath = path.join(dir, 'values.smpcat');
        fs.writeFileSync(xmlPath, xml);
        if (hasXmllint()) {
            assertXmlConformsToXsd(xmlPath, 'catalogue', standard);
        }
    });

});
