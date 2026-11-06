import { Cancellation, DefaultWorkspaceLock, Deferred, Emitter, OperationCancelled, URI } from 'langium';
import { ErrorCodes, type InitializeParams, type TextDocumentContentClientCapabilities } from 'vscode-languageserver-protocol';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { XsmpSharedServices } from '@xsmp/core';
import { XsmpTextDocumentContentProvider } from '@xsmp/core/lsp';

afterEach(() => vi.restoreAllMocks());

describe('Virtual XSMP document content', () => {
    test('serves builtins and authoritative on-demand mirrors, with empty results for missing content', async () => {
        const fixture = createProvider();
        fixture.ready.resolve();
        fixture.documents.set(URI.parse('xsmp:///builtin.xsmpcat').toString(), 'catalogue Builtin');
        fixture.documents.set(URI.parse('xsmp-smp:///mirror.smpcat').toString(), 'catalogue StaleClientCopy');
        fixture.mirrorContent.mockResolvedValueOnce('catalogue CurrentMirror');

        expect(fixture.provider.schemes).toEqual(['xsmp', 'xsmp-smp']);
        await expect(fixture.content('xsmp:///builtin.xsmpcat')).resolves.toEqual({ text: 'catalogue Builtin' });
        await expect(fixture.content('xsmp-smp:///mirror.smpcat')).resolves.toEqual({ text: 'catalogue CurrentMirror' });
        await expect(fixture.content('xsmp-smp:///mirror.smpcat')).resolves.toEqual({ text: '' });
        await expect(fixture.content('xsmp:///missing.xsmpcat')).resolves.toEqual({ text: '' });
    });

    test.each(['file:///secret.xsmpcat', 'https://example.org/catalogue.xsmpcat'])(
        'rejects unsupported URI %s before waiting for the workspace', async uri => {
            const fixture = createProvider();
            await expect(fixture.content(uri)).rejects.toMatchObject({ code: ErrorCodes.InvalidParams });
            expect(fixture.mirrorContent).not.toHaveBeenCalled();
        },
    );

    test('waits for initialization and pending workspace writes before resolving content', async () => {
        const fixture = createProvider();
        const release = new Deferred<void>();
        const write = fixture.lock.write(() => release.promise);
        const content = fixture.content('xsmp-smp:///mirror.smpcat');
        try {
            await nextTurn();
            expect(fixture.mirrorContent).not.toHaveBeenCalled();
            fixture.ready.resolve();
            await nextTurn();
            expect(fixture.mirrorContent).not.toHaveBeenCalled();
        } finally {
            fixture.ready.resolve();
            release.resolve();
        }
        await write;
        await expect(content).resolves.toEqual({ text: '' });
        expect(fixture.mirrorContent).toHaveBeenCalledOnce();
    });

    test('honors cancellation before initialization and after waiting for a write', async () => {
        const fixture = createProvider();
        const cancellation = new Cancellation.CancellationTokenSource();
        cancellation.cancel();
        await expect(fixture.provider.provideTextDocumentContent({ uri: 'xsmp-smp:///mirror.smpcat' }, cancellation.token))
            .rejects.toBe(OperationCancelled);
        cancellation.dispose();

        fixture.ready.resolve();
        const release = new Deferred<void>();
        const write = fixture.lock.write(() => release.promise);
        const queuedCancellation = new Cancellation.CancellationTokenSource();
        const content = fixture.provider.provideTextDocumentContent({ uri: 'xsmp-smp:///mirror.smpcat' }, queuedCancellation.token);
        await nextTurn();
        queuedCancellation.cancel();
        release.resolve();
        await write;
        await expect(content).rejects.toBe(OperationCancelled);
        queuedCancellation.dispose();
        expect(fixture.mirrorContent).not.toHaveBeenCalled();
    });

    test.each([undefined, {}, { dynamicRegistration: false }])('refreshes only clients advertising support: %j', async capability => {
        const fixture = createProvider(capability);
        fixture.ready.resolve();
        await fixture.provider.refresh([URI.parse('xsmp-smp:///mirror.smpcat')]);
        expect(fixture.refresh).toHaveBeenCalledTimes(capability === undefined ? 0 : 1);
    });

    test('dispatches every refresh concurrently, even when one request fails', async () => {
        const fixture = createProvider({});
        const secondReply = new Deferred<void>();
        fixture.refresh.mockImplementation(async uri => {
            if (uri.endsWith('/first.smpcat')) throw new Error('Client refresh failed');
            await secondReply.promise;
        });
        const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const first = URI.parse('xsmp-smp:///first.smpcat');
        const second = URI.parse('xsmp-smp:///second.smpcat');
        const refresh = fixture.provider.refresh([first, second, first]);
        try {
            expect(fixture.refresh.mock.calls).toEqual([[first.toString()], [second.toString()]]);
        } finally {
            secondReply.resolve();
        }
        await refresh;
        expect(error).toHaveBeenCalledOnce();
    });
});

function createProvider(capability?: TextDocumentContentClientCapabilities) {
    const initialized = new Emitter<InitializeParams>();
    const ready = new Deferred<void>();
    const lock = new DefaultWorkspaceLock();
    const documents = new Map<string, string>();
    const mirrorContent = vi.fn(async (_uri: URI): Promise<string | undefined> => undefined);
    const refresh = vi.fn(async (_uri: string): Promise<void> => undefined);
    const services = {
        lsp: {
            LanguageServer: { onInitialize: initialized.event },
            Connection: { workspace: { textDocumentContent: { refresh } } },
        },
        workspace: {
            WorkspaceManager: { ready: ready.promise },
            WorkspaceLock: lock,
            LangiumDocuments: {
                getDocument: (uri: URI) => documents.has(uri.toString())
                    ? { textDocument: { getText: () => documents.get(uri.toString()) } }
                    : undefined,
            },
        },
        SmpMirrorManager: { getOrCreateMirrorContent: mirrorContent },
    } as unknown as XsmpSharedServices;
    const provider = new XsmpTextDocumentContentProvider(services);
    initialized.fire({ processId: null, rootUri: null, capabilities: { workspace: { textDocumentContent: capability } } });
    initialized.dispose();
    const content = (uri: string) => provider.provideTextDocumentContent({ uri }, Cancellation.CancellationToken.None);
    return { provider, ready, lock, documents, mirrorContent, refresh, content };
}

function nextTurn(): Promise<void> {
    return new Promise(resolve => setImmediate(resolve));
}
