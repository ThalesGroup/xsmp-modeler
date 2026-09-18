import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
    createXsmpProject,
    XsmpProjectCreationError,
    type XsmpProjectScaffoldBackend,
} from '@xsmp/core';

let tempDir: string;

beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-project-creator-'));
});

afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('XSMP project creator', () => {
    test('creates the project and returns generated files and dependencies', async () => {
        const projectDir = path.join(tempDir, 'mission-demo');
        const backend: XsmpProjectScaffoldBackend = {
            scaffoldProject: vi.fn(async request => {
                expect(request.projectDir).toBe(projectDir);
                await fs.promises.writeFile(path.join(request.projectDir, 'generated.txt'), 'generated');
                return {
                    dependencies: ['zeta', 'Alpha', 'Alpha'],
                    failures: [],
                };
            }),
        };

        const result = await createXsmpProject({
            projectName: 'mission-demo',
            projectDir,
            profile: { id: 'xsmp-sdk', label: 'XSMP SDK' },
            tools: [
                { id: 'smp', label: 'SMP' },
                { id: 'python', label: 'Python' },
            ],
            promptValues: { 'python.enableTests': true },
        }, backend);

        expect(result).toEqual({
            projectDir,
            dependencies: ['zeta', 'Alpha', 'Alpha'],
            failures: [],
        });
        expect(fs.readFileSync(path.join(projectDir, 'generated.txt'), 'utf-8')).toBe('generated');
        expect(fs.readFileSync(path.join(projectDir, 'smdl', 'mission-demo.xsmpcat'), 'utf-8'))
            .toContain('catalogue mission_demo');

        const projectContent = fs.readFileSync(path.join(projectDir, 'xsmp.project'), 'utf-8');
        expect(projectContent).toContain("profile 'xsmp-sdk'");
        expect(projectContent).toContain("tool 'smp'");
        expect(projectContent).toContain("tool 'python'");
        expect(projectContent.match(/dependency 'Alpha'/g)).toHaveLength(1);
        expect(projectContent.indexOf("dependency 'Alpha'")).toBeLessThan(projectContent.indexOf("dependency 'zeta'"));
        expect(fs.readdirSync(tempDir)).toEqual(['mission-demo']);
    });

    test('refuses an existing target without changing it or invoking scaffolders', async () => {
        const projectDir = path.join(tempDir, 'existing');
        fs.mkdirSync(projectDir);
        fs.writeFileSync(path.join(projectDir, 'keep.txt'), 'keep');
        const backend: XsmpProjectScaffoldBackend = {
            scaffoldProject: vi.fn(),
        };

        await expect(createXsmpProject({
            projectName: 'existing',
            projectDir,
            tools: [],
        }, backend)).rejects.toMatchObject({
            name: 'XsmpProjectCreationError',
            code: 'TARGET_EXISTS',
        });

        expect(backend.scaffoldProject).not.toHaveBeenCalled();
        expect(fs.readFileSync(path.join(projectDir, 'keep.txt'), 'utf-8')).toBe('keep');
        expect(fs.readdirSync(tempDir)).toEqual(['existing']);
    });

    test('rolls back the project directory when a scaffolder reports a failure', async () => {
        const projectDir = path.join(tempDir, 'broken');
        const failures = [{ contributionId: 'python', message: 'Could not generate package.' }];
        const backend: XsmpProjectScaffoldBackend = {
            scaffoldProject: async request => {
                await fs.promises.writeFile(path.join(request.projectDir, 'partial.txt'), 'partial');
                return { dependencies: [], failures };
            },
        };

        try {
            await createXsmpProject({
                projectName: 'broken',
                projectDir,
                tools: [{ id: 'python', label: 'Python' }],
            }, backend);
            expect.unreachable('Project creation should have failed.');
        } catch (error) {
            expect(error).toBeInstanceOf(XsmpProjectCreationError);
            expect(error).toMatchObject({
                code: 'SCAFFOLD_FAILED',
                failures,
            });
        }

        expect(fs.existsSync(projectDir)).toBe(false);
        expect(fs.readdirSync(tempDir)).toEqual([]);
    });

    test('rolls back the project directory when the scaffold backend rejects', async () => {
        const projectDir = path.join(tempDir, 'rejected');

        await expect(createXsmpProject({
            projectName: 'rejected',
            projectDir,
            tools: [],
        }, {
            scaffoldProject: async request => {
                await fs.promises.writeFile(path.join(request.projectDir, 'partial.txt'), 'partial');
                throw new Error('Backend unavailable.');
            },
        })).rejects.toMatchObject({
            name: 'XsmpProjectCreationError',
            code: 'SCAFFOLD_FAILED',
        });

        expect(fs.existsSync(projectDir)).toBe(false);
        expect(fs.readdirSync(tempDir)).toEqual([]);
    });

    test('reports when an incomplete project cannot be removed', async () => {
        const projectDir = path.join(tempDir, 'locked');
        const remove = vi.spyOn(fs.promises, 'rm').mockRejectedValueOnce(new Error('directory is locked'));

        await expect(createXsmpProject({
            projectName: 'locked',
            projectDir,
            tools: [],
        }, {
            scaffoldProject: async () => {
                throw new Error('Backend unavailable.');
            },
        })).rejects.toMatchObject({
            name: 'XsmpProjectCreationError',
            code: 'IO_ERROR',
            message: expect.stringMatching(/incomplete project folder.*could not be removed.*directory is locked/i),
        });

        expect(remove).toHaveBeenCalledWith(projectDir, { recursive: true, force: true });
        expect(fs.existsSync(projectDir)).toBe(true);
    });

    test('can publish scaffold failures for the wizard compatibility mode', async () => {
        const projectDir = path.join(tempDir, 'warning');
        const failures = [{ contributionId: 'docs', message: 'Documentation is unavailable.' }];

        const result = await createXsmpProject({
            projectName: 'warning',
            projectDir,
            tools: [],
            failOnScaffoldError: false,
        }, {
            scaffoldProject: async () => ({ dependencies: [], failures }),
        });

        expect(result.failures).toEqual(failures);
        expect(fs.existsSync(path.join(projectDir, 'xsmp.project'))).toBe(true);
    });
});
