import { describe, expect, test, vi } from 'vitest';
import {
    registerLanguageClientRestartTask,
    startLanguageClientAndRunTask,
    stopLanguageClientWhenReady,
    type LanguageClientStateChange,
} from '../src/extension/language-client-running-handler.js';

const stopped = 1;
const running = 2;
const starting = 3;

describe('language client restart task', () => {
    test('waits for the initial task, serializes restarts and recovers after a failure', async () => {
        const client = new TestStateSource<number>();
        let finishInitial!: () => void;
        const initialTask = new Promise<void>(resolve => {
            finishInitial = resolve;
        });
        let rejectFirst: (() => void) | undefined;
        const firstTask = new Promise<void>((_, reject) => {
            rejectFirst = () => reject(new Error('restart failed'));
        });
        const task = vi.fn()
            .mockReturnValueOnce(firstTask)
            .mockResolvedValueOnce(undefined);
        const onFailure = vi.fn(() => {
            throw new Error('reporting failed');
        });
        const registration = registerLanguageClientRestartTask(client, running, task, onFailure, initialTask);

        client.fire(running);
        client.fire(running);
        await Promise.resolve();
        expect(task).not.toHaveBeenCalled();

        finishInitial();
        await vi.waitFor(() => expect(task).toHaveBeenCalledOnce());

        rejectFirst?.();
        await vi.waitFor(() => expect(task).toHaveBeenCalledTimes(2));
        expect(onFailure).toHaveBeenCalledOnce();

        registration.dispose();
        client.fire(running);
        await Promise.resolve();
        expect(task).toHaveBeenCalledTimes(2);
    });

    test('discards a queued restart when the initial task fails', async () => {
        const initialError = new Error('initial task failed');
        const initialTask = Promise.reject(initialError);
        const client = new TestStateSource<number>();
        const task = vi.fn().mockResolvedValue(undefined);
        const onFailure = vi.fn();
        const registration = registerLanguageClientRestartTask(client, running, task, onFailure, initialTask);

        client.fire(running);
        await expect(initialTask).rejects.toBe(initialError);
        await Promise.resolve();

        expect(task).not.toHaveBeenCalled();
        expect(onFailure).not.toHaveBeenCalled();
        registration.dispose();
    });

    test('does not stop the client when its initial start fails', async () => {
        const startError = new Error('startup failed');
        const client = new TestStartableClient(stopped);
        client.start.mockRejectedValueOnce(startError);

        await expect(startLanguageClientAndRunTask(
            client,
            starting,
            running,
            vi.fn(),
            vi.fn(),
        )).rejects.toBe(startError);

        expect(client.stop).not.toHaveBeenCalled();
    });

    test('waits for a starting client before deactivation stops it', async () => {
        let finishStart!: () => void;
        const start = new Promise<void>(resolve => {
            finishStart = resolve;
        });
        const client = new TestStartableClient(starting);
        client.start.mockReturnValueOnce(start);

        const deactivation = stopLanguageClientWhenReady(client, starting, running);
        await Promise.resolve();
        expect(client.stop).not.toHaveBeenCalled();

        client.state = running;
        finishStart();
        await deactivation;

        expect(client.start).toHaveBeenCalledOnce();
        expect(client.stop).toHaveBeenCalledOnce();
    });

    test('waits for a concurrent restart before stopping after activation fails', async () => {
        const activationError = new Error('activation failed');
        const stopError = new Error('stop failed');
        let rejectActivation!: (error: Error) => void;
        const activationTask = new Promise<void>((_, reject) => {
            rejectActivation = reject;
        });
        let finishRestart!: () => void;
        const restart = new Promise<void>(resolve => {
            finishRestart = resolve;
        });
        const task = vi.fn(() => activationTask);
        const onStopFailure = vi.fn(() => {
            throw new Error('reporting failed');
        });
        const client = new TestStartableClient(running);
        client.start.mockResolvedValueOnce(undefined).mockReturnValueOnce(restart);
        client.stop.mockRejectedValueOnce(stopError);

        const activation = startLanguageClientAndRunTask(client, starting, running, task, onStopFailure);
        await vi.waitFor(() => expect(task).toHaveBeenCalledOnce());
        client.state = starting;
        rejectActivation(activationError);
        await Promise.resolve();
        expect(client.start).toHaveBeenCalledTimes(2);
        expect(client.stop).not.toHaveBeenCalled();

        client.state = running;
        await Promise.resolve();
        expect(client.stop).not.toHaveBeenCalled();

        finishRestart();
        await expect(activation).rejects.toBe(activationError);
        expect(client.stop).toHaveBeenCalledOnce();
        expect(onStopFailure).toHaveBeenCalledWith(stopError);
    });
});

class TestStateSource<TState> {
    private readonly listeners = new Set<(event: LanguageClientStateChange<TState>) => unknown>();

    onDidChangeState(listener: (event: LanguageClientStateChange<TState>) => unknown) {
        this.listeners.add(listener);
        return {
            dispose: () => this.listeners.delete(listener),
        };
    }

    fire(newState: TState): void {
        for (const listener of this.listeners) {
            listener({ newState });
        }
    }
}

class TestStartableClient {
    state: number;
    readonly start = vi.fn(() => Promise.resolve());
    readonly stop = vi.fn(() => Promise.resolve());

    constructor(state: number) {
        this.state = state;
    }
}
