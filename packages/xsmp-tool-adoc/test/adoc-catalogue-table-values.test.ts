import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import type * as ast from '@xsmp/core/ast';
import { ADocGenerator } from '@xsmp/tool-adoc';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let services: ReturnType<typeof createXsmpServices>;
const documents: LangiumDocument[] = [];
const directories: string[] = [];
const hasAsciidoctor = spawnSync('ruby', ['-r', 'asciidoctor', '-e', '']).status === 0;

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

async function generate(separator: string): Promise<string> {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-adoc-values-'));
    directories.push(directory);
    fs.mkdirSync(path.join(directory, 'src'));
    const project = await parseHelper<ast.Project>(services.xsmpproject)(
        "project 'adoc-values' using 'ECSS_SMP_2025'\nsource 'src'\n",
        { documentUri: URI.file(path.join(directory, 'xsmp.project')).toString() },
    );
    const catalogue = await parseHelper<ast.Catalogue>(services.xsmpcat)(`catalogue TableValues
namespace demo {
    /** @uuid 10000000-0000-4000-8000-000000000001 */
    public string Text[16]
    /** @uuid 10000000-0000-4000-8000-000000000002
     * @unit tick${separator}frame
     */
    public integer Counter extends Smp.Int32
    /** @uuid 10000000-0000-4000-8000-000000000003
     * @unit ratio${separator}second
     */
    public float Ratio extends Smp.Float64
    /** @uuid 10000000-0000-4000-8000-000000000004 */
    public model Holder {
        /** constant${separator}description */
        public constant Smp.String8 separator = "c${separator}d"
        /** field${separator}description */
        public field Text label = "a${separator}b"
        public field Counter ticks = 3
        public field Ratio ratio = 1.5
        /** property${separator}description
         * @category ui${separator}debug
         */
        public property Smp.Int32 state
        /** @param label parameter${separator}description */
        public def void setLabel(in Smp.String8 label = "p${separator}q")
    }
}`, { documentUri: URI.file(path.join(directory, 'src', 'values.xsmpcat')).toString() });
    documents.push(project, catalogue);
    await services.shared.workspace.DocumentBuilder.build([project, catalogue], { validation: true });
    for (const document of [project, catalogue]) {
        expect(document.parseResult.parserErrors).toEqual([]);
        expect(document.diagnostics?.filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
    }
    return new ADocGenerator(services.shared).doGenerateCatalogue(catalogue.parseResult.value);
}

const cellValues = (separator: string) => [
    `"a${separator}b"`, `"c${separator}d"`, `"p${separator}q"`,
    `tick${separator}frame`, `ratio${separator}second`, `ui${separator}debug`,
    `field${separator}description`, `constant${separator}description`,
    `property${separator}description`, `parameter${separator}description`,
];

describe.each(['|', '-'])('AsciiDoc catalogue cells containing %s', (separator) => {
    test('escapes free-text cells once while preserving cross references', async () => {
        const output = await generate(separator);
        for (const value of cellValues(separator === '|' ? String.raw`\|` : separator)) {
            expect(output).toContain(`|${value}`);
        }
        expect(output).toContain('<<demo-Text,Text>>');
        expect(output).not.toContain(String.raw`\\|description`);
    });

    test.skipIf(!hasAsciidoctor)('renders complete values in individual Asciidoctor cells', async () => {
        const output = await generate(separator);
        const tables: string[][][] = JSON.parse(execFileSync('ruby', ['-r', 'asciidoctor', '-r', 'json', '-e',
            "doc = Asciidoctor.load STDIN.read; puts JSON.generate(doc.find_by(context: :table).map { |t| t.rows.body.map { |r| r.map(&:text) } })",
        ], { input: output, encoding: 'utf8' }));
        const cells = tables.flat(2);
        for (const value of cellValues(separator)) {
            expect(cells).toContain(value);
        }
    });
});
