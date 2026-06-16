import { beforeAll, describe, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem, type ValidationAcceptor } from 'langium';
import { parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast-partial';
import { getValue, getValueAs, PTK } from '@xsmp/core/utils';

let services: ReturnType<typeof createXsmpServices>;
let parse: ReturnType<typeof parseHelper<ast.Catalogue>>;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parse = parseHelper<ast.Catalogue>(services.xsmpcat);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

describe('Solver comparison operators', () => {
    test('evaluates comparison operators on integers, floats and booleans', async () => {
        const document = await parse(`
            catalogue test

            namespace demo
            {
                /** @uuid 95f0dc0d-b10a-45fa-8160-3bb523fcad78 */
                public interface IConstants
                {
                    constant Bool intLess = 1 < 2
                    constant Bool intLessFalse = 2 < 1
                    constant Bool intGreater = 2 > 1
                    constant Bool intLessEqual = 2 <= 2
                    constant Bool intGreaterEqual = 2 >= 3
                    constant Bool intEqual = 2 == 2
                    constant Bool intNotEqual = 2 != 3
                    constant Bool floatLess = 1.5 < 2.5
                    constant Bool floatGreaterEqual = 2.5 >= 2.5
                    constant Bool boolEqual = true == false
                    constant Bool boolNotEqual = true != false
                }
            }
        `);
        expect(document.parseResult.parserErrors).toHaveLength(0);

        const constants = new Map(
            AstUtils.streamAllContents(document.parseResult.value)
                .filter(ast.isConstant)
                .map(constant => [constant.name, constant]),
        );
        const evaluate = (name: string): unknown => getValue(constants.get(name)!.value)?.getValue();

        expect(evaluate('intLess')).toBe(true);
        expect(evaluate('intLessFalse')).toBe(false);
        expect(evaluate('intGreater')).toBe(true);
        expect(evaluate('intLessEqual')).toBe(true);
        expect(evaluate('intGreaterEqual')).toBe(false);
        expect(evaluate('intEqual')).toBe(true);
        expect(evaluate('intNotEqual')).toBe(true);
        expect(evaluate('floatLess')).toBe(true);
        expect(evaluate('floatGreaterEqual')).toBe(true);
        expect(evaluate('boolEqual')).toBe(false);
        expect(evaluate('boolNotEqual')).toBe(true);
    });
});

describe('Solver robustness', () => {
    async function constants(body: string) {
        const document = await parse(`
            catalogue test

            namespace demo
            {
                /** @uuid 95f0dc0d-b10a-45fa-8160-3bb523fcad78 */
                public interface I
                {
                    ${body}
                }
            }
        `);
        expect(document.parseResult.parserErrors).toHaveLength(0);
        // Build (without validation) so cross-references between constants resolve.
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });
        return {
            document,
            byName: new Map(
                AstUtils.streamAllContents(document.parseResult.value)
                    .filter(ast.isConstant)
                    .map(constant => [constant.name, constant]),
            ),
        };
    }

    test('does not stack-overflow on circular constant references', async () => {
        const { byName } = await constants(`
            constant Int32 A = B
            constant Int32 B = A
            constant Int32 Self = Self
        `);
        // Sanity: the references resolved, so getValue would otherwise recurse forever.
        expect((byName.get('A')!.value as ast.NamedElementReference).value?.ref).toBe(byName.get('B'));

        for (const name of ['A', 'B', 'Self']) {
            expect(() => getValue(byName.get(name)!.value), name).not.toThrow();
            expect(getValue(byName.get(name)!.value)).toBeUndefined();
        }
    });

    test('interprets C-style octal integer literals in base 8', async () => {
        const { byName } = await constants(`constant Int32 oct = 017`);
        expect(getValue(byName.get('oct')!.value)?.getValue()).toBe(15n);
    });

    test('does not throw converting an out-of-range value to Char8', async () => {
        const { byName } = await constants(`constant Char8 c = 0x110000`);
        const expr = byName.get('c')!.value;

        expect(() => getValueAs(expr, PTK.Char8)).not.toThrow();
        expect(getValueAs(expr, PTK.Char8)).toBeUndefined();
    });

    test('reports a clean diagnostic on integer division by zero', async () => {
        const { byName } = await constants(`constant Int32 z = 1 / 0`);
        const messages: string[] = [];
        const accept = ((_severity: unknown, message: string) => { messages.push(message); }) as unknown as ValidationAcceptor;

        expect(() => getValue(byName.get('z')!.value, accept)).not.toThrow();
        expect(messages).toContain('Division by zero.');
    });

    test('reports a clean diagnostic on a negative shift amount', async () => {
        const { byName } = await constants(`constant Int32 s = 1 << -1`);
        const messages: string[] = [];
        const accept = ((_severity: unknown, message: string) => { messages.push(message); }) as unknown as ValidationAcceptor;

        expect(() => getValue(byName.get('s')!.value, accept)).not.toThrow();
        expect(messages).toContain('Shift amount must be non-negative.');
    });
});
