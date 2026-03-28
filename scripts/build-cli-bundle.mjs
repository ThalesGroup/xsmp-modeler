import { build } from 'esbuild';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { repoRoot } from './workspace-build-utils.mjs';

const outputDir = path.join(repoRoot, 'out', 'cli-bundle');
const cliPackageJsonPath = path.join(repoRoot, 'packages', 'xsmp-cli', 'package.json');
const cliVersion = JSON.parse(await fsp.readFile(cliPackageJsonPath, 'utf8')).version;
const artifactPath = path.join(outputDir, `xsmpproject-cli-${cliVersion}.cjs`);

await fsp.mkdir(outputDir, { recursive: true });

const embeddedTextAssets = await collectEmbeddedTextAssets();
const embeddedAssetsHash = crypto.createHash('sha256')
    .update(JSON.stringify(embeddedTextAssets))
    .digest('hex')
    .slice(0, 16);

await build({
    entryPoints: [path.join(repoRoot, 'packages', 'xsmp-cli', 'bundle', 'entry.cjs')],
    outfile: artifactPath,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20.19',
    external: ['node:*'],
    banner: {
        js: '#!/usr/bin/env node',
    },
    define: {
        __XSMP_CLI_VERSION__: JSON.stringify(cliVersion),
    },
    plugins: [
        {
            name: 'xsmp-cli-bundle-alias',
            setup(esbuild) {
                esbuild.onResolve({ filter: /^\.\/builtin-packages\.js$/ }, args => {
                    const candidate = path.resolve(args.resolveDir, 'builtin-packages.js');
                    const sourcePath = path.join(repoRoot, 'packages', 'xsmp-cli', 'src', 'builtin-packages.js');
                    if (candidate === sourcePath) {
                        return { path: path.join(repoRoot, 'packages', 'xsmp-cli', 'bundle', 'builtin-packages-bundle.mjs') };
                    }
                    return undefined;
                });
                esbuild.onResolve({ filter: /^xsmp-cli-embedded-assets$/ }, () => ({
                    path: 'xsmp-cli-embedded-assets',
                    namespace: 'xsmp-cli-embedded-assets',
                }));
                esbuild.onLoad({ filter: /.*/, namespace: 'xsmp-cli-embedded-assets' }, () => ({
                    contents: [
                        `export const embeddedTextAssets = ${JSON.stringify(embeddedTextAssets)};`,
                        `export const embeddedAssetsHash = ${JSON.stringify(embeddedAssetsHash)};`,
                    ].join('\n'),
                    loader: 'js',
                }));
            },
        },
    ],
});

await fsp.chmod(artifactPath, 0o755);
console.log(artifactPath);

async function collectEmbeddedTextAssets() {
    const assets = {};

    const descriptorAssets = [
        ['contributions/@xsmp/tool-smp/smp.xsmptool', resolveTextAsset('packages/xsmp-tool-smp/lib/smp.xsmptool', 'packages/xsmp-tool-smp/src/smp.xsmptool')],
        ['contributions/@xsmp/tool-adoc/adoc.xsmptool', resolveTextAsset('packages/xsmp-tool-adoc/lib/adoc.xsmptool', 'packages/xsmp-tool-adoc/src/adoc.xsmptool')],
        ['contributions/@xsmp/tool-python/python.xsmptool', resolveTextAsset('packages/xsmp-tool-python/lib/python.xsmptool', 'packages/xsmp-tool-python/src/python.xsmptool')],
        ['contributions/@xsmp/profile-xsmp-sdk/xsmp-sdk.xsmpprofile', resolveTextAsset('packages/xsmp-profile-xsmp-sdk/lib/xsmp-sdk.xsmpprofile', 'packages/xsmp-profile-xsmp-sdk/src/xsmp-sdk.xsmpprofile')],
        ['contributions/@xsmp/profile-esa-cdk/esa-cdk.xsmpprofile', resolveTextAsset('packages/xsmp-profile-esa-cdk/lib/esa-cdk.xsmpprofile', 'packages/xsmp-profile-esa-cdk/src/esa-cdk.xsmpprofile')],
        ['contributions/xsmp-tas-mdk/tas-mdk.xsmpprofile', resolveTextAsset('packages/xsmp-tas-mdk/lib/tas-mdk.xsmpprofile', 'packages/xsmp-tas-mdk/src/tas-mdk.xsmpprofile')],
    ];

    for (const [relativePath, sourcePath] of descriptorAssets) {
        assets[relativePath] = await fsp.readFile(sourcePath, 'utf8');
    }

    const builtinsDir = resolveDirectory('packages/xsmp/lib/builtins', 'packages/xsmp/src/builtins');
    for await (const sourcePath of walkFiles(builtinsDir)) {
        const relativeBuiltinPath = path.relative(builtinsDir, sourcePath);
        assets[path.join('xsmp', 'builtins', relativeBuiltinPath)] = await fsp.readFile(sourcePath, 'utf8');
    }

    return assets;
}

function resolveTextAsset(...relativeCandidates) {
    for (const candidate of relativeCandidates) {
        const absoluteCandidate = path.join(repoRoot, candidate);
        if (fs.existsSync(absoluteCandidate)) {
            return absoluteCandidate;
        }
    }
    throw new Error(`Unable to locate any asset in: ${relativeCandidates.join(', ')}`);
}

function resolveDirectory(...relativeCandidates) {
    for (const candidate of relativeCandidates) {
        const absoluteCandidate = path.join(repoRoot, candidate);
        if (fs.existsSync(absoluteCandidate)) {
            return absoluteCandidate;
        }
    }
    throw new Error(`Unable to locate any directory in: ${relativeCandidates.join(', ')}`);
}

async function* walkFiles(rootDir) {
    const entries = await fsp.readdir(rootDir, { withFileTypes: true });
    for (const entry of entries) {
        const currentPath = path.join(rootDir, entry.name);
        if (entry.isDirectory()) {
            yield* walkFiles(currentPath);
        } else {
            yield currentPath;
        }
    }
}
