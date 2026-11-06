import { afterEach, expect, test } from 'vitest';
import { AstUtils, type LangiumDocument, URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast-partial';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const directories: string[] = [];
afterEach(() => {
    for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

type Probe = {
    fieldIssuesCache: { clear(): void };
    cyclicFieldIssuesCache: { clear(): void };
    acyclicTypesCache: { clear(): void };
    getFieldIssues(type: ast.Type): { isString8: boolean; string8Field?: ast.Field; nonValueTypeField?: ast.Field };
    isRecursiveTypeEdge(parent: ast.Type, other: ast.Type): boolean;
};

async function load(sources: Record<string, string>) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-field-graph-'));
    directories.push(directory);
    fs.mkdirSync(path.join(directory, 'src'));
    fs.writeFileSync(path.join(directory, 'xsmp.project'), 'project "Fields"\nsource "src"\n');
    const uuids = new Map<string, string>();
    const write = (name: string, source: string) => {
        const annotated = source.replace(/public (?:array|struct|class|interface|model) (\w+)/g, (declaration, typeName) => {
            const key = `${name}.${typeName}`;
            if (!uuids.has(key)) uuids.set(key, `32000000-0000-4000-8000-${String(uuids.size).padStart(12, '0')}`);
            return `/** @uuid ${uuids.get(key)} */\n${declaration}`;
        });
        fs.writeFileSync(path.join(directory, 'src', `${name}.xsmpcat`), annotated);
    };
    for (const [name, source] of Object.entries(sources)) write(name, source);
    const services = createXsmpServices(NodeFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([{ name: 'fields', uri: URI.file(directory).toString() }]);
    await services.shared.workspace.DocumentBuilder.build(services.shared.workspace.LangiumDocuments.all.toArray(), { validation: true });
    const document = (name: string) => services.shared.workspace.LangiumDocuments.getDocument(URI.file(path.join(directory, 'src', `${name}.xsmpcat`)))!;
    const probe = services.xsmpcat.validation.XsmpcatValidator as unknown as Probe;
    return { directory, services, document, probe, write };
}

function errors(document: LangiumDocument): string[] {
    return (document.diagnostics ?? []).filter(diagnostic => diagnostic.severity === 1).map(diagnostic => diagnostic.message);
}

function observeElements(types: ast.Structure[]) {
    let reads = 0;
    const originals = types.map(type => [type, Object.getOwnPropertyDescriptor(type, 'elements')!] as const);
    for (const [type, descriptor] of originals) {
        Object.defineProperty(type, 'elements', {
            configurable: true,
            enumerable: true,
            get: () => { reads++; return descriptor.value; },
        });
    }
    return {
        reads: () => reads,
        restore: () => { for (const [type, descriptor] of originals) Object.defineProperty(type, 'elements', descriptor); },
    };
}

test('inspects a nested type chain linearly and reuses both caches', async () => {
    const count = 128;
    const declarations = Array.from({ length: count }, (_, index) =>
        `public struct S${index} { field ${index ? `S${index - 1}` : 'Int32'} value }`).join('\n');
    const { document, probe } = await load({ Chain: `catalogue Chain namespace graph { ${declarations} }` });
    expect(errors(document('Chain'))).toEqual([]);
    const types = AstUtils.streamAllContents(document('Chain').parseResult.value).filter(ast.isStructure).toArray();
    const fields = types.map(type => type.elements.find(ast.isField)!);
    const observation = observeElements(types);
    try {
        probe.fieldIssuesCache.clear();
        for (const type of types.toReversed()) probe.getFieldIssues(type);
        const fieldReads = observation.reads();
        expect(fieldReads).toBeLessThanOrEqual(3 * count);
        for (const type of types) probe.getFieldIssues(type);
        expect(observation.reads()).toBe(fieldReads);

        probe.acyclicTypesCache.clear();
        for (const field of fields.toReversed()) expect(probe.isRecursiveTypeEdge(field.$container as ast.Type, field.type.ref!)).toBe(false);
        const recursionReads = observation.reads() - fieldReads;
        expect(recursionReads).toBeLessThanOrEqual(count);
        for (const field of fields) expect(probe.isRecursiveTypeEdge(field.$container as ast.Type, field.type.ref!)).toBe(false);
        expect(observation.reads()).toBe(fieldReads + recursionReads);
    } finally {
        observation.restore();
    }
});

test('handles a deep array chain and retains the directly referenced String8 field', async () => {
    const count = 1500;
    const declarations = Array.from({ length: count }, (_, index) =>
        `public array A${index} = ${index ? `A${index - 1}` : 'String8'}[1]`).join('\n');
    const { document, probe } = await load({ Arrays: `catalogue Arrays namespace graph {
        ${declarations}
        public struct Holder { field A${count - 1} value }
    }` });
    expect(errors(document('Arrays'))).toEqual([]);
    const nodes = AstUtils.streamAllContents(document('Arrays').parseResult.value).toArray();
    const arrays = nodes.filter(ast.isArrayType);
    const holder = nodes.find(ast.isStructure)!;
    probe.fieldIssuesCache.clear();

    expect(probe.getFieldIssues(arrays[count - 1]).isString8).toBe(true);
    expect(probe.getFieldIssues(holder).string8Field?.name).toBe('value');
});

test('keeps root-specific witnesses in cycles regardless of query order', async () => {
    const { document, probe } = await load({ Cycles: `catalogue Cycles namespace graph {
        public interface I {}
        public struct A { field B next field String8 fromA field I objectA }
        public struct B { field A back field String8 fromB field I objectB }
        public struct Outside { field A cycle }
    }` });
    const types = AstUtils.streamAllContents(document('Cycles').parseResult.value).filter(ast.isStructure).toArray();
    for (const order of [[types[0], types[1]], [types[1], types[0]]]) {
        probe.fieldIssuesCache.clear();
        probe.cyclicFieldIssuesCache.clear();
        const observation = observeElements(types);
        try {
            for (const type of order) {
                const issues = probe.getFieldIssues(type);
                expect(issues.string8Field?.name).toBe(type.name === 'A' ? 'fromB' : 'fromA');
                expect(issues.nonValueTypeField?.name).toBe(type.name === 'A' ? 'objectB' : 'objectA');
            }
            const coldReads = observation.reads();
            for (const type of order) probe.getFieldIssues(type);
            expect(observation.reads()).toBe(coldReads);
        } finally {
            observation.restore();
        }
    }
    expect(probe.isRecursiveTypeEdge(types[0], types[1])).toBe(true);
    expect(probe.isRecursiveTypeEdge(types[2], types[0])).toBe(false);
    expect(errors(document('Cycles')).filter(message => message === 'Recursive Field Type.')).toHaveLength(2);
});

test('includes inherited private fields and excludes static fields in summaries', async () => {
    const { document, probe } = await load({ Inheritance: `catalogue Inheritance namespace graph {
        public interface I {}
        public class Base {
            private field I inherited
            @Static public field String8 ignored
        }
        public class Derived extends Base { public field Int32 own }
    }` });
    const derived = AstUtils.streamAllContents(document('Inheritance').parseResult.value)
        .find(node => ast.isClass(node) && node.name === 'Derived') as ast.Class;

    expect(probe.getFieldIssues(derived).nonValueTypeField?.name).toBe('inherited');
    expect(probe.getFieldIssues(derived).string8Field).toBeUndefined();
});

test('invalidates summaries and acyclic results when a referenced type changes', async () => {
    const leaf = (fieldType: string) => `catalogue Leaf namespace graph {
        public struct Leaf { field ${fieldType} value }
    }`;
    const { directory, services, document, write } = await load({
        Leaf: leaf('Int32'),
        Consumer: `catalogue Consumer namespace graph {
            public struct Wrapper { field graph.Leaf leaf }
            public model Consumer { field Wrapper wrapped }
        }`,
    });
    expect(errors(document('Consumer'))).toEqual([]);
    const leafUri = URI.file(path.join(directory, 'src/Leaf.xsmpcat'));
    write('Leaf', leaf('String8'));
    await services.shared.workspace.DocumentBuilder.update([leafUri], []);
    expect(errors(document('Consumer'))).toContain('A Field of a Model or Service shall not use a type containing a String8 field.');

    write('Leaf', leaf('graph.Wrapper'));
    await services.shared.workspace.DocumentBuilder.update([leafUri], []);
    expect(errors(document('Leaf'))).toContain('Recursive Field Type.');
    expect(errors(document('Consumer'))).toContain('Recursive Field Type.');

    write('Leaf', leaf('Int32'));
    await services.shared.workspace.DocumentBuilder.update([leafUri], []);
    expect(errors(document('Leaf'))).toEqual([]);
    expect(errors(document('Consumer'))).toEqual([]);
});
