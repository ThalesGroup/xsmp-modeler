//@ts-check
import * as esbuild from 'esbuild';
import { copy } from 'esbuild-plugin-copy'; // Plugin to handle file copying

const watch = process.argv.includes('--watch');
const minify = process.argv.includes('--minify');

const success = watch ? 'Watch build succeeded' : 'Build succeeded';

function getTime() {
    const date = new Date();
    return `[${`${padZeroes(date.getHours())}:${padZeroes(date.getMinutes())}:${padZeroes(date.getSeconds())}`}] `;
}

function padZeroes(i) {
    return i.toString().padStart(2, '0');
}

const plugins = [
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

const ctx = await esbuild.context({
    // Entry points for the vscode extension and the language server
    entryPoints: [
        'src/extension/main.ts',
        'src/language/main.ts',
        'src/contributions/tools/smp/contributor.ts',
        'src/contributions/tools/adoc/contributor.ts',
        'src/contributions/tools/python/contributor.ts',
        'src/contributions/profiles/xsmp-sdk/contributor.ts',
        'src/contributions/profiles/esa-cdk/contributor.ts',
        'src/contributions/profiles/tas-mdk/contributor.ts',
    ],
    outdir: 'out',
    bundle: true,
    target: "ES2017",
    // VSCode's extension host is still using cjs, so we need to transform the code
    format: 'cjs',
    // To prevent confusing node, we explicitly use the `.cjs` extension
    outExtension: {
        '.js': '.cjs'
    },
    loader: { '.ts': 'ts' },
    external: ['vscode'],
    platform: 'node',
    sourcemap: !minify,
    minify,
    plugins
});

if (watch) {
    await ctx.watch();
} else {
    await ctx.rebuild();
    ctx.dispose();
}
