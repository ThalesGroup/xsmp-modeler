import { beforeAll, describe, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast-partial';
import { getValueAs } from '@xsmp/core/utils';

let services: ReturnType<typeof createXsmpServices>;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

describe('Constrained float endpoints', () => {
    test.each([
        ['...', true, true],
        ['..<', true, false],
        ['<..', false, true],
        ['<.<', false, false],
    ] as const)('validates both endpoints of %s', async (range, allowMin, allowMax) => {
        const document = await parseHelper<ast.Catalogue>(services.xsmpcat)(`
            catalogue Bounds namespace bounds {
                /** @uuid 38d919e4-03cc-4e55-8279-7458e58b0da0 */
                public float Unit extends Float64 in 0.0 ${range} 1.0
                /** @uuid 38d919e4-03cc-4e55-8279-7458e58b0da1 */
                public interface Values {
                    constant Unit Below = -1.0
                    constant Unit Min = 0.0
                    constant Unit Inside = 0.5
                    constant Unit Max = 1.0
                    constant Unit Above = 2.0
                }
            }
        `);
        expect(document.parseResult.parserErrors).toEqual([]);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });
        const constants = AstUtils.streamAllContents(document.parseResult.value).filter(ast.isConstant).toArray();
        const allowed = [false, allowMin, true, allowMax, false];
        for (const [index, constant] of constants.entries()) {
            const errors: string[] = [];
            getValueAs(constant.value, constant.type!.ref!, (severity, message) => {
                if (severity === 'error') errors.push(message);
            });
            expect(errors.length === 0, `${range}: ${constant.name}`).toBe(allowed[index]);
        }
    });
});
