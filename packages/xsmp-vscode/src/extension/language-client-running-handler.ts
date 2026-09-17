export interface LanguageClientStateChange<TState> {
    newState: TState;
}

export interface DisposableLike {
    dispose(): unknown;
}

export interface LanguageClientStateSource<TState> {
    onDidChangeState(listener: (event: LanguageClientStateChange<TState>) => unknown): DisposableLike;
}

export interface StartableLanguageClient<TState> {
    readonly state: TState;
    start(): Promise<void>;
    stop(): Promise<void>;
}

export async function stopLanguageClientWhenReady<TState>(
    client: StartableLanguageClient<TState>,
    startingState: TState,
    runningState: TState,
): Promise<void> {
    while (client.state === startingState || client.state === runningState) {
        // start() returns the current startup promise while the client is already active.
        await client.start().catch(() => undefined);
        if (client.state === runningState) {
            await client.stop();
            return;
        }
    }
}

/**
 * Starts a client, runs its activation task and waits for any concurrent restart before cleanup.
 */
export async function startLanguageClientAndRunTask<TState>(
    client: StartableLanguageClient<TState>,
    startingState: TState,
    runningState: TState,
    task: () => Promise<void>,
    onStopFailure: (error: unknown) => void,
): Promise<void> {
    try {
        await client.start();
        await task();
    } catch (error) {
        try {
            await stopLanguageClientWhenReady(client, startingState, runningState);
        } catch (stopError) {
            try {
                onStopFailure(stopError);
            } catch {
                // Failure reporting must not replace the activation error.
            }
        }
        throw error;
    }
}

/**
 * Runs serialized recovery work whenever an already-started language client reaches Running again.
 */
export function registerLanguageClientRestartTask<TState>(
    client: LanguageClientStateSource<TState>,
    runningState: TState,
    task: () => Promise<void>,
    onFailure: (error: unknown) => void,
    initialTask: Promise<void> = Promise.resolve(),
): DisposableLike {
    let active = true;
    let taskQueue = initialTask.then(
        () => undefined,
        () => { active = false; },
    );

    const registration = client.onDidChangeState(event => {
        if (event.newState !== runningState) {
            return;
        }
        taskQueue = taskQueue.then(() => active ? task() : undefined).catch(error => {
            try {
                onFailure(error);
            } catch {
                // Failure reporting must not prevent recovery after the next restart.
            }
        });
    });
    return {
        dispose: () => {
            active = false;
            registration.dispose();
        },
    };
}
