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
    ['2147483647 + 1', undefined], ['Min32 - 1', undefined],
    ['46341 * 46341', undefined], ['Min32 / -1', undefined], ['Min32 % -1', undefined],
    ['-Min32', undefined], ['9223372036854775807L + 1L', undefined],
    ['Min64 - 1L', undefined], ['Min64 * -1L', undefined], ['Min64 / -1L', undefined],
    ['Min64 % -1L', undefined], ['-Min64', undefined],
    ['2147483647 + 1L', 2147483648n], ['Min32 + 1', -2147483647n],
    ['Min64 + 1L', -9223372036854775807n], ['Min32 / 1', -2147483648n],
    ['Min64 % 1L', 0n], ['4294967295U + 1U', 0n],
    ['0U - 1U', 4294967295n], ['-1U', 4294967295n],
    ['18446744073709551615UL + 1UL', 0n], ['Tiny + 1', 128n],
    ['false && (2147483647 + 1)', false], ['true || -Min64', true],
] as const)('diagnoses signed overflow without changing valid arithmetic: %s', async (expression, expected) => {
    const document = await parseHelper<ast.Catalogue>(services.xsmpcat)(`
        catalogue Overflow namespace overflow {
            /** @uuid fdb03784-ecac-49a6-9660-5c89711a64e3 */ public interface Values {
                constant Int8 Tiny = 127
                constant Int32 Min32 = -2147483647 - 1
                constant Int64 Min64 = -9223372036854775807L - 1L
                constant Int64 Value = ${expression}
            }
        }
    `);
    try {
        expect(document.parseResult.parserErrors).toEqual([]);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
        const errors = document.diagnostics?.filter(d => d.severity === 1).map(d => d.message) ?? [];
        expect(errors).toEqual(expected === undefined ? ['Signed arithmetic overflow.'] : []);
        const value = AstUtils.streamAllContents(document.parseResult.value).filter(ast.isConstant).toArray().at(-1)!;
        expect(getValue(value.value, () => {})?.getValue()).toBe(expected);
    } finally {
        await clearDocuments(services.shared, [document]);
    }
});
