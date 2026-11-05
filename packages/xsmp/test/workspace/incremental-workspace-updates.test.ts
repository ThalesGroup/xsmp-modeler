import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AstUtils, DocumentState, type LangiumDocument, OperationCancelled, URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast-partial';

let directory: string;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-incremental-')); });
afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
});

describe('Incremental workspace updates', () => {
    test('rebuilds semantic dependents without touching unrelated documents or independent project contexts', async () => {
        const original = catalogue('A', 1, 'struct Limits { public constant Int32 Max = 10 }');
        const workspace = await createWorkspace({
            'app/xsmp.project': project('app'),
            'app/src/a.xsmpcat': original,
            'app/src/b.xsmpcat': catalogue('B', 2, 'integer Value extends Int32 in 0 ... types.Limits.Max'),
            'app/src/c.xsmpcat': catalogue('C', 3, 'struct Consumer { field types.Value value = 8 }'),
            'app/src/unrelated.xsmpcat': catalogue('Unrelated', 4, 'struct Unrelated { field Int32 value }'),
            'other/xsmp.project': project('other'),
            'other/src/other.xsmpcat': catalogue('Other', 5, 'struct Other { field Int32 value }'),
        });
        const { services, document, scope } = workspace;
        const manager = services.shared.workspace.ProjectManager;
        const a = document('app/src/a.xsmpcat');
        const c = document('app/src/c.xsmpcat');
        const unrelated = document('app/src/unrelated.xsmpcat');
        const other = document('other/src/other.xsmpcat');
        const projectNode = manager.getProject(a)!;
        const dependencies = manager.getDependencies(projectNode);
        const appContext = manager.getVisibleUris(a);
        const otherContext = manager.getVisibleUris(other);
        const oldExport = scope(unrelated).getElement('types.Limits')!;
        const independentExport = scope(other).getElement('types.Other');
        const unrelatedDiagnostics = unrelated.diagnostics;
        const originalConsumer = c.parseResult.value;
        const phases = workspace.phases();
        await workspace.change('app/src/a.xsmpcat', '// New comment\n' + original);
        expect(phases.parsed).toEqual(['a.xsmpcat']);
        expect(phases.linked.sort()).toEqual(['a.xsmpcat', 'b.xsmpcat', 'c.xsmpcat']);
        expect(phases.validated.sort()).toEqual(phases.linked);
        expect(unrelated.diagnostics).toBe(unrelatedDiagnostics);
        expect(manager.getProject(a)).toBe(projectNode);
        expect(manager.getDependencies(projectNode)).toBe(dependencies);
        expect(manager.getVisibleUris(a)).not.toBe(appContext);
        expect(manager.getVisibleUris(other)).toBe(otherContext);
        expect(scope(other).getElement('types.Other')).toBe(independentExport);
        expect(scope(unrelated).getElement('types.Limits')?.node).not.toBe(oldExport.node);
        expect(AstUtils.getDocument(scope(unrelated).getElement('types.Limits')!.node!).parseResult.value).toBe(a.parseResult.value);
        expect(errors(c)).toEqual([]);

        phases.clear();
        await workspace.change('app/src/a.xsmpcat', original.replace('Max = 10', 'Max = 5'));
        expect(phases.linked.sort()).toEqual(['a.xsmpcat', 'b.xsmpcat', 'c.xsmpcat']);
        expect(c.parseResult.value).toBe(originalConsumer);
        expect(errors(c)).not.toEqual([]);
        await workspace.change('app/src/a.xsmpcat', original);
        expect(errors(c)).toEqual([]);
    });

    test('updates both sides of duplicates when a brand new catalogue appears, then disappears', async () => {
        const workspace = await createWorkspace({
            'app/xsmp.project': project('app'),
            'app/src/a.xsmpcat': catalogue('A', 1, 'struct Shared {}'),
        });
        const a = workspace.document('app/src/a.xsmpcat');
        await workspace.change('app/src/new.xsmpcat', catalogue('New', 2, 'struct Shared {}'));
        expect(errors(a)).toContain('Duplicated Type name.');
        expect(errors(workspace.document('app/src/new.xsmpcat'))).toContain('Duplicated Type name.');
        const deleted = workspace.uri('app/src/new.xsmpcat');
        fs.rmSync(deleted.fsPath);
        await workspace.services.shared.workspace.DocumentBuilder.update([], [deleted]);
        expect(errors(a)).toEqual([]);
    });

    test('resolves project dependencies added later exactly as a fresh workspace does', async () => {
        const foundation = project('foundation') + "\ndependency 'mission'";
        const incremental = await createWorkspace({ 'foundation/xsmp.project': foundation });
        await incremental.change('mission/xsmp.project', project('mission'));
        const names = (workspace: Awaited<ReturnType<typeof createWorkspace>>) => {
            const manager = workspace.services.shared.workspace.ProjectManager;
            return [...manager.getDependencies(manager.getProjectByName('foundation')!)].map(project => project.name).sort();
        };
        const fresh = await createWorkspace({
            'foundation/xsmp.project': foundation,
            'mission/xsmp.project': project('mission'),
        });
        expect(names(incremental)).toEqual(names(fresh));
        expect(names(fresh)).toEqual(['foundation', 'mission']);
    });

    test('resolves missing references after an export appears, and diagnoses them after a rename', async () => {
        const original = catalogue('A', 1, 'struct Existing {}');
        const workspace = await createWorkspace({
            'app/xsmp.project': project('app'),
            'app/src/a.xsmpcat': original,
            'app/src/b.xsmpcat': catalogue('B', 2, 'struct Consumer { field types.Missing value }'),
        });
        const b = workspace.document('app/src/b.xsmpcat');
        expect(errors(b)).not.toEqual([]);
        await workspace.change('app/src/a.xsmpcat', original.replace('Existing', 'Missing'));
        expect(errors(b)).toEqual([]);
        await workspace.change('app/src/a.xsmpcat', original);
        expect(errors(b)).not.toEqual([]);
    });

    test('invalidates global UUID diagnostics and refreshes their related locations after a comment edit', async () => {
        const original = catalogue('A', 1, 'struct First {}');
        const workspace = await createWorkspace({
            'a/xsmp.project': project('a'),
            'a/src/a.xsmpcat': original,
            'b/xsmp.project': project('b'),
            'b/src/b.xsmpcat': catalogue('B', 2, 'struct Second {}'),
        });
        const a = workspace.document('a/src/a.xsmpcat');
        const b = workspace.document('b/src/b.xsmpcat');
        const duplicate = (document: LangiumDocument) => document.diagnostics?.find(diagnostic => diagnostic.message === 'Duplicated UUID.');
        await workspace.change('a/src/a.xsmpcat', original.replace(uuid(1), uuid(2)));
        expect(duplicate(a)).toBeDefined();
        const oldLine = duplicate(b)!.relatedInformation![0].location.range.start.line;
        await workspace.change('a/src/a.xsmpcat', '\n\n' + original.replace(uuid(1), uuid(2)));
        expect(duplicate(b)!.relatedInformation![0].location.range.start.line).toBe(oldLine + 2);
        await workspace.change('a/src/a.xsmpcat', original);
        expect(duplicate(b)).toBeUndefined();
    });

    test.each([DocumentState.IndexedContent, DocumentState.ComputedScopes])(
        'preserves deferred structural invalidation after cancellation at state %i', async state => {
            const original = catalogue('A', 1, 'struct First {}');
            const workspace = await createWorkspace({
                'app/xsmp.project': project('app'),
                'app/src/a.xsmpcat': original,
                'app/src/b.xsmpcat': catalogue('B', 2, 'struct Second {}'),
            });
            const builder = workspace.services.shared.workspace.DocumentBuilder;
            const subscription = builder.onBuildPhase(state, () => {
                subscription.dispose();
                throw OperationCancelled;
            });
            await expect(workspace.change('app/src/a.xsmpcat', original.replace('First', 'Second'))).rejects.toBe(OperationCancelled);
            await builder.update([], []);
            expect(errors(workspace.document('app/src/a.xsmpcat'))).toContain('Duplicated Type name.');
            expect(errors(workspace.document('app/src/b.xsmpcat'))).toContain('Duplicated Type name.');
            expect(workspace.document('app/src/b.xsmpcat').state).toBe(DocumentState.Validated);
        },
    );

    test('explicit validation does not relink already built documents', async () => {
        const workspace = await createWorkspace({
            'app/xsmp.project': project('app'),
            'app/src/a.xsmpcat': catalogue('A', 1, 'struct First {}'),
        });
        const phases = workspace.phases();
        await workspace.validate();
        expect(phases.parsed).toEqual([]);
        expect(phases.linked).toEqual([]);
        expect(phases.validated).toEqual(['a.xsmpcat']);
    });

    test('preserves scope precedence across internal edits when an implicit Smp alias is shadowed', async () => {
        const original = catalogue('A', 1, 'struct Shared {}').replace('namespace types', 'namespace Smp::types');
        const workspace = await createWorkspace({
            'app/xsmp.project': project('app'),
            'app/src/a.xsmpcat': original,
            'app/src/b.xsmpcat': catalogue('B', 2, 'struct Shared {}'),
            'app/src/c.xsmpcat': catalogue('C', 3, 'struct Consumer { field types.Shared value }'),
        });
        const c = workspace.document('app/src/c.xsmpcat');
        const field = AstUtils.streamAllContents(c.parseResult.value).find(ast.isField)!;
        const target = field.type!.ref;
        expect(AstUtils.getDocument(target!).uri.toString()).toBe(workspace.uri('app/src/b.xsmpcat').toString());
        await workspace.change('app/src/a.xsmpcat', '// Comment\n' + original);
        expect(workspace.scope(c).getElement('types.Shared')?.node).toBe(target);
        expect(field.type!.ref).toBe(target);
    });
});

function uuid(id: number): string { return `af000000-0000-4000-8000-${String(id).padStart(12, '0')}`; }
function project(name: string): string { return `project '${name}' using 'ECSS_SMP_2025'\nsource 'src'`; }
function catalogue(name: string, id: number, declaration: string): string {
    return `catalogue ${name}\nnamespace types {\n/** @uuid ${uuid(id)} */ public ${declaration}\n}`;
}
function errors(document: LangiumDocument): string[] {
    return document.diagnostics?.filter(diagnostic => diagnostic.severity === 1).map(diagnostic => diagnostic.message) ?? [];
}

async function createWorkspace(files: Record<string, string>) {
    const uri = (name: string) => URI.file(path.join(directory, name));
    const write = (name: string, content: string) => {
        fs.mkdirSync(path.dirname(uri(name).fsPath), { recursive: true });
        fs.writeFileSync(uri(name).fsPath, content);
    };
    Object.entries(files).forEach(([name, content]) => write(name, content));
    const services = createXsmpServices(NodeFileSystem);
    const builder = services.shared.workspace.DocumentBuilder;
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([{ name: 'workspace', uri: URI.file(directory).toString() }]);
    const document = (name: string) => services.shared.workspace.LangiumDocuments.getDocument(uri(name))!;
    const validate = () => builder.build(services.shared.workspace.LangiumDocuments.all.toArray(), { validation: true });
    await validate();
    for (const name of Object.keys(files)) expect(document(name).parseResult.parserErrors).toEqual([]);
    const change = async (name: string, content: string) => {
        write(name, content);
        await builder.update([uri(name)], []);
        expect(document(name).parseResult.parserErrors).toEqual([]);
    };
    const scope = (document: LangiumDocument) => {
        const field = AstUtils.streamAllContents(document.parseResult.value).find(ast.isField)!;
        return services.xsmpcat.references.ScopeProvider.getScope({ container: field, property: ast.Field.type, reference: field.type! });
    };
    const phases = () => {
        const parsed: string[] = [], linked: string[] = [], validated: string[] = [];
        for (const [state, names] of [[DocumentState.Parsed, parsed], [DocumentState.Linked, linked], [DocumentState.Validated, validated]] as const) {
            builder.onDocumentPhase(state, document => {
                if (document.uri.scheme === 'file' && document.uri.path.endsWith('.xsmpcat')) names.push(path.basename(document.uri.path));
            });
        }
        return { parsed, linked, validated, clear: () => { parsed.length = linked.length = validated.length = 0; } };
    };
    return { services, uri, document, change, validate, scope, phases };
}
