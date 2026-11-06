import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as vscode from 'vscode';
import type { LanguageClient } from 'vscode-languageclient/node';
import { TextDocumentContentRefreshRequest, TextDocumentContentRequest } from 'vscode-languageserver-protocol';
import { registerServerFiles } from '../src/extension/server-files.js';

const state = vi.hoisted(() => ({
    registrations: new Map<string, { provider: vscode.FileSystemProvider; options: unknown }>(),
    documents: [] as vscode.TextDocument[],
}));

vi.mock('vscode', async () => ({
    Uri: (await import('vscode-uri')).URI,
    FileType: { File: 1 },
    FilePermission: { Readonly: 1 },
    FileChangeType: { Changed: 1 },
    FileSystemError: {
        FileNotADirectory: () => new Error('FileNotADirectory'),
        NoPermissions: () => new Error('NoPermissions'),
    },
    Disposable: class {
        constructor(readonly dispose: () => void) { }
    },
    EventEmitter: class<T> {
        private readonly listeners = new Set<(event: T) => void>();
        event = (listener: (event: T) => void) => {
            this.listeners.add(listener);
            return { dispose: () => this.listeners.delete(listener) };
        };
        fire(event: T): void {
            for (const listener of this.listeners) listener(event);
        }
        dispose(): void { this.listeners.clear(); }
    },
    workspace: {
        get textDocuments() { return state.documents; },
        registerFileSystemProvider: (scheme: string, provider: vscode.FileSystemProvider, options: unknown) => {
            state.registrations.set(scheme, { provider, options });
            return { dispose: () => state.registrations.delete(scheme) };
        },
    },
}));

beforeEach(() => {
    state.registrations.clear();
    state.documents = [];
});

afterEach(() => vi.restoreAllMocks());

test('registers native read-only files and reads current UTF-8 content through one standard request', async () => {
    const fixture = setup();
    expect(state.registrations.get('xsmp-smp')?.options).toEqual({ isReadonly: true, isCaseSensitive: true });
    expect(fixture.handlers.size).toBe(0);
    const metadata = await fixture.fileSystem.stat(fixture.mirror);
    expect(metadata).toMatchObject({ type: vscode.FileType.File, size: 0, permissions: vscode.FilePermission.Readonly });
    expect(fixture.sendRequest).not.toHaveBeenCalled();

    fixture.sendRequest.mockResolvedValueOnce({ text: 'catalogue Café\n' });
    expect(Buffer.from(await fixture.fileSystem.readFile(fixture.mirror)).toString('utf8')).toBe('catalogue Café\n');
    expect(fixture.sendRequest).toHaveBeenCalledExactlyOnceWith(TextDocumentContentRequest.type, {
        uri: fixture.mirror.toString(),
    });

    fixture.sendRequest.mockResolvedValueOnce({ text: 'catalogue Changed\n' });
    expect(Buffer.from(await fixture.fileSystem.readFile(fixture.mirror)).toString()).toBe('catalogue Changed\n');
    expect(fixture.sendRequest).toHaveBeenCalledTimes(2);
    expect(fixture.standardMirror.provider.provideTextDocumentContent).not.toHaveBeenCalled();
    fixture.files.dispose();
});

test('preserves empty content and propagates transport failures', async () => {
    const fixture = setup();
    fixture.sendRequest.mockResolvedValueOnce({ text: '' });
    expect(await fixture.fileSystem.readFile(fixture.mirror)).toHaveLength(0);
    fixture.sendRequest.mockRejectedValueOnce(new Error('Disconnected'));
    await expect(fixture.fileSystem.readFile(fixture.mirror)).rejects.toThrow('Disconnected');
    fixture.files.dispose();
});

test('routes mirror refreshes only through file events and advances etags even in one millisecond', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const fixture = setup();
    fixture.files.onClientStarted();
    const before = await fixture.fileSystem.stat(fixture.mirror);

    fixture.refresh(fixture.mirror);
    const first = await fixture.fileSystem.stat(fixture.mirror);
    now.mockReturnValue(500);
    fixture.refresh(fixture.mirror);
    const second = await fixture.fileSystem.stat(fixture.mirror);

    expect(first.mtime).toBeGreaterThan(before.mtime);
    expect(second.mtime).toBeGreaterThan(first.mtime);
    expect(fixture.changes.map(events => events.map(event => ({ type: event.type, uri: event.uri.toString() })))).toEqual([
        [{ type: vscode.FileChangeType.Changed, uri: fixture.mirror.toString() }],
        [{ type: vscode.FileChangeType.Changed, uri: fixture.mirror.toString() }],
    ]);
    expect(fixture.standardMirror.onDidChangeEmitter.fire).not.toHaveBeenCalled();
    expect(fixture.sendRequest).not.toHaveBeenCalled();
    fixture.files.dispose();
});

test('replaces the handler after restart and uses current standard providers for other schemes', () => {
    const fixture = setup();
    fixture.files.onClientStarted();
    const builtin = vscode.Uri.parse('xsmp:/builtin.xsmpcat');
    fixture.refresh(builtin);
    expect(fixture.standardBuiltin.onDidChangeEmitter.fire.mock.calls.map(([uri]) => uri.toString())).toEqual([builtin.toString()]);

    const nextBuiltin = standardProvider('xsmp');
    fixture.providers.splice(0, fixture.providers.length, nextBuiltin, standardProvider('xsmp-smp'));
    const restartedStandardHandler = vi.fn();
    fixture.handlers.set(TextDocumentContentRefreshRequest.method, restartedStandardHandler);
    fixture.files.onClientStarted();
    expect(fixture.handlers.size).toBe(1);
    fixture.refresh(builtin);
    fixture.refresh(fixture.mirror);

    expect(nextBuiltin.onDidChangeEmitter.fire.mock.calls.map(([uri]) => uri.toString())).toEqual([builtin.toString()]);
    expect(fixture.standardBuiltin.onDidChangeEmitter.fire).toHaveBeenCalledOnce();
    expect(restartedStandardHandler).not.toHaveBeenCalled();
    expect(fixture.providers[1].onDidChangeEmitter.fire).not.toHaveBeenCalled();
    expect(fixture.changes).toHaveLength(1);
    fixture.files.dispose();
});

test('refreshes retained documents only when explicitly requested after contributions', () => {
    const fixture = setup();
    const builtin = vscode.Uri.parse('xsmp:/builtin.xsmpcat');
    state.documents = [fixture.mirror, builtin, vscode.Uri.file('/workspace/source.smpcat')]
        .map(uri => ({ uri }) as vscode.TextDocument);
    fixture.files.onClientStarted();
    expect(fixture.changes).toHaveLength(0);
    expect(fixture.standardBuiltin.onDidChangeEmitter.fire).not.toHaveBeenCalled();

    fixture.files.refreshOpenDocuments();

    expect(fixture.changes).toHaveLength(1);
    expect(fixture.standardBuiltin.onDidChangeEmitter.fire).toHaveBeenCalledExactlyOnceWith(builtin);
    expect(fixture.standardMirror.onDidChangeEmitter.fire).not.toHaveBeenCalled();
    expect(fixture.sendRequest).not.toHaveBeenCalled();
    fixture.files.dispose();
});

test('rejects all mutations and directory enumeration without contacting the server', () => {
    const fixture = setup();
    const { fileSystem, mirror } = fixture;
    expect(() => fileSystem.createDirectory(mirror)).toThrow('NoPermissions');
    expect(() => fileSystem.writeFile(mirror, new Uint8Array(), { create: true, overwrite: true })).toThrow('NoPermissions');
    expect(() => fileSystem.delete(mirror, { recursive: false })).toThrow('NoPermissions');
    expect(() => fileSystem.rename(mirror, mirror, { overwrite: false })).toThrow('NoPermissions');
    expect(() => fileSystem.readDirectory(mirror)).toThrow('FileNotADirectory');
    fileSystem.watch(mirror, { recursive: false, excludes: [] }).dispose();
    expect(fixture.sendRequest).not.toHaveBeenCalled();
    fixture.files.dispose();
});

test('cleans up registrations and cannot reattach after disposal', () => {
    const fixture = setup();
    fixture.files.onClientStarted();
    fixture.files.dispose();
    expect(state.registrations.size).toBe(0);
    expect(fixture.handlers.size).toBe(0);
    state.documents = [{ uri: fixture.mirror }] as vscode.TextDocument[];
    fixture.files.onClientStarted();
    fixture.files.refreshOpenDocuments();
    fixture.files.dispose();
    expect(fixture.handlers.size).toBe(0);
    expect(fixture.changes).toHaveLength(0);
});

function standardProvider(scheme: string) {
    return {
        scheme,
        provider: { provideTextDocumentContent: vi.fn() },
        onDidChangeEmitter: { fire: vi.fn() },
    };
}

function setup() {
    const handlers = new Map<string, (params: { uri: string }) => void>();
    const sendRequest = vi.fn();
    const standardBuiltin = standardProvider('xsmp');
    const standardMirror = standardProvider('xsmp-smp');
    const providers = [standardBuiltin, standardMirror];
    const client = {
        sendRequest,
        getFeature: () => ({ getProviders: () => providers }),
        code2ProtocolConverter: { asUri: (uri: vscode.Uri) => uri.toString() },
        protocol2CodeConverter: { asUri: (uri: string) => vscode.Uri.parse(uri) },
        onRequest: (type: { method: string }, handler: (params: { uri: string }) => void) => {
            handlers.set(type.method, handler);
            // The real client's disposable removes the current handler by method.
            return { dispose: () => handlers.delete(type.method) };
        },
    } as unknown as LanguageClient;
    const files = registerServerFiles(client, ['xsmp-smp']);
    const fileSystem = state.registrations.get('xsmp-smp')!.provider;
    const changes: vscode.FileChangeEvent[][] = [];
    fileSystem.onDidChangeFile(event => changes.push(event));
    return {
        files, fileSystem, handlers, sendRequest, standardBuiltin, standardMirror, providers, changes,
        mirror: vscode.Uri.parse('xsmp-smp:/workspace/catalogue.smpcat'),
        refresh: (uri: vscode.Uri) => handlers.get(TextDocumentContentRefreshRequest.method)!({ uri: uri.toString() }),
    };
}
