import { beforeAll, describe, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast-partial';
import { AttributeHelper, OperatorKind } from '@xsmp/core/utils';

let services: ReturnType<typeof createXsmpServices>;
let parse: ReturnType<typeof parseHelper<ast.Catalogue>>;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parse = parseHelper<ast.Catalogue>(services.xsmpcat);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

// Counts how often the underlying attribute evaluation runs, to detect a cache that never hits.
class CountingAttributeHelper extends AttributeHelper {
    isAttributeTrueCalls = 0;
    override isAttributeTrue(attribute: ast.Attribute | undefined): boolean | undefined {
        this.isAttributeTrueCalls++;
        return super.isAttributeTrue(attribute);
    }
}

describe('AttributeHelper', () => {
    async function parseMembers(body: string) {
        const document = await parse(`
            catalogue test

            namespace demo
            {
                ${body}
            }
        `);
        expect(document.parseResult.parserErrors).toHaveLength(0);
        return document.parseResult.value;
    }

    test('memoizes per-node attribute lookups instead of recomputing every call', async () => {
        const root = await parseMembers(`
            /** @uuid 95f0dc0d-b10a-45fa-8160-3bb523fcad78 */
            public struct S { field Int32 f }
        `);
        const field = AstUtils.streamAllContents(root).find(ast.isField)!;
        const helper = new CountingAttributeHelper(services.shared);

        helper.isMutable(field);
        helper.isMutable(field);

        expect(helper.isAttributeTrueCalls).toBe(1);
    });

    test('does not share a cache entry between operatorKind and isConstructor', async () => {
        const root = await parseMembers(`
            /** @uuid 749f7302-7fa4-41b8-9185-b2d047c0a4c2 */
            public interface I { def void foo() }
        `);
        const op = AstUtils.streamAllContents(root).find(ast.isOperation)!;
        const helper = new AttributeHelper(services.shared);

        expect(helper.operatorKind(op)).toBe(OperatorKind.NONE);
        expect(helper.isConstructor(op)).toBe(false);
    });
});
