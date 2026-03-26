import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCli } from '../../src/cli/main.js';

let tempDir: string;

beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-cli-'));
});

afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('XSMP CLI', () => {
    test('prints help', async () => {
        const result = await runCliWithOutput(['--help']);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('validate');
        expect(result.stdout).toContain('generate');
    });

    test('validates a project directory successfully', async () => {
        const projectDir = createProject(tempDir, 'app', `
project "app" using "ECSS_SMP_2025"
source "smdl"
tool "smp"
`, {
            'smdl/app.xsmpcat': `
catalogue app

namespace app
{
    /** @uuid 11111111-1111-1111-1111-111111111111 */
    struct Simple
    {
    }
}
`,
        });

        const result = await runCliWithOutput(['validate', projectDir]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('0 errors, 0 warnings');
        expect(result.stderr).toBe('');
    });

    test('validates a project file successfully', async () => {
        const projectDir = createProject(tempDir, 'app', `
project "app" using "ECSS_SMP_2025"
source "smdl"
`, {
            'smdl/app.xsmpcat': `
catalogue app

namespace app
{
    /** @uuid 22222222-2222-2222-2222-222222222222 */
    struct Simple
    {
    }
}
`,
        });

        const result = await runCliWithOutput(['validate', path.join(projectDir, 'xsmp.project')]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('0 errors, 0 warnings');
        expect(result.stderr).toBe('');
    });

    test('validates a project with a resolved dependency', async () => {
        createProject(tempDir, 'foundation', `
project "foundation" using "ECSS_SMP_2025"
source "smdl"
`, {
            'smdl/foundation.xsmpcat': `
catalogue foundation

namespace foundation
{
    /** @uuid 33333333-3333-3333-3333-333333333333 */
    public struct Base
    {
    }
}
`,
        });
        const projectDir = createProject(tempDir, 'app', `
project "app" using "ECSS_SMP_2025"
source "smdl"
dependency "foundation"
`, {
            'smdl/app.xsmpcat': `
catalogue app

namespace app
{
    /** @uuid 44444444-4444-4444-4444-444444444444 */
    struct UsesDependency
    {
        field foundation.Base base
    }
}
`,
        });

        const result = await runCliWithOutput(['validate', projectDir]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('0 errors, 0 warnings');
        expect(result.stderr).toBe('');
    });

    test('reports missing dependencies clearly', async () => {
        const projectDir = createProject(tempDir, 'app', `
project "app" using "ECSS_SMP_2025"
source "smdl"
dependency "foundation"
`, {
            'smdl/app.xsmpcat': `
catalogue app

namespace app
{
    /** @uuid 55555555-5555-5555-5555-555555555555 */
    struct Simple
    {
    }
}
`,
        });

        const result = await runCliWithOutput(['validate', projectDir]);

        expect(result.exitCode).toBe(1);
        expect(result.stderr).toContain('Missing dependency project "foundation"');
        expect(result.stdout).toContain('1 errors, 0 warnings');
    });

    test('ignores diagnostics from unrelated projects in the scanned workspace', async () => {
        createProject(tempDir, 'broken', `
project "broken" using "ECSS_SMP_2025"
source "smdl"
`, {
            'smdl/broken.xsmpcat': `
catalogue broken

namespace broken
{
    /** @uuid 66666666-6666-6666-6666-666666666666 */
    struct Broken
    {
        field MissingType missing
    }
}
`,
        });
        const projectDir = createProject(tempDir, 'app', `
project "app" using "ECSS_SMP_2025"
source "smdl"
`, {
            'smdl/app.xsmpcat': `
catalogue app

namespace app
{
    /** @uuid 77777777-7777-7777-7777-777777777777 */
    struct Simple
    {
    }
}
`,
        });

        const result = await runCliWithOutput(['validate', projectDir]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('0 errors, 0 warnings');
        expect(result.stderr).not.toContain('broken.xsmpcat');
        expect(result.stderr).toBe('');
    });

    test('generates outputs for a valid project', async () => {
        const projectDir = createProject(tempDir, 'app', `
project "app" using "ECSS_SMP_2025"
source "smdl"
tool "smp"
`, {
            'smdl/app.xsmpcat': `
catalogue app

namespace app
{
    /** @uuid 88888888-8888-8888-8888-888888888888 */
    struct Simple
    {
    }
}
`,
        });

        const result = await runCliWithOutput(['generate', projectDir]);

        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Generated outputs for project "app".');
        expect(fs.existsSync(path.join(projectDir, 'smdl-gen', 'app.smpcat'))).toBe(true);
        expect(fs.existsSync(path.join(projectDir, 'smdl-gen', 'app.smppkg'))).toBe(true);
    });

    test('blocks generation when a visible dependency has errors', async () => {
        createProject(tempDir, 'foundation', `
project "foundation" using "ECSS_SMP_2025"
source "smdl"
`, {
            'smdl/foundation.xsmpcat': `
catalogue foundation

namespace foundation
{
    /** @uuid 99999999-9999-9999-9999-999999999999 */
    struct Broken
    {
        field MissingType missing
    }
}
`,
        });
        const projectDir = createProject(tempDir, 'app', `
project "app" using "ECSS_SMP_2025"
source "smdl"
tool "smp"
dependency "foundation"
`, {
            'smdl/app.xsmpcat': `
catalogue app

namespace app
{
    /** @uuid aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa */
    struct Simple
    {
    }
}
`,
        });

        const result = await runCliWithOutput(['generate', projectDir]);

        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain('1 errors, 0 warnings');
        expect(fs.existsSync(path.join(projectDir, 'smdl-gen'))).toBe(false);
    });
});

function createProject(rootDir: string, name: string, projectContent: string, files: Record<string, string>): string {
    const projectDir = path.join(rootDir, name);
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'xsmp.project'), projectContent.trimStart());

    for (const [relativePath, content] of Object.entries(files)) {
        const absolutePath = path.join(projectDir, relativePath);
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, content.trimStart());
    }

    return projectDir;
}

async function runCliWithOutput(args: readonly string[]) {
    const stdout: string[] = [];
    const stderr: string[] = [];

    const exitCode = await runCli(
        ['node', 'xsmpproject-cli', ...args],
        {
            stdout: text => stdout.push(text),
            stderr: text => stderr.push(text),
        },
    );

    return {
        exitCode,
        stdout: stdout.join(''),
        stderr: stderr.join(''),
    };
}
