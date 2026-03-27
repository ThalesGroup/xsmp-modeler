import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { loadVscodeBuiltinContributionPackages } from '../src/builtin-packages.js';

const tempDirs: string[] = [];
const builtinPackageNames = [
    '@xsmp/tool-smp',
    '@xsmp/tool-adoc',
    '@xsmp/tool-python',
    '@xsmp/profile-xsmp-sdk',
    '@xsmp/profile-esa-cdk',
] as const;

afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map(tempDir => fs.rm(tempDir, { recursive: true, force: true })));
});

describe('VS Code builtin package loader', () => {
    test('loads vendorized built-in contribution packages from out/vendor', async () => {
        const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xsmp-vscode-builtins-'));
        tempDirs.push(tempDir);

        for (const packageName of builtinPackageNames) {
            const [, shortName] = packageName.split('/');
            const packageDir = path.join(tempDir, shortName, 'lib');
            await fs.mkdir(packageDir, { recursive: true });
            await fs.writeFile(
                path.join(packageDir, 'index.js'),
                [
                    `export const xsmpContributionPackage = {`,
                    `  name: ${JSON.stringify(packageName)},`,
                    `  extensionId: ${JSON.stringify(packageName)},`,
                    `  descriptorUrl: new URL('./descriptor', import.meta.url),`,
                    `  registerContribution() {},`,
                    `};`,
                ].join('\n'),
            );
        }

        const packages = await loadVscodeBuiltinContributionPackages(tempDir);

        expect(packages.map(entry => entry.name)).toEqual([...builtinPackageNames]);
    });
});
