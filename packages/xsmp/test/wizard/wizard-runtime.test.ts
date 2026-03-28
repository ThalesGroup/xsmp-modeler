import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const vscodeState = vi.hoisted(() => ({
    inputBoxResponses: [] as Array<string | undefined>,
    quickPickResponses: [] as unknown[],
    openDialogResponses: [] as Array<readonly string[] | undefined>,
    openedDocuments: [] as Array<{ uri: { fsPath: string; toString(): string } }>,
    shownDocuments: [] as Array<{ document: unknown }>,
    errorMessages: [] as string[],
    warningMessages: [] as string[],
    workspaceFolders: [] as Array<{ name: string; uri: { fsPath: string; toString(): string } }>,
    updatedWorkspaceFolders: [] as Array<{ start: number; deleteCount: number | null; folders: unknown[] }>,
    activeTextEditor: undefined as undefined | { document: { uri: { fsPath: string; toString(): string } } },
}));

vi.mock('node:os', async () => {
    const actual = await vi.importActual<typeof import('node:os')>('node:os');
    return {
        ...actual,
        userInfo: () => ({ username: 'wizard-user' }),
    };
});

vi.mock('node:crypto', async () => {
    const actual = await vi.importActual<typeof import('node:crypto')>('node:crypto');
    return {
        ...actual,
        randomUUID: () => '12345678-1234-1234-1234-123456789abc',
    };
});

vi.mock('vscode', async () => {
    const { URI } = await import('vscode-uri');

    return {
        Uri: URI,
        window: {
            showOpenDialog: async () => {
                const response = vscodeState.openDialogResponses.shift();
                return response?.map(entry => URI.file(entry));
            },
            showInputBox: async () => vscodeState.inputBoxResponses.shift(),
            showQuickPick: async (items: readonly any[], options?: { canPickMany?: boolean }) => {
                const response = vscodeState.quickPickResponses.shift();
                if (response === undefined) {
                    return undefined;
                }
                if (typeof response === 'function') {
                    return response(items, options);
                }
                if (options?.canPickMany) {
                    const requested = Array.isArray(response) ? response : [response];
                    return requested
                        .map(entry => resolveQuickPickItem(items, entry))
                        .filter(Boolean);
                }
                return resolveQuickPickItem(items, response);
            },
            showErrorMessage: async (message: string) => {
                vscodeState.errorMessages.push(message);
            },
            showWarningMessage: async (message: string) => {
                vscodeState.warningMessages.push(message);
            },
            get activeTextEditor() {
                return vscodeState.activeTextEditor;
            },
            showTextDocument: async (document: unknown) => {
                vscodeState.shownDocuments.push({ document });
                return document;
            },
        },
        workspace: {
            get workspaceFolders() {
                return vscodeState.workspaceFolders;
            },
            updateWorkspaceFolders: (start: number, deleteCount: number | null, ...folders: unknown[]) => {
                vscodeState.updatedWorkspaceFolders.push({ start, deleteCount, folders });
                return true;
            },
            openTextDocument: async (target: string | { fsPath: string }) => {
                const uri = typeof target === 'string' ? URI.file(target) : target;
                const document = { uri };
                vscodeState.openedDocuments.push(document);
                return document;
            },
        },
    };
});

import * as vscode from 'vscode';
import {
    GetContributionSummaries,
    GetContributionWizardPrompts,
    ScaffoldProject,
} from 'xsmp/lsp';
import {
    createProjectWizard,
    createXsmpStarterFileWizard,
} from 'xsmp/wizard';

let tempDir: string;

beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-wizard-runtime-'));
    resetVscodeState();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-28T12:00:00.000Z'));
});

afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('XSMP project wizard', () => {
    test('creates a project, collects prompt values, reports scaffold failures, and opens the starter catalogue', async () => {
        const workspaceRoot = path.join(tempDir, 'workspace');
        fs.mkdirSync(workspaceRoot, { recursive: true });

        vscodeState.openDialogResponses.push([workspaceRoot]);
        vscodeState.inputBoxResponses.push('1invalid-name', 'mission-demo', 'mission_custom');
        vscodeState.quickPickResponses.push(
            'XSMP SDK',
            ['Python', 'SMP'],
            'Yes',
            'PyPy',
            'Yes',
        );

        const client = {
            sendRequest: vi.fn(async (request: { method?: string }, payload: unknown) => {
                switch (request.method) {
                    case GetContributionSummaries.method:
                        if (payload === 'profile') {
                            return [
                                {
                                    kind: 'profile',
                                    id: 'xsmp-sdk',
                                    label: 'XSMP SDK',
                                    description: 'Recommended SDK profile.',
                                    defaultSelected: true,
                                    extensionId: '@xsmp/profile-xsmp-sdk',
                                    hasScaffolder: true,
                                },
                            ];
                        }
                        if (payload === 'tool') {
                            return [
                                {
                                    kind: 'tool',
                                    id: 'python',
                                    label: 'Python',
                                    description: 'Generate Python helpers.',
                                    defaultSelected: false,
                                    extensionId: '@xsmp/tool-python',
                                    hasScaffolder: true,
                                },
                                {
                                    kind: 'tool',
                                    id: 'smp',
                                    label: 'SMP',
                                    description: 'Generate SMP XML.',
                                    defaultSelected: true,
                                    extensionId: '@xsmp/tool-smp',
                                    hasScaffolder: false,
                                },
                            ];
                        }
                        return [];
                    case GetContributionWizardPrompts.method:
                        expect(payload).toEqual({
                            selectedProfileId: 'xsmp-sdk',
                            selectedToolIds: ['python', 'smp'],
                        });
                        return [
                            {
                                contributionId: 'python',
                                id: 'moduleName',
                                key: 'python.moduleName',
                                label: 'Module Name',
                                type: 'string',
                                placeholder: 'mission_custom',
                                defaultValue: 'mission_custom',
                            },
                            {
                                contributionId: 'python',
                                id: 'enableTests',
                                key: 'python.enableTests',
                                label: 'Enable Tests',
                                type: 'boolean',
                                description: 'Generate starter pytest files.',
                            },
                            {
                                contributionId: 'python',
                                id: 'runtime',
                                key: 'python.runtime',
                                label: 'Runtime',
                                type: 'choice',
                                defaultValue: 'cpython',
                                choices: [
                                    { value: 'cpython', label: 'CPython' },
                                    { value: 'pypy', label: 'PyPy' },
                                ],
                            },
                        ];
                    case ScaffoldProject.method: {
                        expect(payload).toEqual({
                            projectName: 'mission-demo',
                            projectDir: path.join(workspaceRoot, 'mission-demo'),
                            selectedProfileId: 'xsmp-sdk',
                            selectedToolIds: ['python', 'smp'],
                            promptValues: {
                                'python.moduleName': 'mission_custom',
                                'python.enableTests': true,
                                'python.runtime': 'pypy',
                            },
                        });
                        return {
                            dependencies: ['zeta', 'Alpha', 'Alpha'],
                            failures: [
                                { contributionId: 'python', message: 'Failed to create package skeleton.' },
                                { contributionId: 'smp', message: 'SMP generator metadata is missing.' },
                                { contributionId: 'docs', message: 'Documentation tool is unavailable.' },
                                { contributionId: 'extra', message: 'One more warning for the summary.' },
                            ],
                        };
                    }
                    default:
                        throw new Error(`Unexpected request: ${request.method}`);
                }
            }),
        };

        await createProjectWizard(client as never);

        const projectDir = path.join(workspaceRoot, 'mission-demo');
        const cataloguePath = path.join(projectDir, 'smdl', 'mission-demo.xsmpcat');
        const projectFilePath = path.join(projectDir, 'xsmp.project');
        const catalogueContent = fs.readFileSync(cataloguePath, 'utf-8');
        const projectContent = fs.readFileSync(projectFilePath, 'utf-8');

        expect(catalogueContent).toContain('Catalogue mission-demo');
        expect(catalogueContent).toContain('@creator wizard-user');
        expect(catalogueContent).toContain('@date 2026-03-28T12:00:00.000Z');
        expect(catalogueContent).toContain('catalogue mission_demo');
        expect(catalogueContent).toContain('namespace mission_demo');

        expect(projectContent).toContain("profile 'xsmp-sdk'");
        expect(projectContent).toContain("tool 'python'");
        expect(projectContent).toContain("tool 'smp'");
        expect(projectContent).toContain("dependency 'Alpha'");
        expect(projectContent).toContain("dependency 'zeta'");
        expect(projectContent.indexOf("dependency 'Alpha'")).toBeLessThan(projectContent.indexOf("dependency 'zeta'"));

        expect(vscodeState.errorMessages).toContain(String.raw`Project name must follow the format [a-zA-Z][a-zA-Z0-9_.-]\w*`);
        expect(vscodeState.warningMessages[0]).toContain('Project scaffold completed with errors.');
        expect(vscodeState.warningMessages[0]).toContain('python: Failed to create package skeleton.');
        expect(vscodeState.warningMessages[0]).toContain('smp: SMP generator metadata is missing.');
        expect(vscodeState.warningMessages[0]).toContain('docs: Documentation tool is unavailable.');
        expect(vscodeState.warningMessages[0]).toContain('1 more');
        expect(vscodeState.updatedWorkspaceFolders).toHaveLength(1);
        expect(vscodeState.openedDocuments[0]?.uri.fsPath).toBe(cataloguePath);
        expect((vscodeState.shownDocuments[0]?.document as { uri: { fsPath: string } }).uri.fsPath).toBe(cataloguePath);
    });

    test('stops with a clear error when the project folder already exists', async () => {
        const workspaceRoot = path.join(tempDir, 'workspace');
        const existingProjectDir = path.join(workspaceRoot, 'existing-app');
        fs.mkdirSync(existingProjectDir, { recursive: true });

        vscodeState.openDialogResponses.push([workspaceRoot]);
        vscodeState.inputBoxResponses.push('existing-app');

        const client = {
            sendRequest: vi.fn(async (request: { method?: string }) => {
                if (request.method === GetContributionSummaries.method) {
                    return [];
                }
                if (request.method === GetContributionWizardPrompts.method) {
                    return [];
                }
                throw new Error(`Unexpected request: ${request.method}`);
            }),
        };

        await createProjectWizard(client as never);

        expect(vscodeState.errorMessages).toContain(`Project folder '${existingProjectDir}' already exists.`);
        expect(vscodeState.openedDocuments).toHaveLength(0);
        expect(vscodeState.updatedWorkspaceFolders).toHaveLength(0);
        expect(client.sendRequest).not.toHaveBeenCalledWith(expect.objectContaining({ method: ScaffoldProject.method }), expect.anything());
    });
});

describe('XSMP starter file wizard', () => {
    test('creates a starter file next to the requested target path after validating the name', async () => {
        const targetUri = vscode.Uri.file(path.join(tempDir, 'workspace', 'notes', 'draft.txt'));

        vscodeState.inputBoxResponses.push('1bad-name', 'hello-world');

        await createXsmpStarterFileWizard('catalogue', targetUri);

        const createdPath = path.join(tempDir, 'workspace', 'notes', 'hello-world.xsmpcat');
        const createdContent = fs.readFileSync(createdPath, 'utf-8');

        expect(createdContent).toContain('@creator wizard-user');
        expect(createdContent).toContain('@date 2026-03-28T12:00:00.000Z');
        expect(createdContent).toContain('catalogue hello_world_catalogue');
        expect(createdContent).toContain('@uuid 12345678-1234-1234-1234-123456789abc');
        expect(createdContent).not.toContain('${uuid}');
        expect(vscodeState.errorMessages).toContain('File name must follow the format [A-Za-z][A-Za-z0-9_.-]*');
        expect(vscodeState.openedDocuments[0]?.uri.fsPath).toBe(createdPath);
    });

    test('selects a workspace folder for starter files and refuses to overwrite existing files', async () => {
        const alphaDir = path.join(tempDir, 'alpha');
        const betaDir = path.join(tempDir, 'beta');
        fs.mkdirSync(alphaDir, { recursive: true });
        fs.mkdirSync(betaDir, { recursive: true });
        fs.writeFileSync(path.join(betaDir, 'hello-world.xsmplnk'), 'existing', 'utf-8');

        vscodeState.workspaceFolders = [
            { name: 'alpha', uri: vscode.Uri.file(alphaDir) },
            { name: 'beta', uri: vscode.Uri.file(betaDir) },
        ];
        vscodeState.quickPickResponses.push('Link Base', 'beta');
        vscodeState.inputBoxResponses.push('hello-world');

        await createXsmpStarterFileWizard();

        expect(vscodeState.errorMessages).toContain(`Link Base file '${path.join(betaDir, 'hello-world.xsmplnk')}' already exists.`);
        expect(vscodeState.openedDocuments).toHaveLength(0);
    });
});

function resetVscodeState(): void {
    vscodeState.inputBoxResponses = [];
    vscodeState.quickPickResponses = [];
    vscodeState.openDialogResponses = [];
    vscodeState.openedDocuments = [];
    vscodeState.shownDocuments = [];
    vscodeState.errorMessages = [];
    vscodeState.warningMessages = [];
    vscodeState.workspaceFolders = [];
    vscodeState.updatedWorkspaceFolders = [];
    vscodeState.activeTextEditor = undefined;
}

function resolveQuickPickItem(items: readonly any[], matcher: unknown): any {
    if (matcher === undefined) {
        return undefined;
    }
    if (typeof matcher === 'string') {
        return items.find(item =>
            item.label === matcher
            || item.description === matcher
            || item.detail === matcher
            || item.value === matcher
            || item.summary?.id === matcher
            || item.folder?.name === matcher,
        );
    }
    return items.find(item => item === matcher || item.label === (matcher as { label?: string }).label) ?? matcher;
}
