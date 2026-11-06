import { afterEach, beforeEach, expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCli } from '@xsmp/cli';
import { collectMissingDependencyDiagnostics, loadCliProjectContext } from '../src/cli-util.js';

let directory: string;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-cli-scope-')); });
afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); });

function project(relative: string, name: string, dependencies = ''): string {
    const root = path.join(directory, relative);
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'xsmp.project'), `project '${name}' using 'ECSS_SMP_2025'\nsource '.'\ntool 'smp'\n${dependencies}`);
    fs.writeFileSync(path.join(root, `${name}.xsmpcat`), `catalogue ${name}\nnamespace ${name} {}\n`);
    return root;
}

async function run(command: string, root: string) {
    let stdout = '';
    let stderr = '';
    const exitCode = await runCli(['node', 'xsmp', command, root, '--workspace-root', directory], {
        stdout: text => { stdout += text; }, stderr: text => { stderr += text; },
    });
    return { exitCode, stdout, stderr };
}

test.each(['peer', 'app/nested'])('does not read unrelated native sources in %s during validation or generation', async location => {
    const root = project('app', 'app');
    const peer = project(location, 'peer');
    fs.writeFileSync(path.join(peer, 'invalid.xsmpcat'), Buffer.from([0xff]));
    for (const command of ['validate', 'generate']) {
        const result = await run(command, root);
        expect(result.exitCode, result.stderr).toBe(0);
        expect(result.stderr).toBe('');
    }
    expect(fs.existsSync(path.join(root, 'smdl-gen', 'app.smpcat'))).toBe(true);
    const context = await loadCliProjectContext(root, { workspaceRoot: directory });
    const loaded = context.services.shared.workspace.LangiumDocuments.all.toArray().map(doc => doc.uri.fsPath);
    expect(loaded).toContain(path.join(peer, 'xsmp.project'));
    expect(loaded).not.toContain(path.join(peer, 'peer.xsmpcat'));
});

test.each([false, true])('includes a nested descriptor only when it is an explicit dependency: %s', async required => {
    const root = project('app', 'app', required ? "dependency 'nested'\n" : '');
    const nested = project('app/nested', 'nested', "dependency 'missing'\n");
    const nestedDescriptor = path.join(nested, 'xsmp.project');
    fs.mkdirSync(path.join(nested, 'src'));
    fs.renameSync(path.join(nested, 'nested.xsmpcat'), path.join(nested, 'src', 'nested.xsmpcat'));
    fs.writeFileSync(nestedDescriptor, fs.readFileSync(nestedDescriptor, 'utf8').replace("source '.'", "source 'src'"));
    const context = await loadCliProjectContext(root, { workspaceRoot: directory });
    expect(context.scopedDocuments.some(doc => doc.uri.fsPath === nestedDescriptor)).toBe(required);
    expect(collectMissingDependencyDiagnostics(context.targetProject!, context.services.shared.workspace.ProjectManager))
        .toHaveLength(required ? 1 : 0);
    for (const command of ['validate', 'generate']) {
        const result = await run(command, root);
        expect(result.exitCode, result.stderr).toBe(required ? 1 : 0);
        if (required) expect(result.stderr).toContain('Missing dependency project "missing"');
        else expect(result.stderr).toBe('');
    }
});

test.each(['peer', 'app/nested'])('does not import unrelated invalid SMP sources in %s', async location => {
    const root = project('app', 'app');
    const peer = project(location, 'peer');
    fs.writeFileSync(path.join(peer, 'invalid.smpcat'), '<not-a-catalogue>');
    const result = await run('validate', root);
    expect(result.exitCode, result.stderr).toBe(0);
    expect(result.stderr).toBe('');
});

test('loads transitive native and SMP dependencies', async () => {
    const root = project('app', 'app', "dependency 'middle'\n");
    project('middle', 'middle', "dependency 'base'\n");
    const base = project('base', 'base');
    fs.writeFileSync(path.join(base, 'types.smpcat'), smpCatalogue);
    const context = await loadCliProjectContext(root, { workspaceRoot: directory });
    const loaded = context.services.shared.workspace.LangiumDocuments.all.toArray();
    expect(loaded.some(doc => doc.uri.scheme === 'xsmp-smp' && doc.uri.fsPath.endsWith('types.smpcat'))).toBe(true);
    expect(context.scopedDocuments.filter(doc => doc.uri.scheme === 'file').map(doc => path.basename(doc.uri.fsPath))).toEqual(expect.arrayContaining([
        'app.xsmpcat', 'middle.xsmpcat', 'base.xsmpcat',
    ]));
    const result = await run('validate', root);
    expect(result.exitCode, result.stderr).toBe(0);
});

test('keeps global XML search roots without importing unrelated project mirrors', async () => {
    const root = project('app', 'app');
    const peer = project('peer', 'peer');
    fs.writeFileSync(path.join(peer, 'dependency.smpcat'), smpCatalogue.replace('Name="External"', 'Name="Resolved"'));
    fs.writeFileSync(path.join(root, 'owner.smpcat'), smpCatalogue
        .replace('Id="types" Name="types"', 'Id="owner" Name="owner"')
        .replace('Id="demo.External" Name="External"', 'Id="demo.Owner" Name="Owner"')
        .replace('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"/>',
            'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"><Field Name="value"><Type xlink:href="dependency.smpcat#demo.External"/></Field></Type>')
        .replace('xmlns:xsi=', 'xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:xsi='));
    const context = await loadCliProjectContext(root, { workspaceRoot: directory });
    const index = context.services.shared.SmpWorkspaceIndex;
    const mirrorUri = index.getMirrorUriForSourcePath(path.join(root, 'owner.smpcat'))!;
    expect(context.services.shared.SmpMirrorManager.getMirrorContent(mirrorUri)).toContain('field demo.Resolved value');
    expect(index.hasEligibleSourcePath(path.join(peer, 'dependency.smpcat'))).toBe(false);
});

test('still reports invalid SMP XML in a required dependency', async () => {
    const root = project('app', 'app', "dependency 'base'\n");
    const base = project('base', 'base');
    fs.writeFileSync(path.join(base, 'invalid.smpcat'), '<not-a-catalogue>');
    const result = await run('validate', root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('invalid.smpcat');
});

test('still refuses invalid UTF-8 in a required dependency', async () => {
    const root = project('app', 'app', "dependency 'base'\n");
    const base = project('base', 'base');
    fs.writeFileSync(path.join(base, 'invalid.xsmpcat'), Buffer.from([0xff]));
    const result = await run('validate', root);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('not valid UTF-8');
});

test('keeps duplicate descriptor diagnostics without reading the duplicate project sources', async () => {
    const root = project('app', 'app');
    const peer = project('peer', 'app');
    fs.writeFileSync(path.join(peer, 'invalid.xsmpcat'), Buffer.from([0xff]));
    const result = await run('validate', root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Duplicated project name');
    expect(result.stderr).not.toContain('not valid UTF-8');
});

test('does not fall back to every project when the target descriptor is invalid', async () => {
    const root = project('app', 'app');
    fs.writeFileSync(path.join(root, 'xsmp.project'), 'this is not a project');
    const peer = project('peer', 'peer');
    fs.writeFileSync(path.join(peer, 'invalid.xsmpcat'), Buffer.from([0xff]));
    const result = await run('validate', root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('xsmp.project');
    expect(result.stderr).not.toContain('not valid UTF-8');
});

test.each([
    ["dependency 'missing'\n", '', 'Missing dependency project'],
    ["dependency 'peer'\n", "dependency 'app'\n", 'Cyclic dependency detected'],
])('preserves graph diagnostics: %s', async (dependencies, peerDependencies, message) => {
    const root = project('app', 'app', dependencies);
    project('peer', 'peer', peerDependencies);
    const result = await run('validate', root);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(message);
});

const smpCatalogue = `<?xml version="1.0" encoding="UTF-8"?>
<Catalogue:Catalogue xmlns:Catalogue="http://www.ecss.nl/smp/2025/Smdl/Catalogue" xmlns:Types="http://www.ecss.nl/smp/2025/Core/Types" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Id="types" Name="types">
  <Namespace Name="demo"><Type xsi:type="Types:Structure" Id="demo.External" Name="External" Uuid="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"/></Namespace>
</Catalogue:Catalogue>`;
