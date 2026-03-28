import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const vscodeState = vi.hoisted(() => ({
    commandHandlers: new Map<string, (...args: any[]) => any>(),
    hoverProviders: [] as Array<{ selector: unknown; provider: any }>,
    customEditorProviders: new Map<string, { provider: any; options: unknown }>(),
    executedCommands: [] as Array<{ command: string; args: unknown[] }>,
    openedDocuments: [] as any[],
    shownDocuments: [] as Array<{ document: any; options: unknown }>,
    errorMessages: [] as string[],
    infoMessages: [] as string[],
    activeTextEditor: undefined as any,
    tabGroupsAll: [] as any[],
    closeTabCalls: [] as Array<{ tab: any; preserveFocus: boolean }>,
}));

vi.mock('vscode', async () => {
    const { URI } = await import('vscode-uri');

    class Position {
        constructor(
            public readonly line: number,
            public readonly character: number,
        ) { }
    }

    class Range {
        constructor(
            public readonly start: Position,
            public readonly end: Position,
        ) { }
    }

    class MarkdownString {
        value: string;
        isTrusted: unknown;

        constructor(value: string) {
            this.value = value;
            this.isTrusted = false;
        }
    }

    class Hover {
        constructor(
            public readonly contents: MarkdownString,
            public readonly range?: Range,
        ) { }
    }

    class TabInputCustom {
        constructor(
            public readonly uri: InstanceType<typeof URI>,
            public readonly viewType: string,
        ) { }
    }

    return {
        Uri: URI,
        Position,
        Range,
        MarkdownString,
        Hover,
        TabInputCustom,
        commands: {
            registerCommand: (command: string, handler: (...args: any[]) => any) => {
                vscodeState.commandHandlers.set(command, handler);
                return { dispose() { } };
            },
            executeCommand: async (command: string, ...args: unknown[]) => {
                vscodeState.executedCommands.push({ command, args });
            },
        },
        languages: {
            registerHoverProvider: (selector: unknown, provider: unknown) => {
                vscodeState.hoverProviders.push({ selector, provider });
                return { dispose() { } };
            },
        },
        workspace: {
            openTextDocument: async (uri: InstanceType<typeof URI>) => {
                const document = { uri };
                vscodeState.openedDocuments.push(document);
                return document;
            },
        },
        window: {
            get activeTextEditor() {
                return vscodeState.activeTextEditor;
            },
            showTextDocument: async (document: unknown, options: unknown) => {
                vscodeState.shownDocuments.push({ document, options });
                return document;
            },
            showErrorMessage: (message: string) => {
                vscodeState.errorMessages.push(message);
            },
            showInformationMessage: (message: string) => {
                vscodeState.infoMessages.push(message);
            },
            registerCustomEditorProvider: (viewType: string, provider: unknown, options: unknown) => {
                vscodeState.customEditorProviders.set(viewType, { provider, options });
                return { dispose() { } };
            },
            get tabGroups() {
                return {
                    all: vscodeState.tabGroupsAll,
                    close: async (tab: unknown, preserveFocus: boolean) => {
                        vscodeState.closeTabCalls.push({ tab, preserveFocus });
                    },
                };
            },
        },
    };
});

import * as vscode from 'vscode';
import { GetServerFileContentRequest } from 'xsmp/lsp';
import {
    OpenEmbeddedDocumentationCommand,
    registerEmbeddedDocumentation,
} from '../src/extension/embedded-documentation.js';
import {
    OpenSmpMirrorCommand,
    OpenSmpXmlSourceCommand,
    registerSmpMirrorCommands,
} from '../src/extension/smp-mirror-commands.js';
import {
    registerSmpMirrorPreview,
    SmpMirrorPreviewViewType,
} from '../src/extension/smp-mirror-preview.js';

let tempDir: string;

beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-vscode-runtime-'));
    resetVscodeState();
});

afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('VS Code extension runtime behavior', () => {
    test('opens XSMP mirrors from SMP source files and reopens XML sources from mirror documents', async () => {
        const client = {
            sendRequest: vi.fn().mockResolvedValue('catalogue Demo\n'),
        };
        const context = createExtensionContext();

        registerSmpMirrorCommands(context, () => client as never);

        const openMirror = vscodeState.commandHandlers.get(OpenSmpMirrorCommand);
        const reopenSource = vscodeState.commandHandlers.get(OpenSmpXmlSourceCommand);
        expect(openMirror).toBeTypeOf('function');
        expect(reopenSource).toBeTypeOf('function');

        await openMirror?.(vscode.Uri.file('/workspace/demo/test.smpcat'));

        expect(client.sendRequest).toHaveBeenCalledWith(
            GetServerFileContentRequest,
            'xsmp-smp:/workspace/demo/test.xsmpcat',
        );
        expect(vscodeState.openedDocuments[0]?.uri.toString()).toBe('xsmp-smp:/workspace/demo/test.xsmpcat');
        expect(vscodeState.shownDocuments[0]?.document.uri.toString()).toBe('xsmp-smp:/workspace/demo/test.xsmpcat');
        expect(vscodeState.shownDocuments[0]?.options).toEqual({ preview: false });

        await reopenSource?.(vscode.Uri.parse('xsmp-smp:/workspace/demo/test.xsmpcat'));

        expect(vscodeState.openedDocuments[1]?.uri.toString()).toBe('file:///workspace/demo/test.smpcat');
        expect(vscodeState.shownDocuments[1]?.document.uri.toString()).toBe('file:///workspace/demo/test.smpcat');
        expect(vscodeState.errorMessages).toEqual([]);
        expect(vscodeState.infoMessages).toEqual([]);
    });

    test('reports user-facing mirror command errors when no usable source or mirror content exists', async () => {
        const client = {
            sendRequest: vi.fn().mockResolvedValue(undefined),
        };
        const context = createExtensionContext();

        registerSmpMirrorCommands(context, () => client as never);

        const openMirror = vscodeState.commandHandlers.get(OpenSmpMirrorCommand);
        const reopenSource = vscodeState.commandHandlers.get(OpenSmpXmlSourceCommand);

        await openMirror?.();
        await openMirror?.(vscode.Uri.file('/workspace/demo/test.smpcat'));
        await reopenSource?.();

        expect(vscodeState.errorMessages).toEqual([
            'Open or select an SMP XML file (.smpcat, .smpcfg, .smplnk, .smpasb, or .smpsed) before opening XSMP.',
            'Open an SMP XML mirror or source file before reopening the XML source.',
        ]);
        expect(vscodeState.infoMessages).toEqual([
            "No XSMP view is currently available for '/workspace/demo/test.smpcat'.",
        ]);
    });

    test('resolves SMP preview editors to mirror documents and closes the transient custom tab', async () => {
        const client = {
            sendRequest: vi.fn().mockResolvedValue('catalogue Demo\n'),
        };
        const context = createExtensionContext();

        registerSmpMirrorPreview(context, () => client as never);

        const registration = vscodeState.customEditorProviders.get(SmpMirrorPreviewViewType);
        expect(registration).toBeDefined();

        const provider = registration?.provider;
        const sourceUri = vscode.Uri.file('/workspace/demo/test.smpcat');
        const document = await provider.openCustomDocument(sourceUri);
        const matchingTab = {
            input: new vscode.TabInputCustom(sourceUri, SmpMirrorPreviewViewType),
        };
        vscodeState.tabGroupsAll = [{ tabs: [matchingTab] }];

        const webviewPanel = {
            viewColumn: 2,
            webview: { html: '' },
        };

        await provider.resolveCustomEditor(document, webviewPanel);

        expect(webviewPanel.webview.html).toContain('Opening XSMP for /workspace/demo/test.smpcat...');
        expect(client.sendRequest).toHaveBeenCalledWith(
            GetServerFileContentRequest,
            'xsmp-smp:/workspace/demo/test.xsmpcat',
        );
        expect(vscodeState.openedDocuments[0]?.uri.toString()).toBe('xsmp-smp:/workspace/demo/test.xsmpcat');
        expect(vscodeState.shownDocuments[0]?.options).toEqual({
            viewColumn: 2,
            preview: true,
            preserveFocus: true,
        });
        expect(vscodeState.closeTabCalls).toEqual([
            { tab: matchingTab, preserveFocus: true },
        ]);
    });

    test('opens embedded documentation pages and exposes hover links only in code positions', async () => {
        fs.mkdirSync(path.join(tempDir, 'out', 'docs', 'languages'), { recursive: true });
        fs.writeFileSync(path.join(tempDir, 'out', 'docs', 'languages', 'xsmpasb.md'), '# Assembly docs\n', 'utf-8');

        const context = createExtensionContext(tempDir);
        registerEmbeddedDocumentation(context);

        const openDocs = vscodeState.commandHandlers.get(OpenEmbeddedDocumentationCommand);
        expect(openDocs).toBeTypeOf('function');

        await openDocs?.({
            keyword: 'assembly',
            page: 'languages/xsmpasb.md',
            title: 'XSMP assembly reference',
            anchor: 'root-structure',
        });

        expect(vscodeState.executedCommands).toEqual([
            {
                command: 'markdown.showPreviewToSide',
                args: [vscode.Uri.file(path.join(tempDir, 'out', 'docs', 'languages', 'xsmpasb.md')).with({ fragment: 'root-structure' })],
            },
        ]);

        const hoverProvider = vscodeState.hoverProviders[0]?.provider;
        expect(hoverProvider).toBeDefined();

        const codeHover = hoverProvider.provideHover(
            createTextDocument('xsmpasb', 'assembly Demo\n', vscode.Uri.file('/workspace/demo.xsmpasb')),
            new vscode.Position(0, 1),
        );
        const commentHover = hoverProvider.provideHover(
            createTextDocument('xsmpasb', '// assembly Demo\n', vscode.Uri.file('/workspace/demo.xsmpasb')),
            new vscode.Position(0, 4),
        );

        expect(codeHover?.contents.value).toContain('command:xsmp.openDocumentation?');
        expect(commentHover).toBeUndefined();
    });
});

function resetVscodeState(): void {
    vscodeState.commandHandlers.clear();
    vscodeState.hoverProviders = [];
    vscodeState.customEditorProviders.clear();
    vscodeState.executedCommands = [];
    vscodeState.openedDocuments = [];
    vscodeState.shownDocuments = [];
    vscodeState.errorMessages = [];
    vscodeState.infoMessages = [];
    vscodeState.activeTextEditor = undefined;
    vscodeState.tabGroupsAll = [];
    vscodeState.closeTabCalls = [];
}

function createExtensionContext(root = tempDir) {
    return {
        subscriptions: [] as unknown[],
        asAbsolutePath(relativePath: string) {
            return path.join(root, relativePath);
        },
    } as const;
}

function createTextDocument(languageId: string, text: string, uri: ReturnType<typeof vscode.Uri.file>) {
    const lines = text.split('\n');
    return {
        uri,
        languageId,
        lineAt(line: number) {
            return { text: lines[line] ?? '' };
        },
        getWordRangeAtPosition(position: InstanceType<typeof vscode.Position>, pattern: RegExp) {
            const line = lines[position.line] ?? '';
            const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
            const regex = new RegExp(pattern.source, flags);
            let match: RegExpExecArray | null;
            while ((match = regex.exec(line)) !== null) {
                const start = match.index;
                const end = start + match[0].length;
                if (position.character >= start && position.character <= end) {
                    return new vscode.Range(
                        new vscode.Position(position.line, start),
                        new vscode.Position(position.line, end),
                    );
                }
            }
            return undefined;
        },
        getText(range?: InstanceType<typeof vscode.Range>) {
            if (!range) {
                return text;
            }
            const startOffset = positionToOffset(lines, range.start.line, range.start.character);
            const endOffset = positionToOffset(lines, range.end.line, range.end.character);
            return text.slice(startOffset, endOffset);
        },
    };
}

function positionToOffset(lines: string[], line: number, character: number): number {
    let offset = 0;
    for (let index = 0; index < line; index += 1) {
        offset += (lines[index] ?? '').length + 1;
    }
    return offset + character;
}
