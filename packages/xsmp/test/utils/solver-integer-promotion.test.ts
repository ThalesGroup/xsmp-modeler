import { beforeAll, describe, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast-partial';
import { getValue, PTK } from '@xsmp/core/utils';

let services: ReturnType<typeof createXsmpServices>;
beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

describe('Integral promotions and literal types', () => {
    test.each([
        ['Wide + Tiny', 257n, PTK.Int32], ['Tiny + Wide', 257n, PTK.Int32],
        ['Wide - Tiny', 255n, PTK.Int32], ['Tiny * Wide', 256n, PTK.Int32],
        ['-1 < 1U', false, PTK.Bool], ['1U > -1', false, PTK.Bool],
        ['-1 == 4294967295U', true, PTK.Bool], ['-1 != 4294967295U', false, PTK.Bool],
        ['-1 / 2U', 2147483647n, PTK.UInt32], ['-1 % 3U', 0n, PTK.UInt32],
        ['-1L < 1U', true, PTK.Bool], ['-1L < 1UL', false, PTK.Bool],
        ['Tiny << 8UL', 256n, PTK.Int32], ['Wide >> 1UL', 128n, PTK.Int32],
        ['+Tiny', 1n, PTK.Int32], ['~Tiny', -2n, PTK.Int32], ['-SmallUnsigned', -255n, PTK.Int32],
        ['true + true', 2n, PTK.Int32],
        ['2147483648', 2147483648n, PTK.Int64],
        ['-2147483648', -2147483648n, PTK.Int64],
        ['4294967295', 4294967295n, PTK.Int64],
        ['0xFFFFFFFF', 4294967295n, PTK.UInt32],
        ['037777777777', 4294967295n, PTK.UInt32],
        ['0xFFFFFFFFL', 4294967295n, PTK.Int64],
        ['18446744073709551615UL', 18446744073709551615n, PTK.UInt64],
    ] as const)('evaluates %s with its promoted type', async (expression, expected, kind) => {
        const document = await parseHelper<ast.Catalogue>(services.xsmpcat)(`
            catalogue Promotion namespace promotion {
                /** @uuid fa3e38d7-4535-4219-98f2-5aa29412f19b */ public interface Values {
                    constant Int8 Tiny = 1
                    constant UInt8 SmallUnsigned = 255
                    constant Int32 Wide = 256
                    constant Int64 Result = ${expression}
                }
            }
        `);
        expect(document.parseResult.parserErrors).toEqual([]);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });
        const constant = AstUtils.streamAllContents(document.parseResult.value).filter(ast.isConstant).toArray().at(-1)!;
        const errors: string[] = [];
        const result = getValue(constant.value, (_, message) => errors.push(message));
        expect(errors).toEqual([]);
        expect(result?.getValue()).toBe(expected);
        expect(result?.primitiveTypeKind()).toBe(kind);
    });
});
