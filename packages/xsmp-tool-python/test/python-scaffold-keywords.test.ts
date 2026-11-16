import { afterEach, describe, expect, test } from 'vitest';
import { URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { parseHelper } from 'langium/test';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createXsmpServices } from '@xsmp/core';
import type * as ast from '@xsmp/core/ast';
import { createXsmpProject } from '@xsmp/core/project';
import { PythonGenerator, xsmpContributionPackage } from '@xsmp/tool-python';
import { generateDocuments } from '../../xsmp/test/generation-test-utils.js';

const directories: string[] = [];
const hasPython = spawnSync('python3', ['--version']).status === 0;

afterEach(() => {
    for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('Python scaffold package names', () => {
    test.each([
        ['None', 'None', '_None'],
        ['from', 'from', '_from'],
        ['mission-demo', 'mission_demo', 'mission_demo'],
        ['class', 'class_', 'class_'],
    ])('matches generated packages for project %s', async (name, libraryName, packageName) => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-python-scaffold-keywords-'));
        directories.push(directory);
        const projectDir = path.join(directory, name);
        const services = createXsmpServices(NodeFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
        const registration = await services.shared.ContributionRegistry.registerBuiltinPackages([xsmpContributionPackage]);
        expect(registration.failures).toEqual([]);
        await createXsmpProject({ projectName: name, projectDir, tools: [{ id: 'python', label: 'Python' }] }, services.shared.ContributionRegistry);

        const project = await parseHelper<ast.Project>(services.xsmpproject)(fs.readFileSync(path.join(projectDir, 'xsmp.project'), 'utf8'), {
            documentUri: URI.file(path.join(projectDir, 'xsmp.project')).toString(),
        });
        const cataloguePath = path.join(projectDir, 'smdl', `${name}.xsmpcat`);
        const catalogue = await parseHelper<ast.Catalogue>(services.xsmpcat)(fs.readFileSync(cataloguePath, 'utf8'), {
            documentUri: URI.file(cataloguePath).toString(),
        });
        await services.shared.workspace.DocumentBuilder.build([project, catalogue], { validation: true });
        for (const document of [project, catalogue]) {
            expect(document.parseResult.parserErrors).toEqual([]);
            expect(document.diagnostics?.filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
        }
        await generateDocuments(new PythonGenerator(services.shared), [catalogue.parseResult.value], URI.file(projectDir));
        const pythonDir = path.join(projectDir, 'python');
        const testFile = path.join(pythonDir, packageName, `test_${libraryName}.py`);
        const source = fs.readFileSync(testFile, 'utf8');
        expect(fs.existsSync(path.join(pythonDir, packageName, '__init__.py'))).toBe(true);
        expect(source).toContain(`import ${packageName}`);
        expect(source).toContain(`sim.LoadLibrary("${libraryName}")`);
        if (hasPython) {
            execFileSync('python3', ['-c', `
import runpy, sys, types
sys.path.insert(0, sys.argv[1])
sys.modules['ecss_smp'] = types.SimpleNamespace(Smp=types.SimpleNamespace(ISimulator=object))
sys.modules['xsmp'] = types.SimpleNamespace(unittest=types.SimpleNamespace(TestCase=object))
namespace = runpy.run_path(sys.argv[2])
case = namespace['Test' + sys.argv[3]]()
loaded = []
case.loadAssembly(types.SimpleNamespace(LoadLibrary=loaded.append))
assert loaded == [sys.argv[3]], loaded
`, pythonDir, testFile, libraryName], { encoding: 'utf8' });
        }
    });
});
