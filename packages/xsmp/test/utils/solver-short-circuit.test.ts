import { beforeAll, describe, expect, test, vi } from 'vitest';
import { AstUtils, EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast-partial';
import { getValue } from '@xsmp/core/utils';

let services: ReturnType<typeof createXsmpServices>;
beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

async function expression(text: string) {
    const document = await parseHelper<ast.Catalogue>(services.xsmpcat)(`
        catalogue Logical namespace logical {
            /** @uuid 23d63efd-e850-4c90-b01d-10c8cc811d8e */ public interface Values {
                constant Float64 Expensive = $sqrt(4.0)
                constant Bool Result = ${text}
            }
        }
    `);
    expect(document.parseResult.parserErrors).toEqual([]);
    await services.shared.workspace.DocumentBuilder.build([document], { validation: false });
    return AstUtils.streamAllContents(document.parseResult.value).filter(ast.isConstant).toArray().at(-1)!.value;
}

describe('Logical short circuit', () => {
    test.each([
        ['false && (1 / 0 == 0)', false], ['true || (1 / 0 == 0)', true],
        ['false && (1 / (1 - 1) == 0)', false], ['true || (1 << -1)', true],
        ['false && (0 % 0)', false], ['true || (false && (1 / 0))', true],
    ] as const)('does not compute the unused branch of %s', async (text, expected) => {
        const value = await expression(text);
        const errors: string[] = [];
        expect(getValue(value, (_, message) => errors.push(message))?.getValue()).toBe(expected);
        expect(errors).toEqual([]);
    });

    test.each(['false && $sqrt(-1.0)', 'true || Expensive'])('does not call math functions for %s', async text => {
        const value = await expression(text);
        const sqrt = vi.spyOn(Math, 'sqrt');
        try {
            expect(getValue(value)?.getValue()).toBe(text.startsWith('true'));
            expect(sqrt).not.toHaveBeenCalled();
        } finally {
            sqrt.mockRestore();
        }
    });

    test.each([
        ['false && ("text" - 1)', 'Binary operator'],
        ['true || $unknown(1)', 'Unknown built-in function'],
        ['true || $sqrt("text")', 'cannot be converted'],
        ['false && (true || ("text" / 2))', 'Binary operator'],
    ])('still checks types in the unused branch of %s', async (text, diagnostic) => {
        const errors: string[] = [];
        getValue(await expression(text), (_, message) => errors.push(message));
        expect(errors.some(error => error.includes(diagnostic))).toBe(true);
    });

    test.each(['true && (1 / 0)', 'false || (1 / 0)'])('still evaluates the required branch of %s', async text => {
        const errors: string[] = [];
        expect(getValue(await expression(text), (_, message) => errors.push(message))).toBeUndefined();
        expect(errors).toContain('Division by zero.');
    });
});
