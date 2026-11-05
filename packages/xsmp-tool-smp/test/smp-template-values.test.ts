import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast';
import { SmpGenerator } from '@xsmp/tool-smp';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

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
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-smp-templates-'));
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

describe('SMP string template serialization', () => {
    test('preserves complete string template parameters and arguments', async () => {
        const dir = await createProject('ECSS_SMP_2025');
        const uri = (name: string) => URI.file(path.join(dir, 'src', name)).toString();
        const catalogue = await parseHelper<ast.Catalogue>(services.xsmpcat)(`catalogue Values
namespace demo {
    /** @uuid 38982e8f-672f-4b93-8769-52d3a6272a28 */
    public model Child {}
    /** @uuid f60e272b-519a-4c18-8a65-2ed7bcb68a74 */
    public model Root { container Child[*] children }
}`, { documentUri: uri('values.xsmpcat') });
        const parseAssembly = parseHelper<ast.Assembly>(services.xsmpasb);
        const inner = await parseAssembly('assembly <Label = "abc", Empty = "", Single = "x"> Inner\nRoot: demo.Child {}', { documentUri: uri('inner.xsmpasb') });
        const outer = await parseAssembly('assembly Outer\nRoot: demo.Root { children += Child: Inner<Label = "abc", Empty = "", Single = "x"> }', { documentUri: uri('outer.xsmpasb') });
        const schedule = await parseHelper<ast.Schedule>(services.xsmpsed)('schedule <Label = "abc", Empty = "", Single = "x"> TemplateSchedule', { documentUri: uri('values.xsmpsed') });
        documents.push(catalogue, inner, outer, schedule);
        await validateDocuments();
        const generator = new SmpGenerator(services.shared);
        const xmls = [
            await generator.doGenerateAssembly(inner.parseResult.value, undefined),
            await generator.doGenerateAssembly(outer.parseResult.value, undefined),
            await generator.doGenerateSchedule(schedule.parseResult.value, undefined),
        ];
        for (const xml of xmls) {
            expect(xml).toContain('Name="Label" Value="abc"');
            expect(xml).toContain('Name="Empty" Value=""');
            expect(xml).toContain('Name="Single" Value="x"');
        }
    });
});
