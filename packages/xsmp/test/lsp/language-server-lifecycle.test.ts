import { describe, expect, test, vi } from 'vitest';
import type { WorkspaceFoldersChangeEvent } from 'vscode-languageserver-protocol';
import type { XsmpSharedServices } from '@xsmp/core';
import { XsmpLanguageServer } from '@xsmp/core/lsp';

describe('XSMP language server lifecycle', () => {
    test('registers workspace-folder notifications only after client initialization', () => {
        let workspaceFolderListener: ((event: WorkspaceFoldersChangeEvent) => unknown) | undefined;
        const updateWorkspaceFolders = vi.fn(async () => undefined);
        const onDidChangeWorkspaceFolders = vi.fn((listener: (event: WorkspaceFoldersChangeEvent) => unknown) => {
            workspaceFolderListener = listener;
            return { dispose: vi.fn() };
        });
        const services = {
            lsp: {
                Connection: {
                    workspace: { onDidChangeWorkspaceFolders },
                },
            },
            workspace: {
                WorkspaceManager: { updateWorkspaceFolders },
            },
        } as unknown as XsmpSharedServices;
        const server = new TestLanguageServer(services);

        server.registerWorkspaceFolderChangeHandlerForTest();

        expect(onDidChangeWorkspaceFolders).not.toHaveBeenCalled();

        server.fireInitializedForTest();

        expect(onDidChangeWorkspaceFolders).toHaveBeenCalledOnce();
        const event: WorkspaceFoldersChangeEvent = { added: [], removed: [] };
        workspaceFolderListener?.(event);
        expect(updateWorkspaceFolders).toHaveBeenCalledWith(event);
    });
});

class TestLanguageServer extends XsmpLanguageServer {
    registerWorkspaceFolderChangeHandlerForTest(): void {
        this.registerWorkspaceFolderChangeHandler();
    }

    fireInitializedForTest(): void {
        this.onInitializedEmitter.fire({});
    }
}
