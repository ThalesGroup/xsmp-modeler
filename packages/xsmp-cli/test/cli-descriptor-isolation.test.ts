import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCli } from '@xsmp/cli';
import { CliFileSystemProvider } from '../src/file-system.js';

let directory: string;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-cli-descriptors-')); });
afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(directory, { recursive: true, force: true });
});

function project(relative: string, name: string, source = 'src', dependency?: string): string {
    const root = path.join(directory, relative);
    fs.mkdirSync(path.join(root, 'src'), { recursive: true });
    fs.writeFileSync(path.join(root, 'xsmp.project'),
        `project "${name}" source "${source}" tool "adoc" ${dependency ? `dependency "${dependency}"` : ''}`);
    fs.writeFileSync(path.join(root, 'src', `${name}.xsmpcat`), `catalogue ${name} namespace ${name} {}`);
    return root;
}

function corruptDescriptor(root: string): void {
    fs.appendFileSync(path.join(root, 'xsmp.project'), Buffer.from('\n// café', 'latin1'));
}

async function run(command: string, root: string) {
    let stdout = '';
    let stderr = '';
    const code = await runCli(['node', 'xsmp', command, root, '--workspace-root', directory], {
        stdout: text => { stdout += text; },
        stderr: text => { stderr += text; },
    });
    return { code, stdout, stderr };
}

test.each(['peer', 'app/outside'])('ignores an unreadable unrelated descriptor in %s', async location => {
    const root = project('app', 'App');
    const peer = project(location, 'Peer');
    corruptDescriptor(peer);
    fs.writeFileSync(path.join(peer, 'src/Peer.xsmpcat'), Buffer.from([0xff]));
    for (const command of ['validate', 'generate']) {
        const result = await run(command, root);
        expect(result.code, result.stderr).toBe(0);
        expect(result.stderr).toBe('');
        expect(result.stdout).toContain('0 errors, 0 warnings');
    }
    expect(fs.existsSync(path.join(root, 'adoc-gen/App-gen.adoc'))).toBe(true);
});

test.each(['.', 'src'])('rejects an unreadable nested descriptor inside selected source %s', async source => {
    const root = project('app', 'App', source);
    const nested = project(source === '.' ? 'app/nested' : 'app/src/nested', 'Nested');
    corruptDescriptor(nested);
    fs.mkdirSync(path.join(root, 'adoc-gen'));
    fs.writeFileSync(path.join(root, 'adoc-gen/previous.adoc'), 'previous output');
    for (const command of ['validate', 'generate']) {
        const result = await run(command, root);
        expect(result.code).toBe(2);
        expect(result.stderr).toContain('is not valid UTF-8');
        expect(result.stderr).toContain(path.join(nested, 'xsmp.project'));
    }
    expect(fs.readdirSync(path.join(root, 'adoc-gen'))).toEqual(['previous.adoc']);
    expect(fs.readFileSync(path.join(root, 'adoc-gen/previous.adoc'), 'utf8')).toBe('previous output');
});

test('rejects an unreadable target descriptor', async () => {
    const root = project('app', 'App');
    corruptDescriptor(root);
    const result = await run('validate', root);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain(path.join(root, 'xsmp.project'));
    expect(result.stderr).toContain('is not valid UTF-8');
});

test.each([false, true])('reports the unreadable descriptors when a dependency is missing (transitive: %s)', async transitive => {
    const root = project('app', 'App', 'src', transitive ? 'Middle' : 'Peer');
    if (transitive) project('middle', 'Middle', 'src', 'Peer');
    const peer = project('peer', 'Peer');
    corruptDescriptor(peer);
    const result = await run('generate', root);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('Missing dependency project "Peer"');
    expect(result.stderr).toContain(path.join(peer, 'xsmp.project'));
    expect(result.stderr).toContain('is not valid UTF-8');
    expect(fs.existsSync(path.join(root, 'adoc-gen'))).toBe(false);
});

test('keeps duplicate name diagnostics from readable descriptors', async () => {
    const root = project('app', 'App');
    project('duplicate', 'App');
    corruptDescriptor(project('unrelated', 'Unrelated'));
    const result = await run('validate', root);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('Duplicated project name');
});

test('keeps an unrelated syntactically invalid descriptor with valid UTF-8 isolated', async () => {
    const root = project('app', 'App');
    const peer = project('peer', 'Peer');
    fs.writeFileSync(path.join(peer, 'xsmp.project'), 'project');
    const result = await run('validate', root);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stderr).toBe('');
});

test.each([true, false])('isolates file access errors but preserves unexpected failures (access error: %s)', async accessError => {
    const root = project('app', 'App');
    const peer = project('peer', 'Peer');
    const readFile = CliFileSystemProvider.prototype.readFile;
    vi.spyOn(CliFileSystemProvider.prototype, 'readFile').mockImplementation(function (this: CliFileSystemProvider, uri) {
        if (uri.fsPath === path.join(peer, 'xsmp.project')) {
            const error = new Error('injected descriptor read failure');
            if (accessError) Object.assign(error, { code: 'EACCES' });
            return Promise.reject(error);
        }
        return readFile.call(this, uri);
    });
    const result = await run('validate', root);
    expect(result.code).toBe(accessError ? 0 : 2);
    if (accessError) expect(result.stderr).toBe('');
    else expect(result.stderr).toContain('injected descriptor read failure');
});
