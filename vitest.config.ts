import * as path from 'node:path';
import { defineConfig } from 'vitest/config';

const repoRoot = __dirname;
const xsmpSrcRoot = path.join(repoRoot, 'packages', 'xsmp', 'src');

const publicEntryPoints = {
    '@xsmp/core': path.join(xsmpSrcRoot, 'index.ts'),
    '@xsmp/core/ast': path.join(xsmpSrcRoot, 'generated', 'ast.ts'),
    '@xsmp/core/ast-partial': path.join(xsmpSrcRoot, 'generated', 'ast-partial.ts'),
    '@xsmp/core/contributions': path.join(xsmpSrcRoot, 'contributions/index.ts'),
    '@xsmp/core/grammar': path.join(xsmpSrcRoot, 'generated', 'grammar.ts'),
    '@xsmp/core/generator': path.join(xsmpSrcRoot, 'generator/index.ts'),
    '@xsmp/core/generator/cpp': path.join(xsmpSrcRoot, 'generator/cpp/index.ts'),
    '@xsmp/core/lsp': path.join(xsmpSrcRoot, 'lsp/index.ts'),
    '@xsmp/core/references': path.join(xsmpSrcRoot, 'references/index.ts'),
    '@xsmp/core/smp': path.join(xsmpSrcRoot, 'smp/index.ts'),
    '@xsmp/core/utils': path.join(xsmpSrcRoot, 'utils/index.ts'),
    '@xsmp/core/validation': path.join(xsmpSrcRoot, 'validation/index.ts'),
    '@xsmp/core/wizard': path.join(xsmpSrcRoot, 'wizard/index.ts'),
    '@xsmp/core/wizard/templates': path.join(xsmpSrcRoot, 'wizard/templates.ts'),
    '@xsmp/core/workspace': path.join(xsmpSrcRoot, 'workspace/index.ts'),
    '@xsmp/cli': path.join(repoRoot, 'packages', 'xsmp-cli', 'src', 'index.ts'),
    '@xsmp/tool-smp': path.join(repoRoot, 'packages', 'xsmp-tool-smp', 'src', 'index.ts'),
    '@xsmp/tool-adoc': path.join(repoRoot, 'packages', 'xsmp-tool-adoc', 'src', 'index.ts'),
    '@xsmp/tool-python': path.join(repoRoot, 'packages', 'xsmp-tool-python', 'src', 'index.ts'),
    '@xsmp/profile-xsmp-sdk': path.join(repoRoot, 'packages', 'xsmp-profile-xsmp-sdk', 'src', 'index.ts'),
    '@xsmp/profile-esa-cdk': path.join(repoRoot, 'packages', 'xsmp-profile-esa-cdk', 'src', 'index.ts'),
    'xsmp-tas-mdk': path.join(repoRoot, 'packages', 'xsmp-tas-mdk', 'src', 'index.ts'),
} as const;

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveAlias(importPath: string): string | undefined {
    const direct = publicEntryPoints[importPath as keyof typeof publicEntryPoints];
    if (direct) {
        return direct;
    }
    if (importPath.startsWith('@xsmp/core/smp/')) {
        return path.join(xsmpSrcRoot, `smp/${importPath.slice('@xsmp/core/smp/'.length)}.ts`);
    }
    return undefined;
}

export default defineConfig({
    plugins: [{
        name: 'xsmp-workspace-alias-plugin',
        enforce: 'pre',
        resolveId(source) {
            return resolveAlias(source);
        },
    }],
    resolve: {
        alias: [
            ...Object.entries(publicEntryPoints).map(([find, replacement]) => ({
                find: new RegExp(`^${escapeRegExp(find)}$`),
                replacement,
            })),
            {
                find: /^@xsmp\/core\/smp\/(.+)$/,
                replacement: path.join(xsmpSrcRoot, 'smp/$1.ts'),
            },
        ],
    },
    test: {
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov', 'html'],
            include: ['packages/*/src/**/*.ts'],
            exclude: ['**/generated/**', '**/.types/**', '**/lib/**', '**/out/**', '**/*.d.ts'],
            reportOnFailure: true,
            thresholds: {
                statements: 76,
                branches: 64,
                functions: 82,
                lines: 75,
            },
        },
        deps: {
            interopDefault: true,
        },
        include: ['packages/*/test/**/*.test.ts'],
    },
});
