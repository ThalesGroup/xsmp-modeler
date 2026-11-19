import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import type * as ast from '@xsmp/core/ast';
import { PythonGenerator } from '@xsmp/tool-python';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { generateDocuments } from '../../xsmp/test/generation-test-utils.js';

let services: ReturnType<typeof createXsmpServices>;
const documents: LangiumDocument[] = [];
const directories: string[] = [];
const hasPython = spawnSync('python3', ['--version']).status === 0;
const uuid = '11111111-1111-1111-1111-111111111111';
const otherUuid = '22222222-2222-2222-2222-222222222222';
const nestedUuid = '33333333-3333-3333-3333-333333333333';

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

describe('Python external module alias', () => {
    test.skipIf(!hasPython).each([
        { component: 'ecss_smp', namespace: 'child' },
        { component: 'Normal', namespace: 'ecss_smp' },
        { component: 'Normal', namespace: 'child' },
    ])('imports components and nested namespaces named $component / $namespace', async ({ component, namespace }) => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-python-alias-'));
        directories.push(directory);
        fs.mkdirSync(path.join(directory, 'src'));
        const project = await parseHelper<ast.Project>(services.xsmpproject)(
            "project 'python-alias' using 'ECSS_SMP_2025'\nsource 'src'\n",
            { documentUri: URI.file(path.join(directory, 'xsmp.project')).toString() },
        );
        const catalogue = await parseHelper<ast.Catalogue>(services.xsmpcat)(`catalogue Example
namespace demo {
    namespace ${namespace} {
        /** @uuid ${nestedUuid} */
        public model Nested {}
    }
    /** @uuid ${uuid} */
    public model ${component} {}
    /** @uuid ${otherUuid} */
    public model Second {}
}`, { documentUri: URI.file(path.join(directory, 'src', 'example.xsmpcat')).toString() });
        documents.push(project, catalogue);
        await services.shared.workspace.DocumentBuilder.build([project, catalogue], { validation: true });
        for (const document of [project, catalogue]) {
            expect(document.parseResult.parserErrors).toEqual([]);
            expect(document.diagnostics?.filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
        }
        await generateDocuments(new PythonGenerator(services.shared), [catalogue.parseResult.value], URI.file(directory));
        execFileSync('python3', ['-c', `
import sys
import types
sys.path.insert(0, sys.argv[1])
# Stub only the external UUID constructor; import the actual generated modules.
sys.modules['ecss_smp'] = types.SimpleNamespace(Smp=types.SimpleNamespace(Uuid=lambda value: value))
from Example import demo
assert getattr(demo, sys.argv[2]).uuid == '${uuid}'
assert demo.Second.uuid == '${otherUuid}'
assert getattr(demo, sys.argv[3]).Nested.uuid == '${nestedUuid}'
`, path.join(directory, 'python'), component, namespace], { encoding: 'utf8' });
    });
});
