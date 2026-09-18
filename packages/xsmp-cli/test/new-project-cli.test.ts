import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCli } from '@xsmp/cli';
import { cliBuiltinContributionPackages } from '../src/builtin-packages.js';

interface TestPromptChoice {
    readonly value: string;
    readonly label?: string;
}

interface TestPromptRequest {
    readonly type: 'input' | 'confirm' | 'select' | 'multiselect';
    readonly message: string;
    readonly choices?: readonly TestPromptChoice[];
    readonly defaultValue?: string | boolean | readonly string[];
}

type TestPrompt = (
    request: TestPromptRequest,
) => Promise<string | boolean | readonly string[] | undefined>;

interface TestIoOverrides {
    readonly isInteractive?: boolean;
    readonly prompt?: TestPrompt;
}

let tempDir: string;

beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-cli-new-project-'));
});

afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('XSMP CLI new project', () => {
    test('creates a complete project in scriptable mode', async () => {
        const result = await runCliWithOutput([
            'new',
            'project',
            'Mission',
            tempDir,
            '--profile',
            'xsmp-sdk',
            '--tool',
            'smp',
            '--tool',
            'python',
            '--no-interactive',
        ]);

        const projectDir = path.join(tempDir, 'Mission');
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
        expect(result.stdout).toContain(projectDir);

        const projectFile = fs.readFileSync(path.join(projectDir, 'xsmp.project'), 'utf-8');
        expect(projectFile).toContain("project 'Mission'");
        expect(projectFile).toContain("profile 'xsmp-sdk'");
        expect(projectFile).toContain("tool 'smp'");
        expect(projectFile).toContain("tool 'python'");
        expect(projectFile.match(/tool 'smp'/g)).toHaveLength(1);
        expect(projectFile.match(/tool 'python'/g)).toHaveLength(1);

        const catalogue = fs.readFileSync(path.join(projectDir, 'smdl', 'Mission.xsmpcat'), 'utf-8');
        expect(catalogue).toContain('catalogue Mission');
        expect(fs.existsSync(path.join(projectDir, 'CMakeLists.txt'))).toBe(true);
        expect(fs.existsSync(path.join(projectDir, 'README.md'))).toBe(true);
        expect(fs.existsSync(path.join(projectDir, 'pytest.ini'))).toBe(true);
        expect(fs.existsSync(path.join(projectDir, 'python', 'Mission', 'test_Mission.py'))).toBe(true);
    });

    test('prompts for missing values in interactive mode', async () => {
        vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
        const inputAnswers = ['interactive-app', tempDir];
        const prompt = vi.fn(async (request: TestPromptRequest) => {
            switch (request.type) {
                case 'input':
                    return inputAnswers.shift();
                case 'select':
                    expect(request.choices).toEqual(expect.arrayContaining([
                        expect.objectContaining({ value: 'xsmp-sdk' }),
                    ]));
                    return 'xsmp-sdk';
                case 'multiselect':
                    expect(request.choices).toEqual(expect.arrayContaining([
                        expect.objectContaining({ value: 'smp' }),
                        expect.objectContaining({ value: 'python' }),
                    ]));
                    return ['smp', 'python'];
                case 'confirm':
                    return true;
            }
        });

        const result = await runCliWithOutput(['new', 'project'], {
            isInteractive: true,
            prompt,
        });

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
        const promptTypes = prompt.mock.calls.map(([request]) => request.type);
        expect(promptTypes.filter(type => type === 'input')).toHaveLength(2);
        expect(promptTypes).toEqual(expect.arrayContaining(['select', 'multiselect', 'confirm']));

        const projectFile = fs.readFileSync(
            path.join(tempDir, 'interactive-app', 'xsmp.project'),
            'utf-8',
        );
        expect(projectFile).toContain("profile 'xsmp-sdk'");
        expect(projectFile).toContain("tool 'smp'");
        expect(projectFile).toContain("tool 'python'");
    });

    test('allows an interactive project without a profile or tools', async () => {
        const prompt = vi.fn(async (request: TestPromptRequest) => {
            switch (request.type) {
                case 'select':
                    return request.choices?.find(choice => choice.label === 'No profile')?.value;
                case 'multiselect':
                    return [];
                case 'confirm':
                    return true;
                case 'input':
                    return request.defaultValue;
            }
        });

        const result = await runCliWithOutput([
            'new',
            'project',
            'minimal-interactive-app',
            tempDir,
        ], {
            isInteractive: true,
            prompt,
        });

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
        const projectFile = fs.readFileSync(
            path.join(tempDir, 'minimal-interactive-app', 'xsmp.project'),
            'utf-8',
        );
        expect(projectFile).not.toContain("profile '");
        expect(projectFile).not.toContain("tool '");
    });

    test('prompts again after an empty project name', async () => {
        vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
        const projectNames = ['', 'valid-app'];
        const prompt = vi.fn(async (request: TestPromptRequest) => {
            switch (request.type) {
                case 'input':
                    return request.message === 'Project name'
                        ? projectNames.shift()
                        : request.defaultValue;
                case 'select':
                case 'multiselect':
                    return request.defaultValue;
                case 'confirm':
                    return true;
            }
        });

        const result = await runCliWithOutput(['new', 'project'], {
            isInteractive: true,
            prompt,
        });

        expect(result.exitCode).toBe(0);
        expect(prompt.mock.calls.filter(([request]) => request.message === 'Project name')).toHaveLength(2);
        expect(result.stderr).toMatch(/project name must follow/i);
        expect(fs.existsSync(path.join(tempDir, 'valid-app', 'xsmp.project'))).toBe(true);
    });

    test('cancels an interactive creation before writing anything', async () => {
        const prompt = vi.fn(async (request: TestPromptRequest) => {
            if (request.type === 'multiselect') {
                return [];
            }
            if (request.type === 'confirm') {
                return false;
            }
            throw new Error(`Unexpected ${request.type} prompt.`);
        });

        const result = await runCliWithOutput([
            'new',
            'project',
            'cancelled-app',
            tempDir,
            '--profile',
            'xsmp-sdk',
        ], {
            isInteractive: true,
            prompt,
        });

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
        expect(result.stdout).toMatch(/cancel/i);
        expect(prompt).toHaveBeenCalledTimes(2);
        expect(fs.existsSync(path.join(tempDir, 'cancelled-app'))).toBe(false);
    });

    test('--yes skips every prompt and leaves omitted contributions disabled', async () => {
        const prompt = vi.fn(async () => {
            throw new Error('prompt must not be called with --yes');
        });

        const result = await runCliWithOutput([
            'new',
            'project',
            'accepted-app',
            tempDir,
            '--yes',
        ], {
            isInteractive: true,
            prompt,
        });

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
        expect(prompt).not.toHaveBeenCalled();
        const projectFile = fs.readFileSync(path.join(tempDir, 'accepted-app', 'xsmp.project'), 'utf-8');
        expect(projectFile).not.toContain("profile '");
        expect(projectFile).not.toContain("tool '");
    });

    test('creates a project without omitted contributions outside a TTY', async () => {
        const prompt = vi.fn(async () => {
            throw new Error('prompt must not be called outside a TTY');
        });

        const result = await runCliWithOutput(['new', 'project', 'defaults-app', tempDir], {
            isInteractive: false,
            prompt,
        });

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
        expect(prompt).not.toHaveBeenCalled();
        const projectFile = fs.readFileSync(
            path.join(tempDir, 'defaults-app', 'xsmp.project'),
            'utf-8',
        );
        expect(projectFile).not.toContain("profile '");
        expect(projectFile).not.toContain("tool '");
    });

    test('fails cleanly instead of prompting for a missing name outside a TTY', async () => {
        vi.spyOn(process, 'cwd').mockReturnValue(tempDir);
        const prompt = vi.fn(async () => {
            throw new Error('prompt must not be called outside a TTY');
        });

        const result = await runCliWithOutput(['new', 'project'], {
            isInteractive: false,
            prompt,
        });

        expect(result.exitCode).toBe(2);
        expect(result.stderr).toMatch(/project name.*required/i);
        expect(prompt).not.toHaveBeenCalled();
        expect(fs.readdirSync(tempDir)).toEqual([]);
    });

    test('--no-interactive creates a minimal project even with an interactive IO', async () => {
        const prompt = vi.fn(async () => {
            throw new Error('prompt must not be called with --no-interactive');
        });

        const result = await runCliWithOutput([
            'new',
            'project',
            'minimal-non-interactive-app',
            tempDir,
            '--no-interactive',
        ], {
            isInteractive: true,
            prompt,
        });

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
        expect(prompt).not.toHaveBeenCalled();
        const projectFile = fs.readFileSync(
            path.join(tempDir, 'minimal-non-interactive-app', 'xsmp.project'),
            'utf-8',
        );
        expect(projectFile).not.toContain("profile '");
        expect(projectFile).not.toContain("tool '");
    });

    test.each([
        {
            label: 'unknown profile',
            args: ['--profile', 'missing-profile'],
            expectedWords: ['profile', 'missing-profile'],
        },
        {
            label: 'unknown tool',
            args: ['--tool', 'missing-tool'],
            expectedWords: ['tool', 'missing-tool'],
        },
        {
            label: 'tool used as a profile',
            args: ['--profile', 'python'],
            expectedWords: ['profile', 'python', 'tool'],
        },
        {
            label: 'profile used as a tool',
            args: ['--tool', 'xsmp-sdk'],
            expectedWords: ['tool', 'xsmp-sdk', 'profile'],
        },
    ])('rejects $label', async ({ args, expectedWords }) => {
        const projectName = `invalid-selection-${expectedWords[1]}`;
        const result = await runCliWithOutput([
            'new',
            'project',
            projectName,
            tempDir,
            ...args,
            '--no-interactive',
        ]);

        expect(result.exitCode).toBe(2);
        for (const word of expectedWords) {
            expect(result.stderr.toLowerCase()).toContain(word);
        }
        expect(fs.existsSync(path.join(tempDir, projectName))).toBe(false);
    });

    test('deduplicates repeated tool options while preserving their order', async () => {
        const result = await runCliWithOutput([
            'new',
            'project',
            'deduplicated-tools',
            tempDir,
            '--tool',
            'smp',
            '--tool',
            'python',
            '--tool',
            'smp',
            '--no-interactive',
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
        const projectFile = fs.readFileSync(
            path.join(tempDir, 'deduplicated-tools', 'xsmp.project'),
            'utf-8',
        );
        expect(projectFile.match(/tool 'smp'/g)).toHaveLength(1);
        expect(projectFile.match(/tool 'python'/g)).toHaveLength(1);
        expect(projectFile).not.toContain("profile '");
        expect(projectFile.indexOf("tool 'smp'")).toBeLessThan(projectFile.indexOf("tool 'python'"));
    });

    test('passes repeatable contribution settings to scaffolders', async () => {
        const profilePackage = cliBuiltinContributionPackages.find(
            contributionPackage => contributionPackage.name === '@xsmp/profile-xsmp-sdk',
        );
        expect(profilePackage).toBeDefined();

        const originalRegisterContribution = profilePackage!.registerContribution;
        let receivedValues: Readonly<Record<string, string | boolean>> | undefined;
        vi.spyOn(profilePackage!, 'registerContribution').mockImplementation(async api => {
            await originalRegisterContribution(api);
            api.setWizardPrompts([
                { id: 'moduleName', label: 'Module name', type: 'string' },
                { id: 'generateTests', label: 'Generate tests', type: 'boolean' },
                {
                    id: 'flavor',
                    label: 'Build flavor',
                    type: 'choice',
                    choices: [{ value: 'debug' }, { value: 'release' }],
                },
            ]);
            api.setScaffolder(context => {
                receivedValues = context.promptValues;
            });
        });

        const result = await runCliWithOutput([
            'new',
            'project',
            'settings-app',
            tempDir,
            '--profile',
            'xsmp-sdk',
            '--set',
            'profile.xsmp-sdk.moduleName=Mission',
            '--set',
            'profile.xsmp-sdk.generateTests=false',
            '--set',
            'profile.xsmp-sdk.flavor=release',
            '--no-interactive',
        ]);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
        expect(receivedValues).toEqual({
            'xsmp-sdk.moduleName': 'Mission',
            'xsmp-sdk.generateTests': false,
            'xsmp-sdk.flavor': 'release',
        });
        const projectFile = fs.readFileSync(path.join(tempDir, 'settings-app', 'xsmp.project'), 'utf-8');
        expect(projectFile).toContain("profile 'xsmp-sdk'");
        expect(projectFile).not.toContain("tool '");
    });

    test.each([
        'profile.xsmp-sdk.unselected=value',
        'tool.python.unselected=value',
    ])('rejects a setting for an omitted contribution: %s', async setting => {
        const result = await runCliWithOutput([
            'new',
            'project',
            'unselected-setting',
            tempDir,
            '--set',
            setting,
            '--no-interactive',
        ]);

        expect(result.exitCode).toBe(2);
        expect(result.stderr).toMatch(/not selected/i);
        expect(fs.existsSync(path.join(tempDir, 'unselected-setting'))).toBe(false);
    });

    test('rejects a repeated --profile option', async () => {
        const result = await runCliWithOutput([
            'new',
            'project',
            'conflicting-options',
            tempDir,
            '--profile',
            'xsmp-sdk',
            '--profile',
            'xsmp-sdk',
            '--no-interactive',
        ]);

        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain('profile');
        expect(fs.existsSync(path.join(tempDir, 'conflicting-options'))).toBe(false);
    });

    test.each(['--no-profile', '--no-tools'])('rejects the removed %s option', async option => {
        const result = await runCliWithOutput([
            'new',
            'project',
            'removed-option',
            tempDir,
            option,
            '--no-interactive',
        ]);

        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain(`unknown option '${option}'`);
        expect(fs.existsSync(path.join(tempDir, 'removed-option'))).toBe(false);
    });

    test('leaves an existing target unchanged', async () => {
        const projectDir = path.join(tempDir, 'existing-app');
        fs.mkdirSync(projectDir);
        fs.writeFileSync(path.join(projectDir, 'keep.txt'), 'keep this content', 'utf-8');

        const result = await runCliWithOutput([
            'new',
            'project',
            'existing-app',
            tempDir,
            '--no-interactive',
        ]);

        expect(result.exitCode).toBe(2);
        expect(result.stderr).toContain('already exists');
        expect(fs.readdirSync(projectDir)).toEqual(['keep.txt']);
        expect(fs.readFileSync(path.join(projectDir, 'keep.txt'), 'utf-8')).toBe('keep this content');
    });

    test('documents the scriptable and interactive options', async () => {
        const result = await runCliWithOutput(['new', 'project', '--help']);

        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe('');
        expect(result.stdout).toContain('[name]');
        expect(result.stdout).toContain('[directory]');
        expect(result.stdout).toContain('--profile <id>');
        expect(result.stdout).toContain('--tool <id>');
        expect(result.stdout).not.toContain('--no-profile');
        expect(result.stdout).not.toContain('--no-tools');
        expect(result.stdout).toContain('--set <key=value>');
        expect(result.stdout).toContain('--no-interactive');
        expect(result.stdout).toContain('--yes');
        expect(result.stdout).toContain('profile.<id>.<prompt>');
        expect(result.stdout).toContain('tool.<id>.<prompt>');
        expect(result.stdout).not.toContain('--json');
    });
});

async function runCliWithOutput(args: readonly string[], overrides: TestIoOverrides = {}) {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const io = {
        stdout: (text: string) => stdout.push(text),
        stderr: (text: string) => stderr.push(text),
        ...overrides,
    } as NonNullable<Parameters<typeof runCli>[1]>;

    const exitCode = await runCli(['node', 'xsmp', ...args], io);
    return {
        exitCode,
        stdout: stdout.join(''),
        stderr: stderr.join(''),
    };
}
