import { beforeAll, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast-partial';
import { getValue } from '@xsmp/core/utils';

let services: ReturnType<typeof createXsmpServices>;
beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

test.each([
    ['1 << 32', undefined], ['1 >> 32', undefined],
    ['1U << 32', undefined], ['1L << 64', undefined], ['1UL >> 64', undefined],
    ['Tiny << 32UL', undefined], ['1 << 50000000', undefined],
    ['1 << 30', 1073741824n], ['1 << 31', -2147483648n],
    ['1U << 31', 2147483648n], ['1L << 32', 4294967296n],
    ['1L << 62', 4611686018427387904n], ['1UL << 63', 9223372036854775808n],
    ['Tiny << 8UL', 256n], ['1L >> 63', 0n], ['1 << 0', 1n],
] as const)('checks the promoted left operand width in %s', async (expression, expected) => {
    const document = await parseHelper<ast.Catalogue>(services.xsmpcat)(`
        catalogue Shifts namespace shifts {
            /** @uuid 0156c996-337f-497f-8f5b-16b2d95e2615 */ public interface Values {
                constant Int8 Tiny = 1
                constant UInt64 Value = ${expression}
            }
        }
    `);
    try {
        expect(document.parseResult.parserErrors).toEqual([]);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });
        const value = AstUtils.streamAllContents(document.parseResult.value).filter(ast.isConstant).toArray().at(-1)!;
        const errors: string[] = [];
        expect(getValue(value.value, (_, message) => errors.push(message))?.getValue()).toBe(expected);
        expect(errors).toEqual(expected === undefined
            ? [expect.stringContaining('Shift amount must be less than the promoted operand width')]
            : []);
    } finally {
        await clearDocuments(services.shared, [document]);
    }
});
