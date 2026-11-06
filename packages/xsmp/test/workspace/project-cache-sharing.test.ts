import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AstUtils, type LangiumDocument, URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast-partial';
import type { XsmpContributionPackage } from '@xsmp/core/contributions';

let tempDir: string;

beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-project-caches-'));
});

afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('Project cache sharing', () => {
    test.each(['project-first', 'catalogue-first'] as const)(
        'shares catalogue visibility without changing standalone and builtin visibility (%s)',
        async order => {
            const workspace = await createWorkspace({
                'app/xsmp.project': project('app'),
                'app/src/a.xsmpcat': catalogue('A', 'First', 1),
                'app/src/b.xsmpcat': catalogue('B', 'Second', 2),
                'one.xsmpcat': catalogue('One', 'StandaloneOne', 3),
                'two.xsmpcat': catalogue('Two', 'StandaloneTwo', 4),
            });
            const manager = workspace.services.shared.workspace.ProjectManager;
            const a = workspace.document('app/src/a.xsmpcat');
            const b = workspace.document('app/src/b.xsmpcat');
            const projectDocument = workspace.document('app/xsmp.project');
            const visibility = (document: LangiumDocument) => manager.getVisibleUris(document)!;
            // Evict the caches warmed during loading so both lookup orders are exercised.
            await workspace.services.shared.workspace.DocumentBuilder.build([]);
            const ordered = order === 'project-first' ? [projectDocument, a] : [a, projectDocument];
            ordered.forEach(visibility);

            expect(manager.getProject(projectDocument)).toBeUndefined();
            expect(visibility(a)).toBe(visibility(b));
            expect(visibility(a)).toContain(a.uri.toString());
            expect(visibility(a)).toContain(b.uri.toString());
            expect(visibility(projectDocument)).not.toBe(visibility(a));
            expect(visibility(projectDocument)).not.toContain(a.uri.toString());

            const one = workspace.document('one.xsmpcat');
            const two = workspace.document('two.xsmpcat');
            expect(visibility(one)).not.toBe(visibility(two));
            expect(visibility(one)).toContain(one.uri.toString());
            expect(visibility(one)).not.toContain(two.uri.toString());
            expect(visibility(a)).not.toContain(one.uri.toString());

            const builtin = workspace.services.shared.workspace.LangiumDocuments.all
                .find(document => document.uri.scheme === 'xsmp' && document.uri.path.endsWith('ecss.smp.l1@ECSS_SMP_2025.xsmpcat'))!;
            expect(builtin).toBeDefined();
            expect(visibility(builtin)).toContain(builtin.uri.toString());
            expect(visibility(builtin)).not.toContain(a.uri.toString());
        },
    );

    test('builds shared global scopes, visible names and catalogue graphs once per project', async () => {
        const workspace = await createWorkspace({
            'app/xsmp.project': project('app'),
            'app/src/a.xsmpcat': catalogue('A', 'First', 1),
            'app/src/b.xsmpcat': catalogue('B', 'Second', 2),
        });
        const { services } = workspace;
        const a = workspace.document('app/src/a.xsmpcat');
        const b = workspace.document('app/src/b.xsmpcat');
        const allElements = vi.spyOn(services.shared.workspace.IndexManager, 'allElements');
        await workspace.validate();
        const visible = services.shared.workspace.ProjectManager.getVisibleUris(a)!;
        expect(allElements.mock.calls.filter(([type, uris]) => type === ast.NamedElement.$type && uris === visible)).toHaveLength(1);
        expect(allElements.mock.calls.filter(([type, uris]) =>
            type === ast.Catalogue.$type && uris?.has(a.uri.toString()) && uris.has(b.uri.toString())
        )).toHaveLength(1);

        allElements.mockClear();
        const scope = (document: LangiumDocument) => {
            const field = firstField(document);
            return services.xsmpcat.references.ScopeProvider.getScope({ container: field, property: 'type', reference: field.type! });
        };
        expect(scope(a).getElement('types.First')?.documentUri.toString()).toBe(a.uri.toString());
        expect(scope(b).getElement('types.First')?.documentUri.toString()).toBe(a.uri.toString());
        expect(allElements.mock.calls.filter(([, uris]) => uris === visible)).toHaveLength(1);
    });

    test('keeps standards and active contribution payloads isolated after a project changes', async () => {
        const workspace = await createWorkspace({
            'dep/xsmp.project': project('dep', "profile 'alpha'"),
            'dep/src/a.xsmpcat': catalogue('Dependency', 'Exported', 1, 'field Int32 value field vendor.Payload payload'),
            'app/xsmp.project': project('app', "profile 'beta'", 'ECSS_SMP_2020'),
            'app/src/a.xsmpcat': catalogue('Application', 'Consumer', 2, 'field Int32 value field vendor.Payload payload'),
        }, [profileWithPayload('alpha', 10), profileWithPayload('beta', 11)]);
        const dep = workspace.document('dep/src/a.xsmpcat');
        const app = workspace.document('app/src/a.xsmpcat');
        const appAst = app.parseResult.value;
        const payload = (document: LangiumDocument) => fields(document).find(field => field.name === 'payload')!;
        const targetUri = (field: ast.Field) => AstUtils.getDocument(field.type!.ref!).uri.toString();
        const manager = workspace.services.shared.workspace.ProjectManager;
        const oldVisibility = manager.getVisibleUris(app);

        expect(targetUri(firstField(dep))).toContain('ECSS_SMP_2025');
        expect(targetUri(firstField(app))).toContain('ECSS_SMP_2020');
        const alphaUri = targetUri(payload(dep));
        const betaUri = targetUri(payload(app));
        expect(alphaUri).not.toBe(betaUri);
        expect(oldVisibility).not.toContain(dep.uri.toString());
        expect(oldVisibility).toContain(betaUri);
        expect(oldVisibility).not.toContain(alphaUri);

        await workspace.change('app/xsmp.project', project('app', "dependency 'dep'"));
        expect(app.parseResult.value).toBe(appAst);
        expect(targetUri(firstField(app))).toContain('ECSS_SMP_2025');
        expect(payload(app).type?.ref).toBeUndefined();
        expect(manager.getVisibleUris(app)).not.toBe(oldVisibility);
        expect(manager.getVisibleUris(app)).toContain(dep.uri.toString());
        expect(manager.getVisibleUris(app)).not.toContain(alphaUri);
        expect(manager.getVisibleUris(app)).not.toContain(betaUri);
        expect(targetUri(payload(dep))).toBe(alphaUri);

        await workspace.change('app/xsmp.project', project('app', "profile 'alpha'\ndependency 'dep'"));
        expect(targetUri(payload(app))).toBe(alphaUri);
        expect(errors(app)).toEqual([]);
    });

    test('refreshes shared names and scopes when a catalogue is added, renamed and deleted', async () => {
        const workspace = await createWorkspace({
            'app/xsmp.project': project('app'),
            'app/src/a.xsmpcat': catalogue('A', 'Shared', 1),
            'app/src/b.xsmpcat': catalogue('B', 'Consumer', 2, 'field types.Shared value'),
            'app/src/c.xsmpcat': 'catalogue C',
        });
        const a = workspace.document('app/src/a.xsmpcat');
        const b = workspace.document('app/src/b.xsmpcat');
        const originalConsumer = b.parseResult.value;
        const manager = workspace.services.shared.workspace.ProjectManager;
        const before = manager.getVisibleUris(a);
        await workspace.change('app/src/c.xsmpcat', catalogue('C', 'Shared', 3));
        const c = workspace.document('app/src/c.xsmpcat');
        expect(errors(a)).toContain('Duplicated Type name.');
        expect(errors(c)).toContain('Duplicated Type name.');
        expect(manager.getVisibleUris(a)).not.toBe(before);
        expect(manager.getVisibleUris(a)).toBe(manager.getVisibleUris(b));
        expect(manager.getVisibleUris(a)).toContain(c.uri.toString());

        await workspace.change('app/src/c.xsmpcat', catalogue('C', 'Renamed', 3));
        expect(errors(a)).toEqual([]);
        expect(errors(c)).toEqual([]);
        expect(AstUtils.getDocument(firstField(b).type!.ref!).uri.toString()).toBe(a.uri.toString());

        await workspace.change('app/src/added.xsmpcat', catalogue('Added', 'Additional', 4));
        const added = workspace.document('app/src/added.xsmpcat');
        expect(manager.getVisibleUris(a)).toContain(added.uri.toString());
        const renamedUri = workspace.uri('app/src/renamed.xsmpcat');
        fs.renameSync(added.uri.fsPath, renamedUri.fsPath);
        await workspace.services.shared.workspace.DocumentBuilder.update([renamedUri], [added.uri]);
        expect(manager.getVisibleUris(a)).toContain(renamedUri.toString());
        expect(manager.getVisibleUris(a)).not.toContain(added.uri.toString());
        fs.rmSync(renamedUri.fsPath);
        await workspace.services.shared.workspace.DocumentBuilder.update([], [renamedUri]);
        expect(manager.getVisibleUris(a)).not.toContain(renamedUri.toString());
        expect(b.parseResult.value).toBe(originalConsumer);
        expect(errors(b)).toEqual([]);
    });

    test('refreshes the shared catalogue graph when a cycle is introduced and removed', async () => {
        const source = (name: string, id: number, reference: string) => `catalogue ${name} namespace types {
            /** @uuid ${uuid(id)} */ public interface I${name} {}
            /** @uuid ${uuid(id + 1)} */ public model M${name} { ${reference} }
        }`;
        const originalB = source('B', 3, '');
        const workspace = await createWorkspace({
            'app/xsmp.project': project('app'),
            'app/src/a.xsmpcat': source('A', 1, 'reference types.IB target'),
            'app/src/b.xsmpcat': originalB,
        });
        const a = workspace.document('app/src/a.xsmpcat');
        const b = workspace.document('app/src/b.xsmpcat');
        const originalA = a.parseResult.value;
        const cycle = (document: LangiumDocument) => document.diagnostics?.find(diagnostic => diagnostic.message === 'Catalogues shall not have circular dependencies.');

        await workspace.change('app/src/b.xsmpcat', source('B', 3, 'reference types.IA target'));
        expect(cycle(a)?.relatedInformation?.map(info => info.location.uri)).toEqual([b.uri.toString()]);
        expect(cycle(b)?.relatedInformation?.map(info => info.location.uri)).toEqual([a.uri.toString()]);
        await workspace.change('app/src/b.xsmpcat', originalB);
        expect(a.parseResult.value).toBe(originalA);
        expect(errors(a)).toEqual([]);
        expect(errors(b)).toEqual([]);
    });

    test('refreshes project ownership after source changes and project addition or deletion', async () => {
        const workspace = await createWorkspace({
            'app/xsmp.project': project('app'),
            'app/src/a.xsmpcat': catalogue('A', 'First', 1),
            'app/other/b.xsmpcat': catalogue('B', 'Second', 2),
            'added/src/c.xsmpcat': catalogue('C', 'Third', 3),
        });
        const manager = workspace.services.shared.workspace.ProjectManager;
        const a = workspace.document('app/src/a.xsmpcat');
        const b = workspace.document('app/other/b.xsmpcat');
        const c = workspace.document('added/src/c.xsmpcat');
        expect(manager.getProjects().map(project => project.name).toArray()).toEqual(['app']);
        expect(manager.getProject(a)?.name).toBe('app');
        expect(manager.getProject(b)).toBeUndefined();
        expect(manager.getProject(c)).toBeUndefined();

        await workspace.change('app/xsmp.project', project('app').replace("source 'src'", "source 'other'"));
        expect(manager.getProject(a)).toBeUndefined();
        expect(manager.getProject(b)?.name).toBe('app');
        expect(manager.getVisibleUris(b)).not.toContain(a.uri.toString());

        await workspace.change('added/xsmp.project', project('added'));
        expect(manager.getProjects().map(project => project.name).toArray().sort()).toEqual(['added', 'app']);
        expect(manager.getProject(c)?.name).toBe('added');
        const addedProjectUri = workspace.uri('added/xsmp.project');
        fs.rmSync(addedProjectUri.fsPath);
        await workspace.services.shared.workspace.DocumentBuilder.update([], [addedProjectUri]);
        expect(manager.getProjects().map(project => project.name).toArray()).toEqual(['app']);
        expect(manager.getProject(c)).toBeUndefined();
    });
});

function uuid(id: number): string {
    return `ab000000-0000-4000-8000-${String(id).padStart(12, '0')}`;
}

function project(name: string, extra = '', standard = 'ECSS_SMP_2025'): string {
    return `project '${name}' using '${standard}'\nsource 'src'\n${extra}\n`;
}

function catalogue(name: string, typeName: string, id: number, body = 'field Int32 value'): string {
    return `catalogue ${name} namespace types { /** @uuid ${uuid(id)} */ public struct ${typeName} { ${body} } }`;
}

function fields(document: LangiumDocument): ast.Field[] {
    return AstUtils.streamAllContents(document.parseResult.value).filter(ast.isField).toArray();
}

function firstField(document: LangiumDocument): ast.Field {
    return fields(document)[0];
}

function errors(document: LangiumDocument): string[] {
    return (document.diagnostics ?? []).filter(diagnostic => diagnostic.severity === 1).map(diagnostic => diagnostic.message);
}

function profileWithPayload(name: string, id: number): XsmpContributionPackage {
    const directory = path.join(tempDir, name);
    fs.mkdirSync(directory, { recursive: true });
    const descriptor = path.join(directory, `${name}.xsmpprofile`);
    const builtin = path.join(directory, `${name}.xsmpcat`);
    fs.writeFileSync(descriptor, `profile '${name}'\n`);
    fs.writeFileSync(builtin, `catalogue ${name} namespace vendor { /** @uuid ${uuid(id)} */ public struct Payload {} }`);
    return {
        name,
        extensionId: name,
        descriptorUrl: pathToFileURL(descriptor),
        builtins: [pathToFileURL(builtin)],
        registerContribution: () => undefined,
    };
}

async function createWorkspace(files: Record<string, string>, contributions: XsmpContributionPackage[] = []) {
    const directory = path.join(tempDir, 'workspace');
    const uri = (name: string) => URI.file(path.join(directory, name));
    const write = (name: string, content: string) => {
        const file = uri(name).fsPath;
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content);
    };
    Object.entries(files).forEach(([name, content]) => write(name, content));
    const services = createXsmpServices(NodeFileSystem);
    const registration = await services.shared.ContributionRegistry.registerBuiltinPackages(contributions);
    expect(registration.failures).toEqual([]);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([{ name: 'workspace', uri: URI.file(directory).toString() }]);
    const document = (name: string) => services.shared.workspace.LangiumDocuments.getDocument(uri(name))!;
    const validate = () => services.shared.workspace.DocumentBuilder.build(services.shared.workspace.LangiumDocuments.all.toArray(), { validation: true });
    await validate();
    for (const name of Object.keys(files)) {
        expect(document(name).parseResult.parserErrors).toEqual([]);
        expect(errors(document(name))).toEqual([]);
    }
    const change = async (name: string, content: string) => {
        write(name, content);
        await services.shared.workspace.DocumentBuilder.update([uri(name)], []);
        expect(document(name).parseResult.parserErrors).toEqual([]);
    };
    return { services, uri, document, validate, change };
}
