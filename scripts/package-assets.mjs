import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { builtinWorkspacePackages, repoRoot } from './workspace-build-utils.mjs';

export async function copyNonTsAssets(sourceDir, outputDir) {
    await copyAssetDirectory(sourceDir, outputDir);
}

export async function copyXsmpBuiltins(packageDir) {
    const sourceDir = path.join(packageDir, 'src', 'builtins');
    const outputDir = path.join(packageDir, 'lib', 'builtins');
    await fs.rm(outputDir, { recursive: true, force: true });
    await fs.cp(sourceDir, outputDir, { recursive: true });
}

export async function copyWorkspaceAssets() {
    await copyXsmpBuiltins(path.join(repoRoot, 'packages', 'xsmp'));

    for (const builtinPackage of builtinWorkspacePackages) {
        await copyNonTsAssets(path.join(builtinPackage.dir, 'src'), path.join(builtinPackage.dir, 'lib'));
    }
}

async function copyAssetDirectory(sourceDir, outputDir) {
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
        const sourcePath = path.join(sourceDir, entry.name);
        const outputPath = path.join(outputDir, entry.name);

        if (entry.isDirectory()) {
            await copyAssetDirectory(sourcePath, outputPath);
            continue;
        }
        if (entry.name.endsWith('.ts')) {
            continue;
        }

        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.copyFile(sourcePath, outputPath);
    }
}

async function main() {
    const command = process.argv[2];
    switch (command) {
        case 'workspace':
            await copyWorkspaceAssets();
            break;
        case 'package': {
            const packageDir = process.cwd();
            await copyNonTsAssets(path.join(packageDir, 'src'), path.join(packageDir, 'lib'));
            break;
        }
        case 'xsmp-builtins':
            await copyXsmpBuiltins(process.cwd());
            break;
        case undefined:
            break;
        default:
            throw new Error(`Unknown package-assets command '${command}'. Expected one of: workspace, package, xsmp-builtins.`);
    }
}

await main();
