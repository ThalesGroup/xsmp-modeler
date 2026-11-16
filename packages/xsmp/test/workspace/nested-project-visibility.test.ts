import { afterEach, beforeEach, expect, test } from 'vitest';
import { AstUtils, Cancellation, URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast-partial';

let directory: string;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-nested-visibility-')); });
afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); });

test.each(['none', 'direct', 'transitive'] as const)(
    'agrees on nested project visibility in full and targeted workspaces with %s dependency',
    async dependency => {
        const write = (name: string, text: string) => {
            const file = path.join(directory, name);
            fs.mkdirSync(path.dirname(file), { recursive: true });
            fs.writeFileSync(file, text);
        };
        const project = (name: string, source: string, dependency?: string) =>
            `project '${name}' using 'ECSS_SMP_2025' source '${source}' ${dependency ? `dependency '${dependency}'` : ''}`;
        const catalogue = (name: string, namespace: string, id: number, type: string, fields = '') =>
            `catalogue ${name} namespace ${namespace} {
                /** @uuid af210000-0000-4000-8000-${String(id).padStart(12, '0')} */
                public struct ${type} { ${fields} }
            }`;
        write('xsmp.project', project('outer', '.', dependency === 'none' ? undefined : dependency === 'direct' ? 'inner' : 'bridge'));
        write('consumer.xsmpcat', catalogue('Consumer', 'consumer', 1, 'Consumer', 'field nested.Value value field outer.Extra extra field Int32 count'));
        write('nested/xsmp.project', project('inner', 'src'));
        write('nested/src/types.xsmpcat', catalogue('NestedTypes', 'nested', 2, 'Value'));
        // The nested project owns only src: this sibling remains part of the outer project.
        write('nested/parent-owned.xsmpcat', catalogue('ParentOwned', 'outer', 3, 'Extra'));
        write('bridge/xsmp.project', project('bridge', 'src', 'inner'));
        fs.mkdirSync(path.join(directory, 'bridge/src'));

        const uri = (name: string) => URI.file(path.join(directory, name));
        const nestedUri = uri('nested/src/types.xsmpcat');
        const parentOwnedUri = uri('nested/parent-owned.xsmpcat');
        for (const targeted of [false, true]) {
            const services = createXsmpServices(NodeFileSystem);
            const workspace = services.shared.workspace;
            await workspace.WorkspaceManager.initializeWorkspace(
                ['', 'nested', 'bridge'].map(folder => ({ name: folder || 'outer', uri: uri(folder).toString() })),
                Cancellation.CancellationToken.None,
                targeted ? uri('xsmp.project') : undefined,
            );
            await workspace.DocumentBuilder.build(workspace.LangiumDocuments.all.toArray(), { validation: true });
            const consumer = workspace.LangiumDocuments.getDocument(uri('consumer.xsmpcat'))!;
            const fields = AstUtils.streamAllContents(consumer.parseResult.value).filter(ast.isField).toArray();
            const visible = workspace.ProjectManager.getVisibleUris(consumer);
            expect(workspace.ProjectManager.getProjectForUri(nestedUri)?.name).toBe('inner');
            expect(workspace.ProjectManager.getProjectForUri(parentOwnedUri)?.name).toBe('outer');
            expect(visible.has(parentOwnedUri.toString())).toBe(true);
            expect(fields.find(field => field.name === 'extra')?.type?.ref?.name).toBe('Extra');
            expect(fields.find(field => field.name === 'count')?.type?.ref?.name).toBe('Int32');
            expect(visible.has(nestedUri.toString())).toBe(dependency !== 'none');
            expect(fields.find(field => field.name === 'value')?.type?.ref?.name).toBe(dependency === 'none' ? undefined : 'Value');
            const errors = workspace.LangiumDocuments.all.toArray().flatMap(document =>
                (document.diagnostics ?? []).filter(diagnostic => diagnostic.severity === 1).map(diagnostic => diagnostic.message));
            expect(errors).toEqual(dependency === 'none' ? ["Could not resolve reference to Type named 'nested.Value'."] : []);
        }
    },
);
