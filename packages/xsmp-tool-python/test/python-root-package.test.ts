import { afterEach, describe, expect, test } from 'vitest';
import { URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { parseHelper } from 'langium/test';
import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast';
import { createXsmpProject } from '@xsmp/core/project';
import { PythonGenerator, xsmpContributionPackage } from '@xsmp/tool-python';
import { generateDocuments } from '../../xsmp/test/generation-test-utils.js';

const directories: string[] = [];
const hasPython = spawnSync('python3', ['--version']).status === 0;
const uuid = '10000000-0000-4000-8000-000000000001';
const supportUuid = '10000000-0000-4000-8000-000000000002';
const peerUuid = '10000000-0000-4000-8000-000000000003';
const otherUuid = '10000000-0000-4000-8000-000000000004';

afterEach(() => {
    for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('Python root package names', () => {
    test.each([
        ['ecss_smp', '_ecss_smp'],
        ['Normal', 'Normal'],
        ['xsmp', '_xsmp'],
        ['ecss_smp_', 'ecss_smp_'],
        ['xsmp_', 'xsmp_'],
    ])('imports catalogue %s, its scaffold and the external dependency independently', async (name, packageName) => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-python-root-'));
        directories.push(directory);
        const projectDir = path.join(directory, 'project');
        const services = createXsmpServices(NodeFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
        const registration = await services.shared.ContributionRegistry.registerBuiltinPackages([xsmpContributionPackage]);
        expect(registration.failures).toEqual([]);
        await createXsmpProject({ projectName: name, projectDir, tools: [{ id: 'python', label: 'Python' }] }, services.shared.ContributionRegistry);
        const projectPath = path.join(projectDir, 'xsmp.project');
        const project = await parseHelper<ast.Project>(services.xsmpproject)(fs.readFileSync(projectPath, 'utf8'), {
            documentUri: URI.file(projectPath).toString(),
        });
        const parseCatalogue = parseHelper<ast.Catalogue>(services.xsmpcat);
        const catalogue = await parseCatalogue(`catalogue ${name}
namespace ecss_smp {
    /** @uuid ${uuid} */
    public model Device extends support.Base {}
}
namespace xsmp {
    /** @uuid ${otherUuid} */
    public model Other {}
}`, { documentUri: URI.file(path.join(projectDir, 'smdl', `${name}.xsmpcat`)).toString() });
        const supportName = name === 'ecss_smp_' ? 'Support' : 'ecss_smp_';
        const support = await parseCatalogue(`catalogue ${supportName}
namespace support {
    /** @uuid ${supportUuid} */
    public model Base {}
}`, { documentUri: URI.file(path.join(projectDir, 'smdl', `${supportName}.xsmpcat`)).toString() });
        const companionName = name === 'xsmp_' ? 'Companion' : 'xsmp_';
        const companion = await parseCatalogue(`catalogue ${companionName}
namespace companion {
    /** @uuid ${peerUuid} */
    public model Peer {}
}`, { documentUri: URI.file(path.join(projectDir, 'smdl', `${companionName}.xsmpcat`)).toString() });
        await services.shared.workspace.DocumentBuilder.build([project, catalogue, support, companion], { validation: true });
        for (const document of [project, catalogue, support, companion]) {
            expect(document.parseResult.parserErrors).toEqual([]);
            expect(document.diagnostics?.filter(d => d.severity === 1)).toEqual([]);
        }
        const model = catalogue.parseResult.value.elements[0].elements.find(ast.isModel)!;
        const base = support.parseResult.value.elements[0].elements.find(ast.isModel)!;
        expect(model.base?.ref).toBe(base);
        const generator = new PythonGenerator(services.shared);
        await generateDocuments(generator, [catalogue.parseResult.value, support.parseResult.value, companion.parseResult.value], URI.file(projectDir));
        const pythonDir = path.join(projectDir, 'python');
        expect(generator.fqn(model, '.')).toBe(`${packageName}.ecss_smp.Device`);
        expect(fs.existsSync(path.join(pythonDir, packageName, '__init__.py'))).toBe(true);
        expect(fs.readFileSync(path.join(pythonDir, packageName, `test_${name}.py`), 'utf8')).toContain(`sim.LoadLibrary("${name}")`);

        if (hasPython) {
            // Disk modules exercise Python's actual path resolution; injecting
            // sys.modules would hide a generated package shadowing a dependency.
            const dependencyDir = path.join(directory, 'dependencies');
            fs.mkdirSync(dependencyDir);
            fs.writeFileSync(path.join(dependencyDir, 'ecss_smp.py'), 'class Smp:\n    Uuid = str\n    ISimulator = object\n');
            fs.writeFileSync(path.join(dependencyDir, 'xsmp.py'), 'class unittest:\n    TestCase = object\n');
            execFileSync('python3', ['-c', `
import importlib, pathlib, sys, types
sys.path[:0] = [sys.argv[1], sys.argv[2]]
package = importlib.import_module(sys.argv[3])
for external_name in ['ecss_smp', 'xsmp']:
    external = importlib.import_module(external_name)
    assert pathlib.Path(external.__file__).parent == pathlib.Path(sys.argv[2])
assert package.ecss_smp.Device.uuid == '${uuid}'
assert package.xsmp.Other.uuid == '${otherUuid}'
assert importlib.import_module(sys.argv[7]).companion.Peer.uuid == '${peerUuid}'
for qualified_name, expected_uuid in [(sys.argv[5], '${uuid}'), (sys.argv[6], '${supportUuid}')]:
    module, _, name = qualified_name.rpartition('.')
    assert getattr(importlib.import_module(module), name).uuid == expected_uuid
scaffold = importlib.import_module(sys.argv[3] + '.test_' + sys.argv[4])
case = getattr(scaffold, 'Test' + sys.argv[4])()
loaded = []
case.loadAssembly(types.SimpleNamespace(LoadLibrary=loaded.append))
assert loaded == [sys.argv[4]], loaded
`, pythonDir, dependencyDir, packageName, name, generator.fqn(model, '.'), generator.fqn(base, '.'), companionName], { encoding: 'utf8' });
        }
    });

    test.each(['_ecss_smp', '_xsmp'])('rejects catalogue name %s that could occupy a reserved package', async name => {
        const services = createXsmpServices(NodeFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
        const catalogue = await parseHelper<ast.Catalogue>(services.xsmpcat)(`catalogue ${name}`);
        await services.shared.workspace.DocumentBuilder.build([catalogue], { validation: true });
        expect(catalogue.diagnostics?.some(d => d.severity === 1 && d.message === 'A name shall start with a letter.')).toBe(true);
    });
});
