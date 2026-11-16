import { afterEach, beforeEach, expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCli } from '@xsmp/cli';
import { resolveCliProjectInput } from '../src/cli-util.js';

let directory: string;
let workspace: string;
let project: string;

beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-cli-realpath-'));
    workspace = path.join(directory, 'workspace');
    project = path.join(workspace, 'app');
    fs.mkdirSync(path.join(project, 'src'), { recursive: true });
    fs.writeFileSync(path.join(project, 'xsmp.project'), 'project "App"\nsource "src"\ntool "adoc"\n');
    fs.writeFileSync(path.join(project, 'src/App.xsmpcat'), 'catalogue App namespace app {}');
    fs.symlinkSync(project, path.join(workspace, 'alias'), 'junction');
    fs.symlinkSync(workspace, path.join(directory, 'workspace-alias'), 'junction');
});

afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); });

test.each([
    ['app', false],
    ['alias', false],
    ['alias/xsmp.project', false],
    ['alias', true],
] as const)('validates and generates %s with aliased workspace %s once', async (relative, aliasedWorkspace) => {
    const root = aliasedWorkspace ? path.join(directory, 'workspace-alias') : workspace;
    const target = path.join(root, relative);
    for (const command of ['validate', 'generate']) {
        let stdout = '';
        let stderr = '';
        const code = await runCli(['node', 'xsmp', command, target, '--workspace-root', root], {
            stdout: text => { stdout += text; },
            stderr: text => { stderr += text; },
        });
        expect(code, stderr).toBe(0);
        expect(stderr).toBe('');
        expect(stdout).toContain('0 errors, 0 warnings');
    }
    expect(fs.existsSync(path.join(project, 'adoc-gen/App-gen.adoc'))).toBe(true);
});

test('uses the physical parent as the default workspace root', async () => {
    fs.symlinkSync(project, path.join(directory, 'external-alias'), 'junction');
    expect(await resolveCliProjectInput(path.join(directory, 'external-alias'))).toEqual({
        projectFile: path.join(fs.realpathSync.native(project), 'xsmp.project'),
        projectDir: fs.realpathSync.native(project),
        workspaceRoot: fs.realpathSync.native(workspace),
    });
});

test('still reports distinct projects sharing a name', async () => {
    const peer = path.join(workspace, 'peer');
    fs.mkdirSync(peer);
    fs.copyFileSync(path.join(project, 'xsmp.project'), path.join(peer, 'xsmp.project'));
    let stderr = '';
    const code = await runCli(['node', 'xsmp', 'validate', path.join(workspace, 'alias'), '--workspace-root', workspace], {
        stdout: () => undefined,
        stderr: text => { stderr += text; },
    });
    expect(code).toBe(1);
    expect(stderr).toContain('Duplicated project name');
});

test('preserves readable errors for missing inputs and workspace roots', async () => {
    await expect(resolveCliProjectInput(path.join(directory, 'missing'))).rejects.toThrow('does not exist');
    await expect(resolveCliProjectInput(project, path.join(directory, 'missing'))).rejects.toThrow('is not a directory');
});
