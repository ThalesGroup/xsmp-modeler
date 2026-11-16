import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast';
import { SmpGenerator, xsmpContributionPackage } from '@xsmp/tool-smp';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { generateDocuments } from '../../xsmp/test/generation-test-utils.js';
import { assertXmlConformsToXsd, hasXmllint, type SmpStandard } from './xsd-test-utils.js';

let services: ReturnType<typeof createXsmpServices>;
let parse: ReturnType<typeof parseHelper<ast.Catalogue>>;
let parseProject: ReturnType<typeof parseHelper<ast.Project>>;
const documents: LangiumDocument[] = [];
const directories: string[] = [];
const diagnostic = 'SMP export requires a default value for attribute types.';

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    const registration = await services.shared.ContributionRegistry.registerBuiltinPackages([xsmpContributionPackage]);
    expect(registration.failures).toEqual([]);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
    parse = parseHelper<ast.Catalogue>(services.xsmpcat);
    parseProject = parseHelper<ast.Project>(services.xsmpproject);
});

afterEach(async () => {
    await clearDocuments(services.shared, documents.splice(0));
    for (const directory of directories.splice(0)) {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

async function fixture(standard: SmpStandard, useSmp: boolean, valueType = 'Bool', defaultValue?: string) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-attribute-default-'));
    directories.push(directory);
    fs.mkdirSync(path.join(directory, 'src'));
    const project = await parseProject(`project "Attributes" using "${standard}"
${useSmp ? 'tool "smp"' : ''}
source "src"`, { documentUri: URI.file(path.join(directory, 'xsmp.project')).toString() });
    const document = await parse(`catalogue Attributes
namespace ns {
    /** @uuid 33000000-0000-4000-8000-000000000001
     * @usage Model
     */
    public attribute ${valueType} Tag${defaultValue === undefined ? '' : ` = ${defaultValue}`}
    /** @uuid 33000000-0000-4000-8000-000000000002 */
    @Tag(${valueType === 'Bool' ? 'true' : '7'})
    public model Model {}
}`, { documentUri: URI.file(path.join(directory, 'src', 'Attributes.xsmpcat')).toString() });
    const projectDocuments: LangiumDocument[] = [project, document];
    documents.push(...projectDocuments);
    await services.shared.workspace.DocumentBuilder.build(projectDocuments, { validation: true });
    expect(project.diagnostics?.filter(d => d.severity === 1)).toEqual([]);
    expect(document.parseResult.lexerErrors).toHaveLength(0);
    expect(document.parseResult.parserErrors).toHaveLength(0);
    return { directory, document, generator: new SmpGenerator(services.shared) };
}

describe.each(['ECSS_SMP_2020', 'ECSS_SMP_2025'] as const)('SMP attribute defaults (%s)', standard => {
    test('warns about the missing default when the SMP contribution is active', async () => {
        const { document } = await fixture(standard, true);
        expect(document.diagnostics?.filter(d => d.severity === 1)).toEqual([]);
        expect(document.diagnostics?.filter(d => d.message === diagnostic)).toEqual([
            expect.objectContaining({ severity: 2 }),
        ]);
    });

    test('keeps attributes with explicit values valid without SMP export', async () => {
        const { document } = await fixture(standard, false);
        expect(document.diagnostics?.filter(d => d.severity === 1)).toEqual([]);
        expect(document.diagnostics?.some(d => d.message === diagnostic)).toBe(false);
    });

    test('generates the catalogue despite the warning without inventing a default', async () => {
        const { directory, document, generator } = await fixture(standard, true);
        const catalogue = document.parseResult.value;
        expect(document.diagnostics?.filter(d => d.severity === 1)).toEqual([]);
        await generateDocuments(generator, [catalogue], URI.file(directory));
        const xml = fs.readFileSync(path.join(directory, 'smdl-gen', 'Attributes.smpcat'), 'utf8');
        expect(xml).toContain('Name="Tag"');
        expect(xml).not.toContain('<Default');
    });

    test.each([
        { type: 'Bool', value: 'false' },
        { type: 'Int32', value: '0' },
    ])('preserves an explicit $type default of $value', async ({ type, value }) => {
        const { directory, document, generator } = await fixture(standard, true, type, value);
        expect(document.diagnostics?.filter(d => d.severity === 1)).toEqual([]);
        expect(document.diagnostics?.some(d => d.message === diagnostic)).toBe(false);
        await generateDocuments(generator, [document.parseResult.value], URI.file(directory));
        const cataloguePath = path.join(directory, 'smdl-gen', 'Attributes.smpcat');
        expect(fs.readFileSync(cataloguePath, 'utf8')).toContain(`<Default xsi:type="Types:${type}Value" Value="${value}"/>`);
    });

    test.skipIf(!hasXmllint())('exports an explicit default conforming to the XSD', async () => {
        const { directory, document, generator } = await fixture(standard, true, 'Bool', 'false');
        await generateDocuments(generator, [document.parseResult.value], URI.file(directory));
        assertXmlConformsToXsd(path.join(directory, 'smdl-gen', 'Attributes.smpcat'), 'catalogue', standard);
    });
});
