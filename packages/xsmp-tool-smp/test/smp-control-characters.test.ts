import { afterEach, beforeAll, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast';
import { create } from 'xmlbuilder2';
import { XsmpValueConverter } from '../../xsmp/src/parser/value-converter.js';
import { SmpGenerator } from '@xsmp/tool-smp';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { assertXmlConformsToXsd, hasXmllint, type SmpStandard } from './xsd-test-utils.js';

let services: ReturnType<typeof createXsmpServices>;
const documents: LangiumDocument[] = [];
const directories: string[] = [];

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});
afterEach(async () => {
    await clearDocuments(services.shared, documents.splice(0));
    for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

const printable = 'text "quoted" \\ end';
const characters = Array.from({ length: 32 }, (_, index) => index);
const octal = (code: number) => '\\' + code.toString(8).padStart(3, '0');

for (const standard of ['ECSS_SMP_2020', 'ECSS_SMP_2025'] satisfies SmpStandard[]) {
    test(`${standard} exports all C0 controls as lossless character and string values`, async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-control-characters-'));
        directories.push(directory);
        fs.mkdirSync(path.join(directory, 'src'));
        const uri = (name: string) => URI.file(path.join(directory, name)).toString();
        documents.push(await parseHelper<ast.Project>(services.xsmpproject)(
            `project 'Controls' using '${standard}'\nsource 'src'`,
            { documentUri: uri('xsmp.project') },
        ));
        const document = await parseHelper<ast.Catalogue>(services.xsmpcat)(`catalogue Controls
namespace demo {
    /** @uuid 54000000-0000-4000-8000-000000000001 */
    public string Text[256]
    /** @uuid 54000000-0000-4000-8000-000000000002 */
    public model Root {
        ${characters.map(code => `field Char8 c${code} = '${octal(code)}'`).join('\n')}
        field Text payload = "${characters.map(code => `${octal(code)}7`).join('')}"
        field Text printable = ${JSON.stringify(printable)}
    }
}`, { documentUri: uri('src/controls.xsmpcat') });
        documents.push(document);
        await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });
        for (const item of documents) {
            expect(item.parseResult.lexerErrors).toEqual([]);
            expect(item.parseResult.parserErrors).toEqual([]);
            expect(item.diagnostics?.filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
        }
        const xml = await new SmpGenerator(services.shared).doGenerateCatalogue(document.parseResult.value, undefined);
        const outputPath = path.join(directory, 'controls.smpcat');
        fs.writeFileSync(outputPath, xml);
        if (hasXmllint()) assertXmlConformsToXsd(outputPath, 'catalogue', standard);
        const root = create(xml).root().node as unknown as Element;
        const fields = Array.from(root.getElementsByTagName('Field'));
        const converter = new XsmpValueConverter();
        const decodedValue = (name: string) => {
            const field = fields.find(field => field.getAttribute('Name') === name)!;
            const encoded = field.getElementsByTagName('Default')[0].getAttribute('Value')!;
            return converter.convertString(`"${encoded}"`);
        };
        for (const code of characters) expect(decodedValue(`c${code}`)).toBe(String.fromCharCode(code));
        expect(decodedValue('payload')).toBe(characters.map(code => `${String.fromCharCode(code)}7`).join(''));
        expect(decodedValue('printable')).toBe(printable);
    });
}
