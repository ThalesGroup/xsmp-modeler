import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { URI } from 'langium';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import { ADocGenerator } from '@xsmp/tool-adoc';
import { GeneratedFileWriter } from '@xsmp/core/generator';
import { generateDocuments } from '../generation-test-utils.js';
import { cleanupProfileGeneratorTestContext, createProfileGeneratorTestContext, parseProfileGeneratorFixture, type ProfileGeneratorTestContext } from '../profile-generator-test-utils.js';

let context: ProfileGeneratorTestContext;
beforeAll(async () => { context = await createProfileGeneratorTestContext(); });
afterEach(async () => {
    vi.restoreAllMocks();
    await cleanupProfileGeneratorTestContext(context);
});

function directory(): string {
    const result = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-windows-cleanup-'));
    context.tempDirs.push(result);
    return result;
}

test('repeated ADoc generation repairs files and never removes its output root (#215)', async () => {
    const catalogue = await parseProfileGeneratorFixture(context);
    const project = directory();
    const root = path.join(project, 'adoc-gen');
    const generator = new ADocGenerator(context.services.shared);
    const writer = new GeneratedFileWriter();
    const generate = () => generateDocuments(generator, [catalogue.parseResult.value], URI.file(project), writer);
    await generate();
    const inode = fs.statSync(root, { bigint: true }).ino;
    const target = path.join(root, `${catalogue.parseResult.value.name}-gen.adoc`);
    const expected = fs.readFileSync(target);
    fs.writeFileSync(target, 'external edit');
    fs.writeFileSync(path.join(root, 'obsolete.adoc'), 'obsolete');
    const rmdir = vi.spyOn(fs.promises, 'rmdir');
    await generate();
    await generate();
    expect(fs.readFileSync(target)).toEqual(expected);
    expect(fs.existsSync(path.join(root, 'obsolete.adoc'))).toBe(false);
    await generateDocuments(generator, [], URI.file(project), writer);
    expect(fs.readdirSync(root)).toEqual([]);
    expect(fs.statSync(root, { bigint: true }).ino).toBe(inode);
    expect(rmdir.mock.calls.some(([file]) => path.relative(root, String(file)) === '')).toBe(false);
});

test.each(['EBUSY', 'EPERM', 'EACCES'])('a %s empty subdirectory does not prevent file or tracked cleanup', async code => {
    const project = directory();
    const writer = new GeneratedFileWriter();
    const prepare = async () => {
        const session = writer.createSession(project);
        const files = session.createFiles('test', {
            generated: { directory: 'src-gen', writeMode: 'if-changed', cleanup: 'directory' },
            tracked: { directory: 'python', writeMode: 'if-changed', cleanup: 'tracked' },
        });
        await session.prepare();
        return { session, files };
    };
    const first = await prepare();
    await first.files.write('generated', 'busy/stale.cpp', 'stale');
    await first.files.write('tracked', 'stale.py', 'stale');
    await first.session.finish(true);
    const busy = path.join(project, 'src-gen/busy');
    const original = fs.promises.rmdir;
    const rmdir = vi.spyOn(fs.promises, 'rmdir').mockImplementation(async (file, options) => {
        if (String(file) === busy) throw Object.assign(new Error('directory locked'), { code });
        return original(file, options);
    });
    const second = await prepare();
    await second.session.finish(true);
    expect(fs.readdirSync(busy)).toEqual([]);
    expect(fs.existsSync(path.join(project, 'python/stale.py'))).toBe(false);
    rmdir.mockRestore();
    const third = await prepare();
    await third.session.finish(true);
    expect(fs.existsSync(busy)).toBe(false);
});

test('an empty nested output root is preserved until it is no longer declared', async () => {
    const project = directory();
    const nested = path.join(project, 'src-gen/nested');
    fs.mkdirSync(nested, { recursive: true });
    const writer = new GeneratedFileWriter();
    const session = writer.createSession(project);
    session.createFiles('outer', { generated: { directory: 'src-gen', writeMode: 'if-changed', cleanup: 'directory' } });
    session.createFiles('inner', { generated: { directory: 'src-gen/nested', writeMode: 'if-changed', cleanup: 'directory' } });
    await session.prepare();
    const rmdir = vi.spyOn(fs.promises, 'rmdir');
    await session.finish(true);
    expect(rmdir.mock.calls.some(([file]) => path.relative(nested, String(file)) === '')).toBe(false);
    expect(fs.existsSync(nested)).toBe(true);
    const next = writer.createSession(project);
    next.createFiles('outer', { generated: { directory: 'src-gen', writeMode: 'if-changed', cleanup: 'directory' } });
    await next.prepare();
    await next.finish(true);
    expect(fs.existsSync(nested)).toBe(false);
});

/** A Windows process keeps its current directory open without FILE_SHARE_DELETE. */
async function holdDirectory(root: string): Promise<() => Promise<void>> {
    const child = spawn(process.execPath, ['-e', "process.stdin.resume(); process.stdout.write('ready');"], {
        cwd: root, stdio: ['pipe', 'pipe', 'inherit'],
    });
    await new Promise<void>((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', code => reject(new Error(`Directory holder exited early: ${code}`)));
        child.stdout.once('data', () => resolve());
    });
    return async () => {
        if (child.exitCode !== null) return;
        const closed = once(child, 'close');
        child.stdin.end();
        await closed;
    };
}

test.skipIf(process.platform !== 'win32')('native Windows: ADoc works repeatedly while another process holds adoc-gen (#215)', async () => {
    const catalogue = await parseProfileGeneratorFixture(context);
    const project = directory();
    const root = path.join(project, 'adoc-gen');
    fs.mkdirSync(root);
    const release = await holdDirectory(root);
    try {
        // Establish a real Windows lock on an empty directory before testing generation.
        await expect(fs.promises.rmdir(root)).rejects.toMatchObject({ code: expect.stringMatching(/^(EBUSY|EPERM|EACCES)$/) });
        const generator = new ADocGenerator(context.services.shared);
        const writer = new GeneratedFileWriter();
        for (let pass = 0; pass < 2; pass++) {
            fs.writeFileSync(path.join(root, 'obsolete.adoc'), 'obsolete');
            await generateDocuments(generator, [catalogue.parseResult.value], URI.file(project), writer);
            expect(fs.existsSync(path.join(root, 'obsolete.adoc'))).toBe(false);
            expect(fs.readFileSync(path.join(root, `${catalogue.parseResult.value.name}-gen.adoc`), 'utf8')).toContain(catalogue.parseResult.value.name);
        }
        await generateDocuments(generator, [], URI.file(project), writer);
        expect(fs.readdirSync(root)).toEqual([]);
    } finally {
        await release();
    }
}, 20_000);

test.skipIf(process.platform !== 'win32')('native Windows: stale files are removed from a held subdirectory and pruning resumes after release', async () => {
    const project = directory();
    const busy = path.join(project, 'src-gen/busy');
    fs.mkdirSync(busy, { recursive: true });
    const release = await holdDirectory(busy);
    const writer = new GeneratedFileWriter();
    const clean = async () => {
        const session = writer.createSession(project);
        session.createFiles('test', { generated: { directory: 'src-gen', writeMode: 'if-changed', cleanup: 'directory' } });
        await session.prepare();
        await session.finish(true);
    };
    try {
        await expect(fs.promises.rmdir(busy)).rejects.toMatchObject({ code: expect.stringMatching(/^(EBUSY|EPERM|EACCES)$/) });
        fs.writeFileSync(path.join(busy, 'stale.cpp'), 'stale');
        await clean();
        expect(fs.readdirSync(busy)).toEqual([]);
    } finally {
        await release();
    }
    await clean();
    expect(fs.existsSync(busy)).toBe(false);
}, 20_000);

test.skipIf(process.platform !== 'win32')('native Windows: casing aliases of generated roots do not disable cleanup', async () => {
    const project = directory();
    fs.mkdirSync(path.join(project, 'adoc-gen'));
    fs.writeFileSync(path.join(project, 'adoc-gen/stale.adoc'), 'stale');
    const session = new GeneratedFileWriter().createSession(project);
    const first = session.createFiles('first', { docs: { directory: 'adoc-gen', writeMode: 'if-changed', cleanup: 'directory' } });
    const second = session.createFiles('second', { docs: { directory: 'ADOC-GEN', writeMode: 'if-changed', cleanup: 'directory' } });
    await session.prepare();
    await first.write('docs', 'one.adoc', 'one');
    await second.write('docs', 'two.adoc', 'two');
    await session.finish(true);
    expect(fs.readdirSync(path.join(project, 'adoc-gen')).sort()).toEqual(['one.adoc', 'two.adoc']);
});
