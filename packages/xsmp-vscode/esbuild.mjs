import * as esbuild from 'esbuild';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { repoRoot, vscodeBuiltinWorkspacePackages } from '../../scripts/workspace-build-utils.mjs';

const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');
const packageDir = process.cwd();
const outDir = path.join(packageDir, 'out');
const stagedDocsDir = path.join(outDir, 'docs');
const stagedVendorDir = path.join(outDir, 'vendor');
const stagedCoreBuiltinsDir = path.join(stagedVendorDir, 'xsmp', 'builtins');
const stagedBuiltinPackagesDir = path.join(stagedVendorDir, '@xsmp');

const plugins = [{
    name: 'stage-xsmp-assets',
    setup(build) {
        build.onEnd(async result => {
            if (result.errors.length > 0) {
                return;
            }
            await stageAssets();
        });
    },
}];

const ctx = await esbuild.context({
    entryPoints: {
        'extension/main': path.join(packageDir, 'src', 'extension', 'main.ts'),
        'language/main': path.join(packageDir, 'src', 'language-server', 'main.ts'),
    },
    outdir: outDir,
    outExtension: {
        '.js': '.cjs',
    },
    bundle: true,
    target: 'ES2020',
    format: 'cjs',
    platform: 'node',
    external: ['vscode'],
    sourcemap: !minify,
    minify,
    plugins,
});

if (watch) {
    await ctx.watch();
} else {
    await ctx.rebuild();
    await ctx.dispose();
}

async function stageAssets() {
    await fs.rm(stagedDocsDir, { recursive: true, force: true });
    await fs.rm(stagedVendorDir, { recursive: true, force: true });
    await fs.cp(path.join(repoRoot, 'docs'), stagedDocsDir, { recursive: true });
    await fs.mkdir(path.join(stagedVendorDir, 'xsmp'), { recursive: true });
    await fs.cp(path.join(repoRoot, 'packages', 'xsmp', 'lib', 'builtins'), stagedCoreBuiltinsDir, { recursive: true });
    await fs.mkdir(stagedBuiltinPackagesDir, { recursive: true });

    for (const builtinPackage of vscodeBuiltinWorkspacePackages) {
        const targetDir = path.join(stagedBuiltinPackagesDir, builtinPackage.shortName);
        await fs.mkdir(targetDir, { recursive: true });
        await fs.copyFile(path.join(builtinPackage.dir, 'package.json'), path.join(targetDir, 'package.json'));
        await fs.cp(path.join(builtinPackage.dir, 'lib'), path.join(targetDir, 'lib'), { recursive: true });
    }
}
