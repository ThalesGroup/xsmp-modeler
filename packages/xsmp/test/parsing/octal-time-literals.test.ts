import { afterEach, beforeAll, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem, type LangiumDocument } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast-partial';
import { getValue } from '@xsmp/core/utils';

const services = createXsmpServices(EmptyFileSystem);
const parse = parseHelper(services.xsmpcat);
const documents: LangiumDocument[] = [];
beforeAll(async () => services.shared.workspace.WorkspaceManager.initializeWorkspace([]));
afterEach(async () => clearDocuments(services.shared, documents.splice(0)));

test.each([
    ['ns', 1n], ['us', 1_000n], ['ms', 1_000_000n], ['s', 1_000_000_000n],
    ['mn', 60_000_000_000n], ['h', 3_600_000_000_000n], ['d', 86_400_000_000_000n],
] as const)('preserves integer bases with the %s time suffix', async (unit, scale) => {
    const literals = ['010', "0'10", "01'0", '10', '0', '000', '-010'];
    const expected = [8n, 8n, 8n, 10n, 0n, 0n, -8n];
    const document = await parse(`catalogue TimeLiterals namespace time {
        /** @uuid 38000000-0000-4000-8000-000000000001 */
        public class Values { ${literals.map((literal, index) => `
            public constant Duration direct${index} = ${literal}${unit}
            public constant Duration product${index} = ${literal} * 1${unit}`).join('\n')}
        }
    }`, { validation: true });
    documents.push(document);
    expect(document.parseResult.lexerErrors).toEqual([]);
    expect(document.parseResult.parserErrors).toEqual([]);
    expect((document.diagnostics ?? []).filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
    const constants = AstUtils.streamAllContents(document.parseResult.value).filter(ast.isConstant).toArray();
    for (const [index, value] of expected.entries()) {
        expect(getValue(constants[2 * index].value)?.getValue()).toBe(value * scale);
        expect(getValue(constants[2 * index + 1].value)?.getValue()).toBe(value * scale);
    }
});
