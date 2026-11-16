import { expect, test, vi } from 'vitest';
import * as path from 'node:path';
import type * as vscode from 'vscode';
import type { LanguageClientOptions } from 'vscode-languageclient/node';

const state = vi.hoisted(() => ({ options: undefined as LanguageClientOptions | undefined }));

vi.mock('vscode', () => {
    const disposable = () => ({ dispose() { } });
    return {
        window: { createOutputChannel: disposable },
        workspace: {
            workspaceFolders: [],
            createFileSystemWatcher: disposable,
            onDidSaveTextDocument: disposable,
        },
        commands: { registerCommand: disposable },
        languages: { registerHoverProvider: disposable },
    };
});
vi.mock('vscode-languageclient/node', () => ({
    LanguageClient: class {
        constructor(_id: string, _name: string, _server: unknown, options: LanguageClientOptions) {
            state.options = options;
        }
    },
    State: { Starting: 1, Running: 2 },
    TransportKind: { ipc: 1 },
}));
vi.mock('@xsmp/core', () => ({
    xsmpExtensionApiVersion: '2.0.0', builtInScheme: 'xsmp', smpMirrorScheme: 'xsmp-smp',
}));
vi.mock('@xsmp/core/wizard', () => ({}));
vi.mock('@xsmp/core/lsp', () => ({}));
vi.mock('@xsmp/core/smp', () => ({}));
vi.mock('../src/extension/smp-mirror-language.js', () => ({ registerSmpMirrorLanguages: async () => { } }));
vi.mock('../src/extension/server-files.js', () => ({ registerServerFiles: () => ({ dispose() { } }) }));
vi.mock('../src/extension/language-client-running-handler.js', () => ({
    // Exercise client construction and command registration without starting an extension host.
    startLanguageClientAndRunTask: async () => { },
}));

import { activate } from '../src/extension/main.js';

test('does not authorize commands from server-provided documentation', async () => {
    const context = {
        subscriptions: [],
        asAbsolutePath: (relative: string) => path.join('/extension', relative),
    } as unknown as vscode.ExtensionContext;

    await activate(context);

    // LSP documentation contains user-authored catalogue comments. The language client
    // applies this policy to both hover and completion MarkdownStrings.
    expect(state.options?.markdown?.isTrusted).toBe(false);
    expect(state.options?.markdown?.supportHtml).toBe(true);
});
