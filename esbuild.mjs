//@ts-check
import * as esbuild from 'esbuild';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { copy } from 'esbuild-plugin-copy'; // Plugin to handle file copying

const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');

const success = watch ? 'Watch build succeeded' : 'Build succeeded';
const srcRoot = path.resolve('src');
const contributionEntryPoints = [
    'src/contributions/tools/smp/contributor.ts',
    'src/contributions/tools/adoc/contributor.ts',
    'src/contributions/tools/python/contributor.ts',
    'src/contributions/profiles/xsmp-sdk/contributor.ts',
    'src/contributions/profiles/esa-cdk/contributor.ts',
    'src/contributions/profiles/tas-mdk/contributor.ts',
];
const publicEntryPoints = {
    'xsmp': path.join(srcRoot, 'index.ts'),
    'xsmp/ast': path.join(srcRoot, 'ast/index.ts'),
    'xsmp/ast-partial': path.join(srcRoot, 'ast-partial/index.ts'),
    'xsmp/contributions': path.join(srcRoot, 'contributions/index.ts'),
    'xsmp/grammar': path.join(srcRoot, 'grammar/index.ts'),
    'xsmp/generator': path.join(srcRoot, 'generator/index.ts'),
    'xsmp/generator/cpp': path.join(srcRoot, 'generator/cpp/index.ts'),
    'xsmp/lsp': path.join(srcRoot, 'lsp/index.ts'),
    'xsmp/references': path.join(srcRoot, 'references/index.ts'),
    'xsmp/utils': path.join(srcRoot, 'utils/index.ts'),
    'xsmp/validation': path.join(srcRoot, 'validation/index.ts'),
    'xsmp/wizard': path.join(srcRoot, 'wizard/index.ts'),
    'xsmp/workspace': path.join(srcRoot, 'workspace/index.ts'),
};

function getTime() {
    const date = new Date();
    return `[${`${padZeroes(date.getHours())}:${padZeroes(date.getMinutes())}:${padZeroes(date.getSeconds())}`}] `;
}

function padZeroes(i) {
    return i.toString().padStart(2, '0');
}

const basePlugins = [
    {
        name: 'xsmp-alias-plugin',
        setup(build) {
            build.onResolve({ filter: /^xsmp(?:\/.*)?$/ }, args => {
                const resolved = resolveXsmpAlias(args.path);
                if (resolved) {
                    return { path: resolved };
                }
                return undefined;
            });
        },
    },
    {
        name: 'watch-plugin',
        setup(build) {
            build.onEnd(result => {
                if (result.errors.length === 0) {
                    console.log(getTime() + success);
                }
            });
        },
    },
];

const copyPlugins = [
    copy({
        assets: {
            from: './src/lib/**',
            to: './lib/',
        },
    }),
    copy({
        assets: {
            from: [
                './src/contributions/**/*.xsmpcat',
                './src/contributions/**/*.xsmpcfg',
                './src/contributions/**/*.xsmpasb',
                './src/contributions/**/*.xsmplnk',
                './src/contributions/**/*.xsmpsed',
                './src/contributions/**/*.xsmptool',
                './src/contributions/**/*.xsmpprofile'
            ],
            to: './contributions/',
        },
    }),
];

function resolveXsmpAlias(importPath) {
    const resolved = publicEntryPoints[importPath];
    return resolved && fs.existsSync(resolved) ? resolved : undefined;
}

fs.rmSync(path.resolve('out/contributions'), { recursive: true, force: true });

const mainBuildOptions = {
    entryPoints: [
        'src/extension/main.ts',
        'src/language/main.ts',
    ],
    outdir: 'out',
    bundle: true,
    target: "ES2017",
    format: 'cjs',
    outExtension: {
        '.js': '.cjs'
    },
    loader: { '.ts': 'ts' },
    external: ['vscode'],
    platform: 'node',
    sourcemap: !minify,
    minify,
    plugins: [
        ...basePlugins,
        ...copyPlugins,
    ]
};

const contributionBuildOptions = {
    entryPoints: contributionEntryPoints,
    outdir: 'out/contributions',
    outbase: 'src/contributions',
    bundle: true,
    splitting: true,
    format: 'esm',
    target: "ES2017",
    // Built-in contributors are loaded through dynamic `import(...)`, but the bundled
    // Langium/tooling stack still expects classic Node globals in a few places.
    banner: {
        js: [
            "import { dirname as __xsmpDirname } from 'node:path';",
            "import { createRequire as __xsmpCreateRequire } from 'node:module';",
            "import { fileURLToPath as __xsmpFileURLToPath } from 'node:url';",
            "const require = __xsmpCreateRequire(import.meta.url);",
            "const __filename = __xsmpFileURLToPath(import.meta.url);",
            "const __dirname = __xsmpDirname(__filename);",
        ].join('\n'),
    },
    loader: { '.ts': 'ts' },
    external: ['vscode'],
    platform: 'node',
    sourcemap: !minify,
    minify,
    plugins: basePlugins,
};

if (watch) {
    const watchPlugin = {
        name: 'watch-plugin',
        setup(build) {
            build.onEnd(result => {
                if (result.errors.length === 0) {
                    console.log(getTime() + success);
                }
            });
        },
    };

    const mainCtx = await esbuild.context({
        ...mainBuildOptions,
        plugins: [...mainBuildOptions.plugins, watchPlugin],
    });
    const contributionCtx = await esbuild.context({
        ...contributionBuildOptions,
        plugins: [...contributionBuildOptions.plugins, watchPlugin],
    });
    await Promise.all([mainCtx.watch(), contributionCtx.watch()]);
} else {
    await esbuild.build(mainBuildOptions);
    await esbuild.build(contributionBuildOptions);
    console.log(getTime() + success);
}
