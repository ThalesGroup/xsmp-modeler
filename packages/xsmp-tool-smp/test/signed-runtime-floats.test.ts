import { afterEach, beforeAll, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast';
import { SmpImportService } from '@xsmp/core/smp';
import { SmpGenerator } from '@xsmp/tool-smp';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let services: ReturnType<typeof createXsmpServices>;
const documents: LangiumDocument[] = [];
const directories: string[] = [];
const formats = ['xsmpcfg', 'xsmpasb', 'xsmpsed'] as const;
type Format = typeof formats[number];

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

afterEach(async () => {
    await clearDocuments(services.shared, documents.splice(0));
    for (const directory of directories.splice(0)) {
        fs.rmSync(directory, { recursive: true, force: true });
    }
});

async function parseValues(format: Format, values: string[]) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-signed-floats-'));
    directories.push(directory);
    fs.mkdirSync(path.join(directory, 'src'));
    const uri = (name: string) => URI.file(path.join(directory, name)).toString();
    documents.push(await parseHelper<ast.Project>(services.xsmpproject)(
        "project 'Floats' using 'ECSS_SMP_2025'\nsource 'src'",
        { documentUri: uri('xsmp.project') },
    ));
    documents.push(await parseHelper<ast.Catalogue>(services.xsmpcat)(`catalogue Types
namespace demo {
    /** @uuid 53000000-0000-4000-8000-000000000002 */
    public model Root {
        field Float64 a
        field Float32 b
        field Float64 c
        public property Float64 pa
        public property Float32 pb
        public def void apply(in Float64 c)
    }
}`, { documentUri: uri('src/types.xsmpcat') }));
    const assignments = `a = ${values[0]} b = ${values[1]} c = ${values[2]}`;
    const source = format === 'xsmpcfg'
        ? `configuration Values /Root: demo.Root { ${assignments} }`
        : format === 'xsmpasb'
            ? `assembly Values Root: demo.Root { ${assignments} }`
            : `schedule <Root = "root"> Values task Main on demo.Root {
                property pa = ${values[0]}
                property pb = ${values[1]}
                call apply(c = ${values[2]})
            }`;
    const document = await parseHelper(services[format])(source, { documentUri: uri(`src/values.${format}`) });
    documents.push(document);
    await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });
    for (const item of documents) {
        expect(item.parseResult.lexerErrors).toEqual([]);
        expect(item.parseResult.parserErrors).toEqual([]);
        if (item !== document) {
            expect(item.diagnostics?.filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
        }
    }
    return document;
}

for (const format of formats) {
    test.each([
        { source: ['-1.5', '-2.5f32', '-3.0e-2f64'], expected: ['-1.5', '-2.5', '-0.03'] },
        { source: ['+1.5', '+2.5f32', '+3e+2f64'], expected: ['1.5', '2.5', '300'] },
        { source: ['-.5', '-2.f32', '-3e2f64'], expected: ['-0.5', '-2', '-300'] },
        { source: ['1.5', '2.5f32', '3e-2f64'], expected: ['1.5', '2.5', '0.03'] },
    ])(`${format} validates and exports $source`, async ({ source, expected }) => {
        const document = await parseValues(format, source);
        expect(document.diagnostics?.filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
        const generator = new SmpGenerator(services.shared);
        const node = document.parseResult.value;
        const xml = ast.isConfiguration(node) ? await generator.doGenerateConfiguration(node, undefined)
            : ast.isAssembly(node) ? await generator.doGenerateAssembly(node, undefined)
                : await generator.doGenerateSchedule(node as ast.Schedule, undefined);
        expect([...xml.matchAll(/xsi:type="Types:Float(?:32|64)Value" Value="([^"]+)"/g)].map(match => match[1]))
            .toEqual(expected);
        const inputPath = path.join(directories.at(-1)!, `values.${format.slice(1)}`);
        fs.writeFileSync(inputPath, xml);
        const imported = await new SmpImportService(services.shared).renderImportedDocument({
            inputPath,
            outputUri: URI.file(path.join(directories.at(-1)!, `imported.${format}`)),
        });
        const importedValues = [...imported.content.matchAll(/([+-]?(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?)(f32|f64)/g)];
        expect(importedValues.map(match => [Number(match[1]), match[2]]))
            .toEqual(expected.map((value, index) => [Number(value), index === 1 ? 'f32' : 'f64']));
    });
}
