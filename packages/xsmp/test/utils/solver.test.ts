import { beforeAll, describe, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem, type LangiumDocument } from 'langium';
import { parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast-partial';
import { getValue } from '@xsmp/core/utils';

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
