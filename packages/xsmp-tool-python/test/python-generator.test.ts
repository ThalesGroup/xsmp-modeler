import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import type * as ast from '@xsmp/core/ast';
import type { Task } from '@xsmp/core/generator';
import { PythonGenerator } from '@xsmp/tool-python';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let services: ReturnType<typeof createXsmpServices>;
const documents: LangiumDocument[] = [];
const directories: string[] = [];
const hasPython = spawnSync('python3', ['--version']).status === 0;
const keywordSource = `catalogue None
namespace from {
    namespace async {
        /** @uuid 11111111-1111-1111-1111-111111111111 */
        public model None {}
        /** @uuid 22222222-2222-2222-2222-222222222222 */
        public model None_ {}
        /** @uuid 33333333-3333-3333-3333-333333333333 */
        public service False {}
    }
    namespace async_ {}
}
namespace from_ {}
namespace from__ {}
`;

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

async function generate(source: string | string[]): Promise<string> {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-python-generator-'));
    directories.push(directory);
    fs.mkdirSync(path.join(directory, 'src'));
    const project = await parseHelper<ast.Project>(services.xsmpproject)(
        "project 'python-test' using 'ECSS_SMP_2025'\nsource 'src'\n",
        { documentUri: URI.file(path.join(directory, 'xsmp.project')).toString() },
    );
    const catalogues: Array<LangiumDocument<ast.Catalogue>> = [];
    for (const text of typeof source === 'string' ? [source] : source) {
        const name = /catalogue\s+(\w+)/.exec(text)![1];
        catalogues.push(await parseHelper<ast.Catalogue>(services.xsmpcat)(text, {
            documentUri: URI.file(path.join(directory, 'src', `${name}.xsmpcat`)).toString(),
        }));
    }
    const sourceDocuments: LangiumDocument[] = [project, ...catalogues];
    documents.push(...sourceDocuments);
    await services.shared.workspace.DocumentBuilder.build(sourceDocuments, { validation: true });
    for (const document of sourceDocuments) {
        expect(document.parseResult.parserErrors).toEqual([]);
        expect(document.diagnostics?.filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
    }
    const tasks: Task[] = [];
    const generator = new PythonGenerator(services.shared);
    for (const catalogue of catalogues) {
        generator.generate(catalogue.parseResult.value, URI.file(directory), task => tasks.push(task));
    }
    for (const task of tasks) {
        await task();
    }
    return path.join(directory, 'python');
}

describe('Python identifier generation', () => {
    test('preserves ordinary catalogue, namespace and component names', async () => {
        const root = await generate(`catalogue Example
namespace demo {
    /** @uuid 11111111-1111-1111-1111-111111111111 */
    public model Normal {}
}`);
        expect(fs.readFileSync(path.join(root, 'Example', '__init__.py'), 'utf8')).toContain('from . import demo');
        expect(fs.readFileSync(path.join(root, 'Example', 'demo', '__init__.py'), 'utf8')).toContain('class Normal:');
    });

    test('escapes Python keywords consistently without collisions with existing names', async () => {
        const root = await generate(keywordSource);
        const catalogue = fs.readFileSync(path.join(root, '_None', '__init__.py'), 'utf8');
        expect(catalogue).toContain('from . import _from\nfrom . import from_\nfrom . import from__');
        const namespace = fs.readFileSync(path.join(root, '_None', '_from', '__init__.py'), 'utf8');
        expect(namespace).toContain('from . import _async\nfrom . import async_');
        const components = fs.readFileSync(path.join(root, '_None', '_from', '_async', '__init__.py'), 'utf8');
        expect(components).toContain('class _None:');
        expect(components).toContain('class None_:');
        expect(components).toContain('class _False:');
        expect(fs.existsSync(path.join(root, '_None', 'from_', '__init__.py'))).toBe(true);
        expect(fs.existsSync(path.join(root, '_None', 'from__', '__init__.py'))).toBe(true);
    });

    test('keeps keyword catalogues distinct from other catalogues in the project', async () => {
        const root = await generate([keywordSource, 'catalogue None_ namespace peer {}']);
        expect(fs.readFileSync(path.join(root, '_None', '__init__.py'), 'utf8')).toContain('from . import _from');
        expect(fs.readFileSync(path.join(root, 'None_', '__init__.py'), 'utf8')).toContain('from . import peer');
    });

    test.skipIf(!hasPython)('imports generated packages and preserves distinct component UUIDs', async () => {
        const root = await generate([keywordSource, 'catalogue None_ namespace peer {}']);
        execFileSync('python3', ['-c', `
import sys
import types
sys.path.insert(0, sys.argv[1])
# Only the external UUID constructor is stubbed; all packages below are generated.
sys.modules['ecss_smp'] = types.SimpleNamespace(Smp=types.SimpleNamespace(Uuid=lambda value: value))
import _None
import None_
from _None._from import _async
assert _async._None.uuid == '11111111-1111-1111-1111-111111111111'
assert _async.None_.uuid == '22222222-2222-2222-2222-222222222222'
assert _async._False.uuid == '33333333-3333-3333-3333-333333333333'
assert _None.from_ is not _None.from__
assert _None is not None_
assert None_.peer is not None
`, root], { encoding: 'utf8' });
    });
});
