import { afterAll, beforeAll, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem, GrammarUtils, URI, type LangiumDocument } from 'langium';
import { parseHelper } from 'langium/test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast-partial';
import { fqn } from '@xsmp/core/utils';

let directory: string;
let services: ReturnType<typeof createXsmpServices>;
let document: LangiumDocument;

beforeAll(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-hierarchy-relations-'));
    services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
    await parseHelper(services.xsmpproject)('project "Hierarchy" using "ECSS_SMP_2025" source "."', {
        documentUri: URI.file(path.join(directory, 'xsmp.project')).toString(), validation: true,
    });
    const declarations = [
        'struct Record {}', 'array Records = Record[2]', 'using RecordPointer = Record*',
        'class ClassBase {}', 'class ClassChild extends ClassBase { field ClassBase member }',
        'array Classes = ClassBase[2]', 'using ClassPointer = ClassBase*',
        'exception ErrorBase {}', 'exception ErrorChild extends ErrorBase {}',
        'interface InterfaceBase {}', 'interface InterfaceChild extends InterfaceBase {}',
        'model ModelBase {}', 'model ModelChild extends ModelBase implements InterfaceBase {}',
        'service ServiceBase {}', 'service ServiceChild extends ServiceBase implements InterfaceBase {}',
        'integer Count extends Int32', 'array Counts = Int32[2]', 'using CountPointer = Int32*',
        'float Real extends Float64', 'array Reals = Float64[2]', 'using RealPointer = Float64*',
    ];
    document = await parseHelper(services.xsmpcat)(`catalogue Hierarchy namespace demo {
        ${declarations.map((declaration, index) => `/** @uuid 5a000000-0000-4000-8000-${String(index).padStart(12, '0')} */ public ${declaration}`).join('\n')}
    }`, { documentUri: URI.file(path.join(directory, 'hierarchy.xsmpcat')).toString(), validation: true });
    expect(document.parseResult.parserErrors).toEqual([]);
    expect(document.diagnostics?.filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
});

afterAll(() => { fs.rmSync(directory, { recursive: true, force: true }); });

test.each([
    ['demo.Record', []],
    ['demo.ClassBase', ['ClassChild']],
    ['demo.ErrorBase', ['ErrorChild']],
    ['demo.InterfaceBase', ['InterfaceChild', 'ModelChild', 'ServiceChild']],
    ['demo.ModelBase', ['ModelChild']],
    ['demo.ServiceBase', ['ServiceChild']],
    ['Smp.Int32', ['Count']],
    ['Smp.Float64', ['Real']],
] as const)('returns only direct inheritance relationships for %s', async (name, expected) => {
    const provider = services.xsmpcat.lsp.TypeHierarchyProvider!;
    const target = services.shared.workspace.LangiumDocuments.all
        .flatMap(doc => AstUtils.streamAllContents(doc.parseResult.value))
        .find(node => ast.isLanguageType(node) && fqn(node) === name)!;
    const targetDocument = AstUtils.getDocument(target);
    const [item] = await provider.prepareTypeHierarchy(targetDocument, {
        textDocument: { uri: targetDocument.uri.toString() },
        position: GrammarUtils.findNodeForProperty(target.$cstNode, 'name')!.range.start,
    }) ?? [];
    expect(item).toBeDefined();
    const children = (await provider.subtypes({ item }) ?? [])
        .filter(child => child.uri === document.uri.toString());
    expect(children.map(child => child.name).sort()).toEqual([...expected].sort());
    for (const child of children) {
        const parents = await provider.supertypes({ item: child }) ?? [];
        expect(parents.some(parent => parent.uri === item.uri && parent.name === item.name)).toBe(true);
    }
});

test('returns one subtype while an edit duplicates an inheritance reference', async () => {
    const edited = await parseHelper(services.xsmpcat)(`catalogue Incomplete namespace incomplete {
        /** @uuid 5a000000-0000-4000-8000-000000000100 */
        public interface Child extends demo.InterfaceBase, demo.InterfaceBase {}
    }`, { documentUri: URI.file(path.join(directory, 'incomplete.xsmpcat')).toString(), validation: true });
    expect(edited.parseResult.parserErrors).toEqual([]);
    const provider = services.xsmpcat.lsp.TypeHierarchyProvider!;
    const [base] = await provider.prepareTypeHierarchy(document, {
        textDocument: { uri: document.uri.toString() },
        position: document.textDocument.positionAt(document.textDocument.getText().indexOf('InterfaceBase')),
    }) ?? [];
    const children = await provider.subtypes({ item: base }) ?? [];
    expect(children.filter(child => child.uri === edited.uri.toString()).map(child => child.name)).toEqual(['Child']);
});
