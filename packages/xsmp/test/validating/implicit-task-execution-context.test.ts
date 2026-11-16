import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { EmptyFileSystem, URI } from 'langium';
import { parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })));

test.each([
    ['demo.Root', 'demo.Child', '', false],
    ['demo.Root', 'demo.Root', '', true],
    ['demo.Derived', 'demo.Root', '', true],
    ['demo.Root', 'demo.Derived', '', false],
    ['', 'demo.Child', '', true],
    ['demo.Root', '', '', true],
    ['Runtime', 'demo.Root', '', true],
    ['Runtime', 'demo.Child', '', false],
    ['demo.Root', 'demo.Child', ' at .', false],
    ['demo.Root', 'demo.Root', ' at .', true],
    ['Runtime', 'demo.Child', ' at Child', true],
    ['demo.Root', 'demo.Child', ' at unsafe .', true],
])('checks execute context %s -> %s%s', async (caller, target, at, compatible) => {
    const services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
    const directory = mkdtempSync(join(tmpdir(), 'xsmp-task-context-'));
    directories.push(directory);
    mkdirSync(join(directory, 'src'));
    const uri = (name: string) => URI.file(join(directory, name)).toString();
    const project = await parseHelper(services.xsmpproject)('project "Demo" using "ECSS_SMP_2025" source "src"', {
        documentUri: uri('xsmp.project'),
    });
    const catalogue = await parseHelper(services.xsmpcat)(`catalogue Types namespace demo {
        /** @uuid 1436123a-301a-4ab1-ac97-123679609451 */
        public model Child { public def void reset() }
        /** @uuid 2436123a-301a-4ab1-ac97-123679609451 */
        public model Root { container Child child }
        /** @uuid 3436123a-301a-4ab1-ac97-123679609451 */
        public model Derived extends Root {}
    }`, { documentUri: uri('src/types.xsmpcat') });
    const assembly = await parseHelper(services.xsmpasb)('assembly Runtime Root: demo.Root { child += Child: demo.Child }', {
        documentUri: uri('src/runtime.xsmpasb'),
    });
    const document = await parseHelper(services.xsmpsed)(`schedule <Root="root"> Tasks
        task Main ${caller ? `on ${caller}` : ''} { execute Worker${at} }
        task Worker ${target ? `on ${target}` : ''} { ${target === 'demo.Child' ? 'call reset()' : ''} }
    `, { documentUri: uri('src/tasks.xsmpsed') });
    const documents = [project, catalogue, assembly, document];
    await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });
    for (const source of documents) {
        expect(source.parseResult.lexerErrors).toEqual([]);
        expect(source.parseResult.parserErrors).toEqual([]);
    }
    expect([project, catalogue, assembly].flatMap(source => source.diagnostics?.filter(d => d.severity === 1) ?? [])).toEqual([]);
    const errors = document.diagnostics?.filter(d => d.severity === 1) ?? [];
    expect(errors).toHaveLength(compatible ? 0 : 1);
    if (!compatible) {
        expect(errors[0].message).toContain('compatible with the execution context of task Worker');
        expect(document.textDocument.getText(errors[0].range)).toBe(at ? '.' : 'Worker');
    }
});
