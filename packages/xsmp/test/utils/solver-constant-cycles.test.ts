import { expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast-partial';
import { getValue } from '@xsmp/core/utils';

async function validate(declarations: string) {
    const services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
    const document = await parseHelper<ast.Catalogue>(services.xsmpcat)(`catalogue Cycles namespace cycles {
        /** @uuid c8e231d5-ced7-46bc-a421-f7e64a667def */ public interface Values {
            ${declarations}
        }
    }`);
    expect(document.parseResult.parserErrors).toEqual([]);
    await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    return { services, document };
}

test.each([
    ['self', 'constant Int32 A = A', 1],
    ['mutual', 'constant Int32 A = B constant Int32 B = A', 2],
    ['long cycle', 'constant Int32 A = B constant Int32 B = C constant Int32 C = A', 3],
    ['repeated references', 'constant Int32 A = A constant Int32 B = A + A', 2],
] as const)('reports one useful diagnostic per initializer in a %s cycle', async (_name, declarations, count) => {
    const { services, document } = await validate(declarations);
    try {
        const errors = document.diagnostics?.filter(diagnostic => diagnostic.severity === 1) ?? [];
        expect(errors).toHaveLength(count);
        expect(errors.every(error => error.message.startsWith("Cyclic constant initializer involving 'cycles.Values."))).toBe(true);
        const constants = AstUtils.streamAllContents(document.parseResult.value).filter(ast.isConstant).toArray();
        expect(errors.map(error => document.textDocument.getText(error.range)))
            .toEqual(constants.map(constant => constant.value?.$cstNode?.text));
        for (const constant of constants) expect(getValue(constant.value)).toBeUndefined();
    } finally {
        await clearDocuments(services.shared, [document]);
    }
});

test('does not confuse a cached invalid initializer with an active cycle', async () => {
    const { services, document } = await validate('constant Int8 Invalid = 256 constant Int32 Use = Invalid + Invalid');
    try {
        expect(document.diagnostics?.filter(diagnostic => diagnostic.severity === 1).map(error => error.message))
            .toEqual(['Int32 cannot be converted to Smp.Int8.']);
    } finally {
        await clearDocuments(services.shared, [document]);
    }
});

test('does not follow references in short-circuited branches', async () => {
    const { services, document } = await validate(`
        constant Bool OrSelf = true || OrSelf
        constant Bool AndSelf = false && AndSelf
        constant Bool Combined = OrSelf && !AndSelf
    `);
    try {
        expect(document.diagnostics?.filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
        const constants = AstUtils.streamAllContents(document.parseResult.value).filter(ast.isConstant).toArray();
        expect(constants.map(constant => getValue(constant.value)?.getValue())).toEqual([true, false, true]);
    } finally {
        await clearDocuments(services.shared, [document]);
    }
});
