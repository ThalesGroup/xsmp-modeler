import { expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { URI } from 'langium';
import { TasMdkPythonGenerator } from 'xsmp-tas-mdk';
import { createProfileGeneratorTestContext, cleanupProfileGeneratorTestContext, generateProfileTree } from '../../xsmp/test/profile-generator-test-utils.js';
import { rebuildTestDocuments } from '../../xsmp/test/test-services.js';

const hasPython = spawnSync('python3', ['--version']).status === 0;

test.skipIf(!hasPython).each([
    { library: 'Library', namespace: 'demo', model: 'Device' },
    { library: 'from', namespace: 'demo', model: 'Device' },
    { library: 'Library', namespace: 'from', model: 'Device' },
    { library: 'Library', namespace: 'demo.from.async', model: 'Device' },
    { library: 'Library', namespace: 'demo', model: 'None' },
    { library: 'Library', namespace: 'demo', model: 'Device', base: 'TasMdk.CommonModels.from.None' },
])('imports TAS Python helpers for $library / $namespace / $model', async ({ library, namespace, model, base = 'TasMdk.Model' }) => {
    const context = await createProfileGeneratorTestContext();
    try {
        const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tas-python-keywords-'));
        context.tempDirs.push(workspace);
        fs.mkdirSync(path.join(workspace, 'src'));
        const project = await context.parseProject(`project '${library}' using 'ECSS_SMP_2025'\nsource 'src'\nprofile 'tas-mdk'`, {
            documentUri: URI.file(path.join(workspace, 'xsmp.project')).toString(),
        });
        // Minimal TAS model hierarchy; the active profile checks the root base.
        const document = await context.parseCatalogue(`catalogue ${library}
namespace TasMdk {
    /** @uuid 92000000-0000-4000-8000-000000000001 */
    public model Model {}
    ${base !== 'TasMdk.Model' ? `namespace CommonModels { namespace from {
        /** @uuid 92000000-0000-4000-8000-000000000002 */
        public model None extends Model {}
    } }` : ''}
}
${namespace.split('.').map(name => `namespace ${name} {`).join('\n')}
    /** @uuid 92000000-0000-4000-8000-000000000003 */
    public model ${model} extends ${base} {}
${namespace.split('.').map(() => '}').join('\n')}`, {
            documentUri: URI.file(path.join(workspace, 'src', `${library}.xsmpcat`)).toString(),
        });
        context.documents.push(project, document);
        await rebuildTestDocuments(context.services, [project, document]);
        expect(project.parseResult.parserErrors).toEqual([]);
        expect(document.parseResult.parserErrors).toEqual([]);
        expect(project.diagnostics).toEqual([]);
        expect(document.diagnostics).toEqual([]);
        const output = await generateProfileTree(context, new TasMdkPythonGenerator(context.services.shared), document, 'tas-python-keywords-output-');
        const script = `import compileall, importlib, pathlib, sys, types
root, library, namespace, model, base = sys.argv[1:]
assert compileall.compile_dir(root, quiet=2)
package = types.ModuleType(library)
package.__path__ = [str(pathlib.Path(root) / 'helpers')]
sys.modules[library] = package
external = 'TasMdk__CommonModels.test_utils.' + base
for length in range(1, len(external.split('.')) + 1):
    name = '.'.join(external.split('.')[:length])
    module = types.ModuleType(name)
    module.__path__ = []
    sys.modules[name] = module
base_wrapper = type(base.split('.')[-1] + 'Wrapper', (), {})
setattr(sys.modules[external], base_wrapper.__name__, base_wrapper)
module = importlib.import_module(library + '.test_utils.' + namespace + '.' + model)
wrapper = getattr(module, model + 'Wrapper')
assert issubclass(wrapper, base_wrapper)
assert wrapper.builder is importlib.import_module(library + '.builder.' + namespace + '.' + model)
`;
        const result = spawnSync('python3', ['-c', script, output, library, namespace, model, base], { encoding: 'utf8' });
        expect(result.status, result.stdout + result.stderr).toBe(0);
    } finally {
        await cleanupProfileGeneratorTestContext(context);
    }
});
