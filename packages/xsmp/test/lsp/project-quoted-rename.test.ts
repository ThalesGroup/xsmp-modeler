import { afterEach, expect, test } from 'vitest';
import { EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import { type Project, isDependency } from '@xsmp/core/ast-partial';
import type { Range, WorkspaceEdit } from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })));

test.each(['Renamed', 'Name with spaces', 'Double " quote', "Single ' quote", String.raw`Slash\name`])(
    'renames a project and its dependencies to %s as logical names', async newName => {
        const services = createXsmpServices(EmptyFileSystem);
        const parse = parseHelper<Project>(services.xsmpproject);
        const directory = mkdtempSync(join(tmpdir(), 'xsmp-project-rename-'));
        directories.push(directory);
        const documents: Array<LangiumDocument<Project>> = [];
        for (const [name, suffix] of [['Original', ''], ['Dependent', "dependency 'Original'"]]) {
            mkdirSync(join(directory, name, 'src'), { recursive: true });
            documents.push(await parse(`project "${name}" source "src" ${suffix}`, {
                documentUri: URI.file(join(directory, name, 'xsmp.project')).toString(),
            }));
        }
        await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });
        expect(documents.flatMap(document => document.diagnostics ?? [])).toEqual([]);
        // Initiating the rename from either the declaration or a dependency produces the same edits.
        const edits = [];
        for (const document of documents) {
            edits.push(await services.xsmpproject.lsp.RenameProvider!.rename(document, {
                textDocument: { uri: document.uri.toString() },
                position: document.textDocument.positionAt(document.textDocument.getText().indexOf('Original') + 2),
                newName,
            }));
        }
        expect(edits[0]).toEqual(edits[1]);
        expect(Object.keys(edits[0]!.changes!)).toHaveLength(2);
        const renamed = documents.map(document => ({
            uri: document.uri.toString(),
            text: TextDocument.applyEdits(document.textDocument, edits[0]!.changes![document.uri.toString()]),
        }));
        expect(documents[0].parseResult.value.name).toBe('Original');
        await clearDocuments(services.shared, documents);
        const updated = [];
        for (const document of renamed) {
            updated.push(await parse(document.text, { documentUri: document.uri }));
        }
        await services.shared.workspace.DocumentBuilder.build(updated, { validation: true });
        expect(updated.flatMap(document => document.parseResult.parserErrors)).toEqual([]);
        expect(updated.flatMap(document => document.diagnostics ?? [])).toEqual([]);
        expect(updated[0].parseResult.value.name).toBe(newName);
        const dependency = updated[1].parseResult.value.elements.find(isDependency)!;
        expect(dependency.project?.ref).toBe(updated[0].parseResult.value);
    }
);

test('rejects a project name which cannot be represented by a STRING token', async () => {
    const services = createXsmpServices(EmptyFileSystem);
    const document = await parseHelper(services.xsmpproject)('project "Original"');
    await expect(services.xsmpproject.lsp.RenameProvider!.rename(document, {
        textDocument: { uri: document.uri.toString() },
        position: document.textDocument.positionAt(11),
        newName: 'Both " and \'',
    })).rejects.toThrow('both single and double quotes');
});

test.each(['profile', 'tool'])('keeps quoted %s declaration names valid', async kind => {
    const services = createXsmpServices(EmptyFileSystem);
    const document = await parseHelper(services.xsmpproject)(`${kind} "Original"`, {
        documentUri: URI.file(`/rename/example.xsmp${kind}`).toString(),
    });
    const edit = await services.xsmpproject.lsp.RenameProvider!.rename(document, {
        textDocument: { uri: document.uri.toString() },
        position: document.textDocument.positionAt(kind.length + 3),
        newName: 'Renamed',
    });
    const text = TextDocument.applyEdits(document.textDocument, edit!.changes![document.uri.toString()]);
    const parsed = services.xsmpproject.parser.LangiumParser.parse<Project>(text);
    expect(parsed.parserErrors).toEqual([]);
    expect(parsed.value.name).toBe('Renamed');
});

test('sends the decoded rename placeholder through the LSP handler and JSON transport', async () => {
    const { PassThrough } = await import('node:stream');
    const { createConnection, ProposedFeatures } = await import('vscode-languageserver/node');
    const { createMessageConnection, StreamMessageReader, StreamMessageWriter } = await import('vscode-jsonrpc/node');
    const { startLanguageServer } = await import('langium/lsp');
    const upstream = new PassThrough();
    const downstream = new PassThrough();
    const server = createConnection(ProposedFeatures.all, new StreamMessageReader(upstream), new StreamMessageWriter(downstream));
    const client = createMessageConnection(new StreamMessageReader(downstream), new StreamMessageWriter(upstream));
    const services = createXsmpServices({ ...EmptyFileSystem, connection: server });
    startLanguageServer(services.shared);
    client.listen();
    try {
        await client.sendRequest('initialize', { processId: null, rootUri: null, capabilities: {} });
        await client.sendNotification('initialized', {});
        await services.shared.workspace.WorkspaceManager.ready;
        const original = String.raw`project 'Double " quote and \\ slash'`;
        const document = await parseHelper<Project>(services.xsmpproject)(original, {
            documentUri: URI.file('/rename/xsmp.project').toString(), validation: true,
        });
        const params = {
            textDocument: { uri: document.uri.toString() },
            position: document.textDocument.positionAt(original.indexOf('Double') + 2),
        };
        const prepared = await client.sendRequest<{ range: Range; placeholder: string }>('textDocument/prepareRename', params);
        expect(document.textDocument.getText(prepared.range)).toBe(original.slice('project '.length));
        expect(prepared.placeholder).toBe(document.parseResult.value.name);
        expect(prepared.placeholder).toBe('Double " quote and \\ slash');
        const edit = await client.sendRequest<WorkspaceEdit>('textDocument/rename', {
            ...params, newName: prepared.placeholder,
        });
        const renamed = TextDocument.applyEdits(document.textDocument, edit.changes![document.uri.toString()]);
        expect(services.xsmpproject.parser.LangiumParser.parse<Project>(renamed).value.name).toBe(document.parseResult.value.name);
    } finally {
        client.dispose();
        server.dispose();
        upstream.destroy();
        downstream.destroy();
    }
});
