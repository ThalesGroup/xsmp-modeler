import { Cancellation, DefaultWorkspaceLock, DocumentState, interruptAndCheck, OperationCancelled, stream, URI } from 'langium';
import type { LangiumDocument, MaybePromise, WorkspaceLock } from 'langium';
import { describe, expect, test } from 'vitest';
import type { XsmpRegisteredContribution } from '../../src/contributions/xsmp-extension-types.js';
import type * as ast from '../../src/generated/ast-partial.js';
import type { XsmpGenerator } from '../../src/generator/generator.js';
import { XsmpDocumentGenerator } from '../../src/workspace/document-generator.js';
import type { XsmpSharedServices } from '../../src/xsmp-module.js';

interface Deferred {
    readonly promise: Promise<void>;
    resolve(): void;
}

class ConcurrentReadWorkspaceLock implements WorkspaceLock {
    async write(action: (token: Cancellation.CancellationToken) => MaybePromise<void>): Promise<void> {
        await action(Cancellation.CancellationToken.None);
    }

    async read<T>(action: () => MaybePromise<T>): Promise<T> {
        return await action();
    }

    cancelWrite(): void {
        // No queued writes to cancel in this test lock.
    }
}

class ControlledDocumentGenerator extends XsmpDocumentGenerator {
    private readonly operation: (project: ast.Project) => Promise<void>;
    private readonly currentProjects: readonly ast.Project[];

    constructor(
        services: XsmpSharedServices,
        operation: (project: ast.Project) => Promise<void>,
        currentProjects: readonly ast.Project[],
    ) {
        super(services);
        this.operation = operation;
        this.currentProjects = currentProjects;
    }

    protected override async doGenerateProject(
        project: ast.Project,
        _cancelToken: Cancellation.CancellationToken,
    ): Promise<void> {
        await this.operation(project);
    }

    protected override getCurrentProject(uri: URI): ast.Project | undefined {
        return this.currentProjects.find(project => project.$document?.uri.toString() === uri.toString());
    }

    protected override getProjectErrorCount(_project: ast.Project): number {
        return 0;
    }
}

class TaskDocumentGenerator extends XsmpDocumentGenerator {
    private readonly currentProject: ast.Project;
    private readonly contribution: XsmpRegisteredContribution;

    constructor(
        services: XsmpSharedServices,
        currentProject: ast.Project,
        contribution: XsmpRegisteredContribution,
    ) {
        super(services);
        this.currentProject = currentProject;
        this.contribution = contribution;
    }

    protected override getCurrentProject(uri: URI): ast.Project | undefined {
        return this.currentProject.$document?.uri.toString() === uri.toString()
            ? this.currentProject
            : undefined;
    }

    protected override getActiveContributions(_project: ast.Project): XsmpRegisteredContribution[] {
        return [this.contribution];
    }
}

describe('XsmpDocumentGenerator concurrency', () => {
    test('serializes concurrent project generations while the first generation is pending', async () => {
        const firstStarted = deferred();
        const releaseFirst = deferred();
        const events: string[] = [];
        const firstProject = documentedProject('first');
        const secondProject = documentedProject('second');
        const generator = createGenerator(new ConcurrentReadWorkspaceLock(), async project => {
            events.push(`${project.name}:start`);
            if (project.name === 'first') {
                firstStarted.resolve();
                await releaseFirst.promise;
            }
            events.push(`${project.name}:end`);
        }, { currentProjects: [firstProject, secondProject] });

        const first = generator.generateProject(firstProject, Cancellation.CancellationToken.None);
        await Promise.race([firstStarted.promise, first]);
        const second = generator.generateProject(secondProject, Cancellation.CancellationToken.None);
        try {
            await nextTurn();
            expect(events).toEqual(['first:start']);
        } finally {
            releaseFirst.resolve();
            await Promise.all([first, second]);
        }
        expect(events).toEqual([
            'first:start',
            'first:end',
            'second:start',
            'second:end',
        ]);
    });

    test('holds a workspace read lock until project generation has finished', async () => {
        const workspaceLock = new DefaultWorkspaceLock();
        const generationStarted = deferred();
        const releaseGeneration = deferred();
        const events: string[] = [];
        const currentProject = documentedProject('project');
        const generator = createGenerator(workspaceLock, async () => {
            events.push('generation:start');
            generationStarted.resolve();
            await releaseGeneration.promise;
            events.push('generation:end');
        }, { currentProjects: [currentProject] });

        const generation = generator.generateProject(currentProject, Cancellation.CancellationToken.None);
        await Promise.race([generationStarted.promise, generation]);
        const write = workspaceLock.write(() => {
            events.push('write:start');
        });
        try {
            await nextTurn();
            expect(events).toEqual(['generation:start']);
        } finally {
            releaseGeneration.resolve();
            await Promise.all([generation, write]);
        }
        expect(events).toEqual([
            'generation:start',
            'generation:end',
            'write:start',
        ]);
    });

    test('drains pending generation tasks before rejecting and releasing the read lock', async () => {
        const workspaceLock = new DefaultWorkspaceLock();
        const slowTaskStarted = deferred();
        const failureRaised = deferred();
        const releaseSlowTask = deferred();
        const events: string[] = [];
        const taskError = new Error('generation task failed');
        const currentProject = documentedProject('task-drain');
        const fileGenerator: XsmpGenerator = {
            clean: () => undefined,
            generate: (_node, _projectUri, acceptTask) => {
                acceptTask(async () => {
                    await slowTaskStarted.promise;
                    events.push('task:failure');
                    failureRaised.resolve();
                    throw taskError;
                });
                acceptTask(async () => {
                    events.push('task:slow:start');
                    slowTaskStarted.resolve();
                    await releaseSlowTask.promise;
                    events.push('task:slow:end');
                });
            },
        };
        const generator = createTaskGenerator(workspaceLock, currentProject, fileGenerator);

        let generationSettled = false;
        const generationResult = generator
            .generateProject(currentProject, Cancellation.CancellationToken.None)
            .then(
                () => ({ status: 'fulfilled' as const }),
                (error: unknown) => ({ status: 'rejected' as const, error }),
            )
            .finally(() => {
                generationSettled = true;
                events.push('generation:settled');
            });
        await Promise.race([failureRaised.promise, generationResult]);
        const write = workspaceLock.write(() => {
            events.push('write:start');
        });

        try {
            await nextTurn();
            expect(generationSettled).toBe(false);
            expect(events).toEqual([
                'task:slow:start',
                'task:failure',
            ]);
        } finally {
            releaseSlowTask.resolve();
            await Promise.all([generationResult, write]);
        }

        expect(await generationResult).toEqual({ status: 'rejected', error: taskError });
        const slowTaskEnd = events.indexOf('task:slow:end');
        expect(slowTaskEnd).toBeGreaterThan(-1);
        expect(events.indexOf('generation:settled')).toBeGreaterThan(slowTaskEnd);
        expect(events.indexOf('write:start')).toBeGreaterThan(slowTaskEnd);
    });

    test('finishes an atomic rebuild and a queued workspace write before generating', async () => {
        const workspaceLock = new DefaultWorkspaceLock();
        const buildStarted = deferred();
        const releaseBuild = deferred();
        const writeStarted = deferred();
        const releaseWrite = deferred();
        const events: string[] = [];
        let buildToken: Cancellation.CancellationToken | undefined;
        const currentProject = documentedProject('project');
        const generator = createGenerator(
            workspaceLock,
            async () => {
                events.push('generation:start');
            },
            {
                currentProjects: [currentProject],
                build: async token => {
                    buildToken = token;
                    events.push('build:start');
                    buildStarted.resolve();
                    await releaseBuild.promise;
                    await interruptAndCheck(token);
                    events.push('build:end');
                },
            },
        );

        const generation = generator.generateValidatedProject(
            currentProject,
            Cancellation.CancellationToken.None,
        );
        await Promise.race([buildStarted.promise, generation]);
        const write = workspaceLock.write(async () => {
            events.push('write:start');
            writeStarted.resolve();
            await releaseWrite.promise;
            events.push('write:end');
        });

        try {
            await nextTurn();
            expect(buildToken?.isCancellationRequested).toBe(false);
            expect(events).toEqual(['build:start']);

            releaseBuild.resolve();
            await writeStarted.promise;
            await nextTurn();
            expect(events).toEqual([
                'build:start',
                'build:end',
                'write:start',
            ]);
        } finally {
            releaseBuild.resolve();
            releaseWrite.resolve();
            await Promise.all([generation, write]);
        }

        expect(events).toEqual([
            'build:start',
            'build:end',
            'write:start',
            'write:end',
            'generation:start',
        ]);
    });

    test('propagates cancellation swallowed by the workspace read lock', async () => {
        const generationStarted = deferred();
        const releaseGeneration = deferred();
        const cancellation = new Cancellation.CancellationTokenSource();
        const currentProject = documentedProject('cancelled');
        const generator = createGenerator(new DefaultWorkspaceLock(), async () => {
            generationStarted.resolve();
            await releaseGeneration.promise;
            await interruptAndCheck(cancellation.token);
        }, { currentProjects: [currentProject] });

        const generation = generator.generateValidatedProject(currentProject, cancellation.token);
        await generationStarted.promise;
        cancellation.cancel();
        releaseGeneration.resolve();

        await expect(generation).rejects.toBe(OperationCancelled);
    });
});

interface GeneratorOptions {
    readonly currentProjects?: readonly ast.Project[];
    readonly build?: (token: Cancellation.CancellationToken) => Promise<void>;
}

function createGenerator(
    workspaceLock: WorkspaceLock,
    operation: (project: ast.Project) => Promise<void>,
    options: GeneratorOptions = {},
): ControlledDocumentGenerator {
    const services = {
        ServiceRegistry: undefined,
        ContributionRegistry: undefined,
        SmpMirrorManager: undefined,
        workspace: {
            LangiumDocuments: {
                all: {
                    toArray: () => [],
                },
                getDocument: (uri: URI) => options.currentProjects
                    ?.find(project => project.$document?.uri.toString() === uri.toString())
                    ?.$document,
            },
            ProjectManager: undefined,
            DocumentBuilder: {
                build: async (
                    _documents: unknown,
                    _options: unknown,
                    token: Cancellation.CancellationToken,
                ) => {
                    await options.build?.(token);
                },
            },
            WorkspaceManager: { ready: Promise.resolve() },
            WorkspaceLock: workspaceLock,
        },
    } as unknown as XsmpSharedServices;
    return new ControlledDocumentGenerator(services, operation, options.currentProjects ?? []);
}

function createTaskGenerator(
    workspaceLock: WorkspaceLock,
    currentProject: ast.Project,
    fileGenerator: XsmpGenerator,
): TaskDocumentGenerator {
    const services = {
        ServiceRegistry: undefined,
        ContributionRegistry: undefined,
        SmpMirrorManager: undefined,
        workspace: {
            LangiumDocuments: {
                all: stream([currentProject.$document!]),
                getDocument: () => currentProject.$document,
            },
            ProjectManager: {
                getProject: () => currentProject,
            },
            DocumentBuilder: undefined,
            WorkspaceManager: { ready: Promise.resolve() },
            WorkspaceLock: workspaceLock,
        },
    } as unknown as XsmpSharedServices;
    const contribution = {
        generators: [fileGenerator],
    } as XsmpRegisteredContribution;
    return new TaskDocumentGenerator(services, currentProject, contribution);
}

function project(name: string): ast.Project {
    return {
        $type: 'Project',
        elements: [],
        name,
    };
}

function documentedProject(name: string): ast.Project {
    const result = project(name);
    result.$document = {
        uri: URI.file(`/workspace/${name}.xsmpproject`),
        state: DocumentState.Validated,
        parseResult: {
            value: result,
            lexerErrors: [],
            parserErrors: [],
        },
        diagnostics: [],
    } as unknown as LangiumDocument;
    return result;
}

function deferred(): Deferred {
    let resolve!: () => void;
    const promise = new Promise<void>(promiseResolve => {
        resolve = promiseResolve;
    });
    return { promise, resolve };
}

async function nextTurn(): Promise<void> {
    await new Promise<void>(resolve => setImmediate(resolve));
}
