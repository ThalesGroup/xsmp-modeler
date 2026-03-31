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
const cjsRequireBanner = `import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);\n`;

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
    treeShaking: true,
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
    const builtinEntries = {};

    for (const builtinPackage of vscodeBuiltinWorkspacePackages) {
        const targetDir = path.join(stagedBuiltinPackagesDir, builtinPackage.shortName);
        const sourceLibDir = path.join(builtinPackage.dir, 'lib');
        const targetLibDir = path.join(targetDir, 'lib');
        await fs.mkdir(targetDir, { recursive: true });
        await copyVscodeBuiltinRuntimeAssets(sourceLibDir, targetLibDir);
        builtinEntries[`${builtinPackage.shortName}/lib/index`] = path.join(sourceLibDir, 'index.js');
    }

    await bundleVscodeBuiltinPackages(builtinEntries);
    await cleanupStagedBuiltinPackageMetadata();
}

async function bundleVscodeBuiltinPackages(entryPoints) {
    if (Object.keys(entryPoints).length === 0) {
        return;
    }

    await esbuild.build({
        entryPoints,
        outdir: stagedBuiltinPackagesDir,
        bundle: true,
        format: 'esm',
        platform: 'node',
        target: 'ES2020',
        minify,
        treeShaking: true,
        banner: { js: cjsRequireBanner },
        splitting: true,
        write: true,
    });
}

async function copyVscodeBuiltinRuntimeAssets(sourceDir, outputDir) {
    await fs.rm(outputDir, { recursive: true, force: true });
    await copyRuntimeAssetDirectory(sourceDir, outputDir);
}

async function copyRuntimeAssetDirectory(sourceDir, outputDir) {
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
        const sourcePath = path.join(sourceDir, entry.name);
        const outputPath = path.join(outputDir, entry.name);

        if (entry.isDirectory()) {
            await copyRuntimeAssetDirectory(sourcePath, outputPath);
            continue;
        }
        if (entry.name.endsWith('.js') || entry.name.endsWith('.d.ts') || entry.name.endsWith('.map')) {
            continue;
        }

        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.copyFile(sourcePath, outputPath);
    }
}

async function cleanupStagedBuiltinPackageMetadata() {
    for (const builtinPackage of vscodeBuiltinWorkspacePackages) {
        const packageMetadata = path.join(stagedBuiltinPackagesDir, builtinPackage.shortName, 'package.json');
        await fs.rm(packageMetadata, { force: true });
    }
}
