import { expect, test } from 'vitest';
import { URI } from 'langium';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { EsaCdkGenerator } from '@xsmp/profile-esa-cdk';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { TasMdkGenerator } from 'xsmp-tas-mdk';
import { rebuildTestDocuments } from '../test-services.js';
import { createProfileGeneratorTestContext, cleanupProfileGeneratorTestContext } from '../profile-generator-test-utils.js';

const compiler = ['g++', 'clang++'].find(candidate => spawnSync(candidate, ['--version']).status === 0);

test.skipIf(!compiler).each([XsmpSdkGenerator, EsaCdkGenerator, TasMdkGenerator])('%s retains package failures without retrying partial registration', async Generator => {
    const context = await createProfileGeneratorTestContext();
    try {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-package-initialization-'));
        context.tempDirs.push(directory);
        fs.mkdirSync(path.join(directory, 'src'));
        const project = await context.parseProject(`project 'Recovery' using 'ECSS_SMP_2025'
source 'src'
`, { documentUri: URI.file(path.join(directory, 'xsmp.project')).toString() });
        const dependency = await context.parseCatalogue(`catalogue Dependency namespace dependency {
            /** @uuid 87000000-0000-4000-8000-000000000001 */ public struct Trigger { field Int32 value }
        }`, { documentUri: URI.file(path.join(directory, 'src', 'Dependency.xsmpcat')).toString() });
        const document = await context.parseCatalogue(`catalogue Recovery namespace recovery {
            /** @uuid 87000000-0000-4000-8000-000000000002 */ public struct First { field dependency.Trigger dependency }
            /** @uuid 87000000-0000-4000-8000-000000000003 */ public enum Second { Value = 0 }
        }`, { documentUri: URI.file(path.join(directory, 'src', 'Recovery.xsmpcat')).toString() });
        context.documents.push(project, dependency, document);
        await rebuildTestDocuments(context.services, context.documents);
        for (const doc of context.documents) {
            expect(doc.parseResult.parserErrors).toEqual([]);
            expect(doc.diagnostics?.filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
        }
        const generator = new Generator(context.services.shared);
        const source = await generator.generatePackageSource('Recovery.cpp', document.parseResult.value, undefined);
        // Replace only includes with minimal registry/simulator stubs; execute the emitted lifecycle functions intact.
        const body = source.replace(/^#include.*$/gm, '');
        const harness = fs.readFileSync(path.join(__dirname, '../fixtures/profile-generators/package-initialization.cpp'), 'utf8');
        const file = path.join(directory, 'probe.cpp');
        const executable = path.join(directory, process.platform === 'win32' ? 'probe.exe' : 'probe');
        fs.writeFileSync(file, harness.replace('// @generated-package@', () => body));
        for (const version of ['202003', '202503']) {
            const compiled = spawnSync(compiler!, ['-std=c++11', `-DECSS_SMP_VERSION=${version}L`, file, '-o', executable], { encoding: 'utf8' });
            expect(compiled.status, compiled.stderr).toBe(0);
            const executed = spawnSync(executable, [], { encoding: 'utf8' });
            expect(executed.status, executed.stderr).toBe(0);
        }
    } finally {
        await cleanupProfileGeneratorTestContext(context);
    }
});
