/*
 * For a detailed explanation regarding each configuration property and type check, visit:
 * https://vitest.dev/config/
 */
import * as path from 'node:path';
import { defineConfig } from 'vitest/config';

const srcRoot = path.resolve(__dirname, 'src');
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
} as const;

export default defineConfig({
    resolve: {
        alias: Object.entries(publicEntryPoints).map(([find, replacement]) => ({ find, replacement })),
    },
    test: {
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov', 'html'],
            include: ['src/**/*.ts'],
            exclude: ['**/generated'],
        },
        deps: {
            interopDefault: true
        },
        include: ['**/*.test.ts']
    }
});
