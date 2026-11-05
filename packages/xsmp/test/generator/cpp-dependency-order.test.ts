import { afterEach, beforeAll, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem, type LangiumDocument } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { dependencyOrder } from '../../src/generator/dependency-order.js';

class InspectGenerator extends XsmpSdkGenerator {
    generatedSource = '';
    types(catalogue: ast.Catalogue): ast.Type[] { return this.exportedTypes(catalogue); }
    members(body: ast.WithBody): ast.Constant[] { return this.constants(body); }
    protected override generateFile(_path: string, content: string): Promise<void> {
        this.generatedSource = content;
        return Promise.resolve();
    }
}

let services: ReturnType<typeof createXsmpServices>;
let generator: InspectGenerator;
let parse: ReturnType<typeof parseHelper<ast.Catalogue>>;
const documents: LangiumDocument[] = [];

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
    generator = new InspectGenerator(services.shared);
    parse = parseHelper<ast.Catalogue>(services.xsmpcat);
});
afterEach(async () => { await clearDocuments(services.shared, documents.splice(0)); });

async function catalogue(declarations: string): Promise<ast.Catalogue> {
    const document = await parse(`catalogue Ordering namespace demo { ${declarations} }`);
    documents.push(document);
    expect(document.parseResult.parserErrors).toEqual([]);
    expect(document.references.map(reference => reference.error).filter(Boolean)).toEqual([]);
    return document.parseResult.value;
}

test('orders package arrays, fields and base classes while excluding non-registerable aliases', async () => {
    const model = await catalogue(`
        public array Outer = Inner[2]
        public array Inner = Value[2]
        public class Child extends Parent {}
        public struct Holder { field Value first field Value second }
        public using ValueRef = Value*
        public struct Value { field Int32 value }
        public class Parent {}
    `);
    const order = generator.types(model).map(type => type.name);
    const precedes = (dependency: string, consumer: string) => expect(order.indexOf(dependency)).toBeLessThan(order.indexOf(consumer));
    precedes('Value', 'Inner');
    precedes('Inner', 'Outer');
    precedes('Parent', 'Child');
    precedes('Value', 'Holder');
    expect(order).not.toContain('ValueRef');
    expect(order).toHaveLength(6);
    expect(generator.types(model).map(type => type.name)).toEqual(order);
    await generator.generatePackageSource('Ordering.cpp', model, undefined);
    const parentRegistration = generator.generatedSource.indexOf('::demo::Parent::_Register(typeRegistry)');
    expect(parentRegistration).toBeGreaterThanOrEqual(0);
    expect(generator.generatedSource.indexOf('::demo::Child::_Register(typeRegistry)')).toBeGreaterThan(parentRegistration);
});

test('orders local constant initializers and ignores constants declared outside the member group', async () => {
    const model = await catalogue(`
        public interface External { public constant Int32 Value = 4 }
        public interface Constants {
            public constant Int32 Last = Middle + First + Middle
            public constant Int32 Independent = demo.External.Value
            public constant Int32 Middle = First + 1
            public constant Int32 First = 1
        }
    `);
    const body = AstUtils.streamAllContents(model).filter(ast.isInterface).find(type => type.name === 'Constants')!;
    const order = generator.members(body).map(constant => constant.name);
    expect(order).toEqual(['Independent', 'First', 'Middle', 'Last']);
    expect(generator.members(body)).toBe(generator.members(body));
});

test.each(['types', 'constants'] as const)('fails clearly on cyclic %s instead of looping', async kind => {
    const model = await catalogue(kind === 'types'
        ? 'public array A = B[2] public array B = A[2]'
        : 'public interface Constants { constant Int32 A = B constant Int32 B = A }');
    const order = () => kind === 'types' ? generator.types(model)
        : generator.members(AstUtils.streamAllContents(model).find(ast.isInterface)!);
    expect(order).toThrow('Cannot order generated declarations: cyclic dependency.');
});

test('handles a long reverse dependency chain without recursion and retains independent declaration order', () => {
    const nodes = Array.from({ length: 30000 }, (_, index) => index);
    const ordered = dependencyOrder(nodes, node => node + 1 < nodes.length ? [node + 1] : []);
    expect(ordered).toEqual(nodes.toReversed());
    expect(dependencyOrder(['first', 'second', 'third'], () => ['external'])).toEqual(['first', 'second', 'third']);
    expect(() => dependencyOrder(['self'], node => [node])).toThrow('cyclic dependency');
});
