import { afterEach, beforeAll, expect, test } from 'vitest';
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

async function parseValues(format: Format, values: string[], bounded = false) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-float-separators-'));
    directories.push(directory);
    fs.mkdirSync(path.join(directory, 'src'));
    const uri = (name: string) => URI.file(path.join(directory, name)).toString();
    documents.push(await parseHelper<ast.Project>(services.xsmpproject)(
        "project 'Floats' using 'ECSS_SMP_2025'\nsource 'src'",
        { documentUri: uri('xsmp.project') },
    ));
    const type = bounded ? 'Limited' : 'Float64';
    documents.push(await parseHelper<ast.Catalogue>(services.xsmpcat)(`catalogue Types
namespace demo {
    /** @uuid 53000000-0000-4000-8000-000000000001 */
    public float Limited extends Float64 in 0.0 ... 100.0
    /** @uuid 53000000-0000-4000-8000-000000000002 */
    public model Root {
        field ${type} a
        field Float32 b
        field Float64 c
        public property ${type} pa
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
        ["1'234.5", "12.3'4f32", "1.0e1'0f64"],
        ['1234.5', '12.34f32', '1.0e10f64'],
    ])(`${format} preserves floating values %s, %s, %s`, async (...values) => {
        const document = await parseValues(format, values);
        expect(document.diagnostics?.filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
        const generator = new SmpGenerator(services.shared);
        const node = document.parseResult.value;
        const xml = ast.isConfiguration(node) ? await generator.doGenerateConfiguration(node, undefined)
            : ast.isAssembly(node) ? await generator.doGenerateAssembly(node, undefined)
                : await generator.doGenerateSchedule(node as ast.Schedule, undefined);
        expect([...xml.matchAll(/xsi:type="Types:Float(?:32|64)Value" Value="([^"]+)"/g)].map(match => match[1]))
            .toEqual(['1234.5', '12.34', '10000000000']);
    });

    test(`${format} checks the complete value against its declared range`, async () => {
        const document = await parseValues(format, ["1'234.5", '2.0f32', '3.0f64'], true);
        expect(document.diagnostics?.filter(diagnostic => diagnostic.severity === 1).map(diagnostic => diagnostic.message))
            .toEqual(['Float value shall be less than or equal to 100.']);
    });
}
