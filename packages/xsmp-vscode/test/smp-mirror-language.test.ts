import { beforeEach, expect, test, vi } from 'vitest';
import * as vscode from 'vscode';
import { registerSmpMirrorLanguages } from '../src/extension/smp-mirror-language.js';

const state = vi.hoisted(() => ({
    documents: [] as vscode.TextDocument[],
    listeners: new Set<(document: vscode.TextDocument) => Promise<void>>(),
    setLanguage: vi.fn(),
}));

vi.mock('vscode', async () => ({
    Uri: (await import('vscode-uri')).URI,
    workspace: {
        get textDocuments() { return state.documents; },
        onDidOpenTextDocument: (listener: (document: vscode.TextDocument) => Promise<void>) => {
            state.listeners.add(listener);
            return { dispose: () => state.listeners.delete(listener) };
        },
    },
    languages: { setTextDocumentLanguage: state.setLanguage },
}));

beforeEach(() => {
    state.documents = [];
    state.listeners.clear();
    state.setLanguage.mockReset().mockImplementation(async (document, languageId) => {
        document.languageId = languageId;
        await Promise.all([...state.listeners].map(listener => listener(document)));
        return document;
    });
});

test('assigns languages to restored mirrors without changing XML sources or other virtual documents', async () => {
    state.documents = ['smpcat', 'smpcfg', 'smpasb', 'smplnk', 'smpsed']
        .map(extension => document(`xsmp-smp:/workspace/Type.${extension}`, 'xml'));
    const otherDocuments = [
        document('file:///workspace/Type.smpcat', 'xml'),
        document('file:///workspace/Type.xsmpcat', 'xsmpcat'),
        document('xsmp:/builtin.xsmpcat', 'xsmpcat'),
        document('xsmp-smp:/workspace/unknown.txt', 'plaintext'),
    ];
    state.documents.push(...otherDocuments);
    const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;

    await registerSmpMirrorLanguages(context);

    expect(state.documents.slice(0, 5).map(doc => doc.languageId))
        .toEqual(['xsmpcat', 'xsmpcfg', 'xsmpasb', 'xsmplnk', 'xsmpsed']);
    expect(otherDocuments.map(doc => doc.languageId)).toEqual(['xml', 'xsmpcat', 'xsmpcat', 'plaintext']);
    expect(state.setLanguage).toHaveBeenCalledTimes(5); // Reentrant open events must not loop.
    context.subscriptions.forEach(subscription => subscription.dispose());
    expect(state.listeners.size).toBe(0);
});

test('assigns the language when navigation opens a mirror for the first time', async () => {
    await registerSmpMirrorLanguages({ subscriptions: [] } as unknown as vscode.ExtensionContext);
    const opened = document('xsmp-smp:/workspace/Other.smpcat', 'xml');

    await Promise.all([...state.listeners].map(listener => listener(opened)));

    expect(opened.languageId).toBe('xsmpcat');
    expect(state.setLanguage).toHaveBeenCalledOnce();
});

test('does not relabel a closed or already correctly labelled document', async () => {
    state.documents = [
        document('xsmp-smp:/workspace/Closed.smpcat', 'xml', true),
        document('xsmp-smp:/workspace/Ready.smpcat', 'xsmpcat'),
    ];
    await registerSmpMirrorLanguages({ subscriptions: [] } as unknown as vscode.ExtensionContext);
    expect(state.setLanguage).not.toHaveBeenCalled();
});

function document(uri: string, languageId: string, isClosed = false): vscode.TextDocument {
    return { uri: vscode.Uri.parse(uri), languageId, isClosed } as vscode.TextDocument;
}
