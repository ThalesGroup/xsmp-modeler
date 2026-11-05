import { Cancellation, DefaultWorkspaceLock, DocumentState, interruptAndCheck, OperationCancelled, stream, URI } from 'langium';
import type { LangiumDocument, MaybePromise, WorkspaceLock } from 'langium';
import { describe, expect, test, vi } from 'vitest';
import type { XsmpRegisteredContribution } from '../../src/contributions/xsmp-extension-types.js';
import type * as ast from '../../src/generated/ast-partial.js';
import type { XsmpGenerator } from '../../src/generator/generator.js';
import type { GeneratedFiles } from '../../src/generator/generated-files.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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
    private readonly contributions: XsmpRegisteredContribution[];

    constructor(
        services: XsmpSharedServices,
        currentProject: ast.Project,
        contributions: XsmpRegisteredContribution[],
    ) {
        super(services);
        this.currentProject = currentProject;
        this.contributions = contributions;
    }

    protected override getCurrentProject(uri: URI): ast.Project | undefined {
        return this.currentProject.$document?.uri.toString() === uri.toString()
            ? this.currentProject
            : undefined;
    }

    protected override getActiveContributions(_project: ast.Project): XsmpRegisteredContribution[] {
        return this.contributions;
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
            id: 'test',
            prepare: context => context.createFiles({}),
            generate: (_node, { acceptTask }) => {
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

describe('XsmpDocumentGenerator output lifecycle', () => {
    test('rejects task submissions after document traversal has finished', async () => {
        const project = documentedProject('late-task');
        const lateTask = vi.fn(async () => undefined);
        const fileGenerator: XsmpGenerator = {
            id: 'test',
            prepare: context => context.createFiles({}),
            generate: (_node, { acceptTask }) => {
                acceptTask(async () => { acceptTask(lateTask); });
            },
        };
        await expect(createTaskGenerator(new DefaultWorkspaceLock(), project, fileGenerator)
            .generateProject(project, Cancellation.CancellationToken.None)).rejects.toThrow('task collection has finished');
        expect(lateTask).not.toHaveBeenCalled();
    });

    test('prepares every contribution and retains their shared outputs until all tasks finish', async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-shared-generation-'));
        const stale = path.join(directory, 'previous.cpp');
        const firstFile = path.join(directory, 'first.cpp');
        const secondFile = path.join(directory, 'second.cpp');
        fs.writeFileSync(stale, 'previous');
        const project = documentedProject('shared', path.dirname(directory));
        const slowTaskStarted = deferred();
        const releaseSlowTask = deferred();
        const events: string[] = [];
        let firstOutput: GeneratedFiles;
        let secondOutput: GeneratedFiles;
        let firstRun = true;
        const first: XsmpGenerator = {
            id: 'test',
            prepare: context => {
                events.push('first:prepare');
                return firstOutput = context.createFiles({ generated: { directory: path.basename(directory), writeMode: 'if-changed', cleanup: 'directory' } });
            },
            generate: (_node, { acceptTask: accept }) => {
                events.push('first:generate');
                if (firstRun) accept(() => firstOutput.write('generated', 'first.cpp', 'first'));
            },
        };
        const second: XsmpGenerator = {
            id: 'test',
            prepare: context => {
                events.push('second:prepare');
                return secondOutput = context.createFiles({ generated: { directory: path.basename(directory), writeMode: 'if-changed', cleanup: 'directory' } });
            },
            generate: (_node, { acceptTask: accept }) => {
                events.push('second:generate');
                accept(async () => {
                    slowTaskStarted.resolve();
                    await releaseSlowTask.promise;
                    await secondOutput.write('generated', 'second.cpp', 'second');
                });
            },
        };
        const generator = createTaskGenerator(new DefaultWorkspaceLock(), project, first, second);
        const generation = generator.generateProject(project, Cancellation.CancellationToken.None);
        try {
            await Promise.race([slowTaskStarted.promise, generation]);
            expect(events).toEqual(['first:prepare', 'second:prepare', 'first:generate', 'second:generate']);
            expect(fs.readFileSync(stale, 'utf8')).toBe('previous');
            releaseSlowTask.resolve();
            await generation;
            expect(fs.readdirSync(directory)).toEqual(['first.cpp', 'second.cpp']);
            expect(fs.readFileSync(firstFile, 'utf8')).toBe('first');
            expect(fs.readFileSync(secondFile, 'utf8')).toBe('second');

            // A fresh manifest is used for each run, so an omitted output becomes stale.
            firstRun = false;
            events.length = 0;
            await generator.generateProject(project, Cancellation.CancellationToken.None);
            expect(events).toEqual(['first:prepare', 'second:prepare', 'first:generate', 'second:generate']);
            expect(fs.readdirSync(directory)).toEqual(['second.cpp']);
        } finally {
            releaseSlowTask.resolve();
            await generation;
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });

    test.each(['failure', 'cancellation'])('preserves stale outputs after %s and cleans them after recovery', async outcome => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-generation-recovery-'));
        const stale = path.join(directory, 'previous.cpp');
        fs.writeFileSync(stale, 'previous');
        const cancellation = new Cancellation.CancellationTokenSource();
        const taskError = new Error('generation failed');
        const currentProject = documentedProject('recovery', path.dirname(directory));
        let output: GeneratedFiles;
        let fail = true;
        const fileGenerator: XsmpGenerator = {
            id: 'test',
            prepare: context => output = context.createFiles({ generated: { directory: path.basename(directory), writeMode: 'if-changed', cleanup: 'directory' } }),
            generate: (_node, { acceptTask }) => acceptTask(async () => {
                await output.write('generated', 'current.cpp', 'current');
                if (fail && outcome === 'failure') {
                    throw taskError;
                }
                if (fail) {
                    cancellation.cancel();
                }
            }),
        };
        try {
            const generator = createTaskGenerator(new DefaultWorkspaceLock(), currentProject, fileGenerator);
            await expect(generator.generateProject(currentProject, cancellation.token))
                .rejects.toBe(outcome === 'failure' ? taskError : OperationCancelled);
            expect(fs.readFileSync(stale, 'utf8')).toBe('previous');
            expect(fs.readFileSync(path.join(directory, 'current.cpp'), 'utf8')).toBe('current');
            fail = false;
            await generator.generateProject(currentProject, Cancellation.CancellationToken.None);
            expect(fs.existsSync(stale)).toBe(false);
        } finally {
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });

    test('keeps generated files and reports a locked stale file after every contribution finishes', async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-locked-generation-'));
        const stale = path.join(directory, 'previous.cpp');
        fs.writeFileSync(stale, 'previous');
        const removalError = Object.assign(new Error('EBUSY: file locked'), { code: 'EBUSY' });
        const project = documentedProject('locked-outputs', path.dirname(directory));
        let outputs: GeneratedFiles;
        const fileGenerator: XsmpGenerator = {
            id: 'test',
            prepare: context => outputs = context.createFiles({ generated: { directory: path.basename(directory), writeMode: 'if-changed', cleanup: 'directory' } }),
            generate: (_node, { acceptTask }) => {
                acceptTask(() => outputs.write('generated', 'current.cpp', 'current'));
            },
        };
        const rm = vi.spyOn(fs.promises, 'rm').mockRejectedValue(removalError);
        try {
            await expect(createTaskGenerator(new DefaultWorkspaceLock(), project, fileGenerator)
                .generateProject(project, Cancellation.CancellationToken.None)).rejects.toBe(removalError);
            expect(fs.readFileSync(path.join(directory, 'current.cpp'), 'utf8')).toBe('current');
            expect(fs.readFileSync(stale, 'utf8')).toBe('previous');
            expect(rm).toHaveBeenCalledWith(URI.file(stale).fsPath, { force: true });
        } finally {
            rm.mockRestore();
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });

    test('does not generate or remove outputs when a contribution cannot prepare', async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-prepare-failure-'));
        const stale = path.join(directory, 'previous.cpp');
        fs.writeFileSync(stale, 'previous');
        const failure = new Error('Cannot prepare generation');
        const project = documentedProject('prepare-failure', path.dirname(directory));
        const generate = vi.fn();
        try {
            await expect(createTaskGenerator(new DefaultWorkspaceLock(), project, {
                id: 'test',
                prepare: context => context.createFiles({ generated: { directory: path.basename(directory), writeMode: 'if-changed', cleanup: 'directory' } }),
                generate,
            }, {
                id: 'test',
                prepare: () => { throw failure; },
                generate,
            }).generateProject(project, Cancellation.CancellationToken.None)).rejects.toBe(failure);
            expect(generate).not.toHaveBeenCalled();
            expect(fs.readFileSync(stale, 'utf8')).toBe('previous');
        } finally {
            fs.rmSync(directory, { recursive: true, force: true });
        }
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
    ...fileGenerators: XsmpGenerator[]
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
    const contributions = fileGenerators.map((fileGenerator, index) => ({
        kind: 'tool',
        id: `tool-${index + 1}`,
        generators: [fileGenerator],
    }) as unknown as XsmpRegisteredContribution);
    return new TaskDocumentGenerator(services, currentProject, contributions);
}

function project(name: string): ast.Project {
    return {
        $type: 'Project',
        elements: [],
        name,
    };
}

function documentedProject(name: string, directory = '/workspace'): ast.Project {
    const result = project(name);
    result.$document = {
        uri: URI.file(path.join(directory, `${name}.xsmpproject`)),
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
