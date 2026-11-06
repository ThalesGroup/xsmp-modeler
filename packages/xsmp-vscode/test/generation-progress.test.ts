import { beforeEach, afterEach, expect, test, vi } from 'vitest';
import * as vscode from 'vscode';
import { Cancellation } from 'langium';
import { LSPErrorCodes, ResponseError } from 'vscode-languageserver-protocol/node';
import { withGenerationProgress } from '../src/extension/generation-progress.js';

vi.mock('vscode', () => ({
    ProgressLocation: { Notification: 15 },
    CancellationError: class extends Error {},
    window: { withProgress: vi.fn() },
}));
vi.mock('vscode-languageclient/node', () => import('vscode-languageserver-protocol/node'));

let cancellation: Cancellation.CancellationTokenSource;
beforeEach(() => {
    cancellation = new Cancellation.CancellationTokenSource();
    vi.mocked(vscode.window.withProgress).mockImplementation((_options, task) =>
        Promise.resolve(task({ report: vi.fn() }, cancellation.token)));
});
afterEach(() => {
    cancellation.dispose();
    vi.clearAllMocks();
});

test('provides a cancellable notification and forwards its token to generation', async () => {
    const report = { generatedProjects: ['demo'], skippedProjects: [] };
    const generate = vi.fn(async token => {
        expect(token).toBe(cancellation.token);
        const listener = token.onCancellationRequested(() => listener.dispose());
        cancellation.cancel();
        expect(token.isCancellationRequested).toBe(true);
        return report;
    });
    expect(await withGenerationProgress(generate)).toBe(report);
    expect(vscode.window.withProgress).toHaveBeenCalledWith({
        location: vscode.ProgressLocation.Notification,
        title: 'Generating XSMP sources',
        cancellable: true,
    }, expect.any(Function));
});

test.each([
    new ResponseError(LSPErrorCodes.RequestCancelled, 'Cancelled'),
    new vscode.CancellationError(),
])('does not return a success report for cancellation: %s', async error => {
    expect(await withGenerationProgress(async () => { throw error; })).toBeUndefined();
});

test('preserves real failures even if the user also cancelled', async () => {
    const error = new Error('Cannot write output');
    cancellation.cancel();
    await expect(withGenerationProgress(async () => { throw error; })).rejects.toBe(error);
});
