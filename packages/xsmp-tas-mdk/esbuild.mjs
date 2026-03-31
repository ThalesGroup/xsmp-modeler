import * as esbuild from 'esbuild';
import * as path from 'node:path';
const packageDir = process.cwd();
const outDir = path.join(packageDir, 'lib');
const minify = process.argv.includes('--minify');
const cjsRequireBanner = `import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);\n`;

await esbuild.build({
    entryPoints: {
        contributor: path.join(outDir, 'contributor.js'),
    },
    outdir: outDir,
    allowOverwrite: true,
    bundle: true,
    target: 'ES2020',
    format: 'esm',
    platform: 'node',
    banner: {
        js: cjsRequireBanner,
    },
    sourcemap: !minify,
    minify,
    treeShaking: true,
});
