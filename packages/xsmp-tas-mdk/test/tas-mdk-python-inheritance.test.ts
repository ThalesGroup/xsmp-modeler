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
    { baseLibrary: 'Library', namespace: 'demo', baseRoot: 'Library' },
    { baseLibrary: 'BaseLibrary', namespace: 'demo', baseRoot: 'BaseLibrary' },
    { baseLibrary: 'TasMdkCatalogue', namespace: 'TasMdk.CommonModels', baseRoot: 'TasMdk__CommonModels' },
    { baseLibrary: 'TasMdkCatalogue', namespace: 'TasMdk.InterfacesImplem', baseRoot: 'TasMdk__CommonModels' },
    { baseLibrary: 'TasMdkCatalogue', namespace: 'TasMdk.CommonTestModels', baseRoot: 'TasMdk__CommonTestModels' },
])('imports a base wrapper from $baseLibrary / $namespace', async ({ baseLibrary, namespace, baseRoot }) => {
    const context = await createProfileGeneratorTestContext();
    try {
        const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'tas-python-inheritance-'));
        context.tempDirs.push(workspace);
        fs.mkdirSync(path.join(workspace, 'src'));
        const project = await context.parseProject("project 'Library' using 'ECSS_SMP_2025'\nsource 'src'\nprofile 'tas-mdk'", {
            documentUri: URI.file(path.join(workspace, 'xsmp.project')).toString(),
        });
        // Minimal TAS model hierarchy, validated with the profile enabled.
        const inTasMdk = namespace.startsWith('TasMdk.');
        const names = namespace.split('.').slice(inTasMdk ? 1 : 0);
        const baseModelSource = `${names.map(name => `namespace ${name} {`).join('\n')}
    /** @uuid 93000000-0000-4000-8000-000000000002 */
    public model Base extends TasMdk.Model {}
${names.map(() => '}').join('\n')}`;
        const baseSource = `catalogue ${baseLibrary}
namespace TasMdk {
    /** @uuid 93000000-0000-4000-8000-000000000001 */
    public model Model {}
    ${inTasMdk ? baseModelSource : ''}
}
${inTasMdk ? '' : baseModelSource}`;
        const derivedSource = `namespace consumer {
    /** @uuid 93000000-0000-4000-8000-000000000003 */
    public model Derived extends ${namespace}.Base {}
}`;
        const baseDocument = await context.parseCatalogue(baseSource + (baseLibrary === 'Library' ? '\n' + derivedSource : ''), {
            documentUri: URI.file(path.join(workspace, 'src', `${baseLibrary}.xsmpcat`)).toString(),
        });
        const derivedDocument = baseLibrary === 'Library' ? baseDocument : await context.parseCatalogue('catalogue Library\n' + derivedSource, {
            documentUri: URI.file(path.join(workspace, 'src/Library.xsmpcat')).toString(),
        });
        context.documents.push(...new Set([project, baseDocument, derivedDocument]));
        await rebuildTestDocuments(context.services, context.documents);
        for (const document of context.documents) {
            expect(document.parseResult.parserErrors).toEqual([]);
            expect(document.diagnostics).toEqual([]);
        }
        const generator = new TasMdkPythonGenerator(context.services.shared);
        const baseOutput = await generateProfileTree(context, generator, baseDocument, 'tas-python-base-');
        const derivedOutput = baseDocument === derivedDocument ? baseOutput : await generateProfileTree(context, generator, derivedDocument, 'tas-python-derived-');
        const script = `import importlib, pathlib, sys, types
base_output, derived_output, library, namespace, base_root = sys.argv[1:]
for name, directory in [(library, base_output), (base_root, base_output), ('Library', derived_output)]:
    package = types.ModuleType(name)
    package.__path__ = [str(pathlib.Path(directory) / 'helpers')]
    sys.modules[name] = package
external = 'TasMdk__CommonModels.test_utils.TasMdk.Model'
sys.modules[external] = types.ModuleType(external)
sys.modules[external].ModelWrapper = type('ModelWrapper', (), {})
base = importlib.import_module(base_root + '.test_utils.' + namespace + '.Base').BaseWrapper
derived = importlib.import_module('Library.test_utils.consumer.Derived').DerivedWrapper
assert issubclass(derived, base)
assert base.builder is importlib.import_module(library + '.builder.' + namespace + '.Base')
assert derived.builder is importlib.import_module('Library.builder.consumer.Derived')
`;
        const result = spawnSync('python3', ['-c', script, baseOutput, derivedOutput, baseLibrary, namespace, baseRoot], { encoding: 'utf8' });
        expect(result.status, result.stdout + result.stderr).toBe(0);
    } finally {
        await cleanupProfileGeneratorTestContext(context);
    }
});
