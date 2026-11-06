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

    test('collects public non-static fields from every base before derived fields', async () => {
        const root = await parseMembers(`
            public class FieldBase {
                public field Int32 first
                protected field Int32 protectedField
                private field Int32 privateField
                @Attributes.Static public field Int32 staticField
            }
            public class FieldMiddle extends FieldBase { public field Bool second }
            public class FieldDerived extends FieldMiddle {
                public field Float64 third
                field Int32 implicitPrivateField
            }
        `);
        const derived = AstUtils.streamAllContents(root).find(node => ast.isClass(node) && node.name === 'FieldDerived') as ast.Class;
        const helper = new AttributeHelper(services.shared);

        expect(helper.getAllFields(derived).map(field => field.name).toArray()).toEqual(['first', 'second', 'third']);
    });

    test('terminates on cyclic and unresolved class bases', async () => {
        const root = await parseMembers(`
            public class FieldCycleA extends FieldCycleB { public field Int32 a }
            public class FieldCycleB extends FieldCycleA { public field Int32 b }
            public class FieldUnresolved extends MissingFieldBase { public field Int32 own }
        `);
        const types = AstUtils.streamAllContents(root).filter(ast.isClass).toArray();
        const helper = new AttributeHelper(services.shared);

        expect(helper.getAllFields(types[0]).map(field => field.name).toArray()).toEqual(['b', 'a']);
        expect(helper.getAllFields(types[2]).map(field => field.name).toArray()).toEqual(['own']);
    });
});
