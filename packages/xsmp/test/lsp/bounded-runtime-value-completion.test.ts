import { afterEach, expect, test } from 'vitest';
import { EmptyFileSystem, URI } from 'langium';
import { parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })));

const uuid = (id: number) => `/** @uuid 1436123a-301a-4ab1-ac97-${String(id).padStart(12, '0')} */`;
const cases = [
    { name: 'small array', types: `${uuid(1)} public array Samples = Smp.Int32[8]`, expected: '[0, 0, 0, 0, 0, 0, 0, 0]' },
    { name: 'large array', types: `${uuid(1)} public array Samples = Smp.Int32[100000]`, expected: undefined },
    { name: 'array exceeding JS array length', types: `${uuid(1)} public array Samples = Smp.Int32[4294967296]`, expected: undefined },
    { name: 'nested array', types: `${uuid(1)} public array Item = Smp.Int32[8] ${uuid(2)} public array Samples = Item[1000]`, expected: undefined },
    { name: 'small structure', types: `${uuid(1)} public struct Samples { field Smp.Int32 count field Smp.Bool enabled }`, expected: '{ count = 0, enabled = false }' },
    { name: 'wide structure', types: `${uuid(1)} public struct Samples { ${Array.from({ length: 500 }, (_, i) => `field Smp.Int32 value${i}`).join('\n')} }`, expected: undefined },
    { name: 'structure with large array', types: `${uuid(1)} public array Item = Smp.Int32[100000] ${uuid(2)} public struct Samples { field Item values }`, expected: undefined },
];

test.each(cases)('bounds CFG and ASB completion defaults for $name', async ({ types, expected }) => {
    const services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
    const directory = mkdtempSync(join(tmpdir(), 'xsmp-completion-budget-'));
    directories.push(directory);
    mkdirSync(join(directory, 'src'));
    const project = await parseHelper(services.xsmpproject)('project "Demo" using "ECSS_SMP_2025" source "src"', {
        documentUri: URI.file(join(directory, 'xsmp.project')).toString(),
    });
    const catalogue = await parseHelper(services.xsmpcat)(`catalogue Demo namespace demo {
        ${types}
        ${uuid(3)} public model Root { field Samples samples }
    }`, { documentUri: URI.file(join(directory, 'src/demo.xsmpcat')).toString() });
    await services.shared.workspace.DocumentBuilder.build([project, catalogue], { validation: true });
    expect(project.diagnostics).toEqual([]);
    expect(catalogue.diagnostics).toEqual([]);
    for (const language of ['xsmpcfg', 'xsmpasb'] as const) {
        for (const prefix of ['', 'samples = ']) {
            const text = `${language === 'xsmpcfg' ? 'configuration Config\n/Root' : 'assembly Assembly\nRoot'}: demo.Root {\n    ${prefix}\n}`;
            const document = await parseHelper(services[language])(text, {
                documentUri: URI.file(join(directory, `src/${prefix ? 'value' : 'field'}.${language}`)).toString(),
            });
            const completion = await services[language].lsp.CompletionProvider!.getCompletion(document, {
                textDocument: { uri: document.uri.toString() },
                position: document.textDocument.positionAt(text.indexOf('\n}')),
            });
            const items = completion?.items ?? [];
            const insertions = items.map(item => item.textEdit?.newText ?? item.insertText ?? '');
            expect(insertions.every(value => value.length < 5000)).toBe(true);
            if (!prefix) {
                const assignments = items.filter(item => item.label === 'samples' && item.textEdit?.newText.includes(' = '));
                expect(assignments.length).toBeGreaterThan(0);
                const escaped = expected?.replaceAll('}', '\\}');
                expect(assignments[0].textEdit?.newText).toContain(`samples = \${1:${escaped ?? 'value'}}`);
            } else if (expected) {
                expect(items.some(item => item.label === 'Default Value')).toBe(true);
            } else {
                expect(items.some(item => item.label === 'Default Value')).toBe(false);
            }
        }
    }
});
