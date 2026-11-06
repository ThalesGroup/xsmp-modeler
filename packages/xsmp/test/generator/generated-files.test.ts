import { Cancellation } from 'langium';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { GeneratedFileWriter, type FileFormatter, type OutputDefinition } from '../../src/generator/generated-files.js';

const temporaryDirectories: string[] = [];
const generated: OutputDefinition = { directory: 'src-gen', writeMode: 'if-changed', cleanup: 'directory' };
const tracked: OutputDefinition = { directory: 'python', writeMode: 'if-changed', cleanup: 'tracked' };
const user: OutputDefinition = { directory: 'src', writeMode: 'if-missing' };

function temporaryDirectory(): string {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-generated-files-'));
    temporaryDirectories.push(directory);
    return directory;
}

async function prepare(
    directory: string,
    outputs: Record<string, OutputDefinition>,
    writer = new GeneratedFileWriter(),
    token = Cancellation.CancellationToken.None,
) {
    const session = writer.createSession(directory, token);
    const files = session.createFiles('test', outputs);
    await session.prepare();
    return { session, files };
}

function put(directory: string, file: string, content: string | Buffer): void {
    fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
    fs.writeFileSync(path.join(directory, file), content);
}

function read(directory: string, file: string): string {
    return fs.readFileSync(path.join(directory, file), 'utf8');
}

function formatter() {
    const format = vi.fn(async (source: string) => `formatted:${source}` as string | undefined);
    const value: FileFormatter = { prepare: vi.fn(async () => ({ cacheKey: 'tool/style/1', format })) };
    return { value, format };
}

afterEach(() => {
    vi.restoreAllMocks();
    for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

test('accepts eager, synchronous and asynchronous content, preserving unchanged bytes and mtimes', async () => {
    const directory = temporaryDirectory();
    for (let pass = 0; pass < 2; pass++) {
        const { session, files } = await prepare(directory, { generated });
        const writes = vi.spyOn(fs.promises, 'writeFile');
        const synchronous = vi.fn(() => 'sync');
        const asynchronous = vi.fn(async () => 'async');
        await files.write('generated', 'eager.cpp', 'eager');
        await files.write('generated', 'sync.cpp', synchronous);
        await files.write('generated', 'async.cpp', asynchronous);
        await session.finish(true);
        expect(synchronous).toHaveBeenCalledTimes(1);
        expect(asynchronous).toHaveBeenCalledTimes(1);
        expect(writes).toHaveBeenCalledTimes(pass === 0 ? 3 : 0);
        vi.restoreAllMocks();
    }
    expect(read(directory, 'src-gen/async.cpp')).toBe('async');
    expect(fs.existsSync(path.join(directory, '.xsmp'))).toBe(false);
});

test('existing create-once files require no content evaluation, content read or formatter preparation', async () => {
    const directory = temporaryDirectory();
    put(directory, 'src/user.cpp', 'edited');
    const { value, format } = formatter();
    const { session, files } = await prepare(directory, { user: { ...user, formatter: value } });
    const render = vi.fn(() => { throw new Error('must not run'); });
    const reads = vi.spyOn(fs.promises, 'readFile');
    await files.write('user', 'user.cpp', render);
    await files.write('user', './user.cpp', render);
    expect(reads).not.toHaveBeenCalled();
    expect(render).not.toHaveBeenCalled();
    expect(value.prepare).not.toHaveBeenCalled();
    expect(format).not.toHaveBeenCalled();
    await session.finish(true);
    expect(read(directory, 'src/user.cpp')).toBe('edited');
});

test('create-once content is rendered before exclusive creation and preserves a concurrent arrival', async () => {
    const directory = temporaryDirectory();
    const { session, files } = await prepare(directory, { user });
    await files.write('user', 'new.cpp', () => {
        expect(fs.existsSync(path.join(directory, 'src/new.cpp'))).toBe(false);
        put(directory, 'src/new.cpp', 'concurrent user');
        return 'generated';
    });
    await session.finish(true);
    expect(read(directory, 'src/new.cpp')).toBe('concurrent user');
});

test('missing create-once files evaluate and format asynchronous content exactly once', async () => {
    const directory = temporaryDirectory();
    const { value, format } = formatter();
    const { session, files } = await prepare(directory, { user: { ...user, formatter: value } });
    const render = vi.fn(async () => 'initial');
    await files.write('user', 'new.cpp', render);
    await session.finish(true);
    expect(render).toHaveBeenCalledTimes(1);
    expect(format).toHaveBeenCalledTimes(1);
    expect(read(directory, 'src/new.cpp')).toBe('formatted:initial');
});

test('create-once duplicates share the first result without rendering or writing again', async () => {
    const directory = temporaryDirectory();
    const { session, files } = await prepare(directory, { user });
    const writes = vi.spyOn(fs.promises, 'writeFile');
    let release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    const firstRender = vi.fn(async () => { await ready; return 'first'; });
    const duplicateRender = vi.fn(() => 'duplicate');
    const first = files.write('user', 'new.cpp', firstRender);
    const duplicate = files.write('user', './new.cpp', duplicateRender);
    release();
    await Promise.all([first, duplicate]);
    await files.write('user', 'new.cpp', duplicateRender);
    await session.finish(true);
    expect(firstRender).toHaveBeenCalledTimes(1);
    expect(duplicateRender).not.toHaveBeenCalled();
    expect(writes).toHaveBeenCalledTimes(1);
    expect(read(directory, 'src/new.cpp')).toBe('first');
    expect((session as unknown as { createOnceWrites: Map<string, unknown> }).createOnceWrites.size).toBe(0);
});

test.each(['render', 'write'])('create-once duplicates share a %s failure and prevent cleanup', async failure => {
    const directory = temporaryDirectory();
    put(directory, 'src-gen/stale.cpp', 'old');
    const { session, files } = await prepare(directory, { generated, user });
    const error = new Error('first request failed');
    const render = vi.fn(async () => { if (failure === 'render') throw error; return 'first'; });
    if (failure === 'write') vi.spyOn(fs.promises, 'writeFile').mockRejectedValue(error);
    const duplicateRender = vi.fn(() => 'duplicate');
    const results = await Promise.allSettled([
        files.write('user', 'new.cpp', render),
        files.write('user', './new.cpp', duplicateRender),
    ]);
    expect(results).toEqual([{ status: 'rejected', reason: error }, { status: 'rejected', reason: error }]);
    await expect(files.write('user', 'new.cpp', duplicateRender)).rejects.toBe(error);
    await session.finish(true);
    expect(render).toHaveBeenCalledTimes(1);
    expect(duplicateRender).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(directory, 'src/new.cpp'))).toBe(false);
    expect(read(directory, 'src-gen/stale.cpp')).toBe('old');
});

test.each([false, true])('a %s async rendering failure creates no empty file and prevents cleanup', async asynchronous => {
    const directory = temporaryDirectory();
    put(directory, 'src-gen/stale.cpp', 'old');
    const { session, files } = await prepare(directory, { generated, user });
    const fail = () => { throw new Error('render failed'); };
    await expect(files.write('user', 'new.cpp', asynchronous ? async () => fail() : fail)).rejects.toThrow('render failed');
    await session.finish(true);
    expect(fs.existsSync(path.join(directory, 'src/new.cpp'))).toBe(false);
    expect(read(directory, 'src-gen/stale.cpp')).toBe('old');
});

test('the shared hash cache survives A → B → A without retaining formatted content', async () => {
    const writer = new GeneratedFileWriter();
    const a = temporaryDirectory();
    const b = temporaryDirectory();
    const { value, format } = formatter();
    for (const directory of [a, b, a]) {
        const { session, files } = await prepare(directory, { generated: { ...generated, formatter: value } }, writer);
        const reads = vi.spyOn(fs.promises, 'readFile');
        await files.write('generated', 'test.cpp', 'int value;');
        expect(reads).toHaveBeenCalledTimes(1);
        reads.mockRestore();
        await session.finish(true);
    }
    expect(format).toHaveBeenCalledTimes(2);
    const cache = (writer as unknown as { cache: Map<string, object> }).cache;
    expect([...cache.values()].every(entry => Object.keys(entry).sort().join() === 'context,formattedHash,rawHash')).toBe(true);
});

test('hash reuse verifies raw text, actual disk bytes and formatter context', async () => {
    const directory = temporaryDirectory();
    const writer = new GeneratedFileWriter();
    const { value, format } = formatter();
    const generate = async (raw = 'int value;') => {
        const { session, files } = await prepare(directory, { generated: { ...generated, formatter: value } }, writer);
        await files.write('generated', 'test.cpp', raw);
        await session.finish(true);
    };
    await generate();
    await generate();
    expect(format).toHaveBeenCalledTimes(1);
    const file = path.join(directory, 'src-gen/test.cpp');
    const previous = fs.statSync(file);
    put(directory, 'src-gen/test.cpp', Buffer.alloc(fs.statSync(file).size, 255));
    fs.utimesSync(file, previous.atime, previous.mtime);
    await generate();
    expect(format).toHaveBeenCalledTimes(2);
    fs.unlinkSync(file);
    await generate();
    expect(format).toHaveBeenCalledTimes(3);
    await generate('double value;');
    expect(format).toHaveBeenCalledTimes(4);
    vi.mocked(value.prepare).mockResolvedValue({ cacheKey: 'tool/style/2', format });
    await generate('double value;');
    expect(format).toHaveBeenCalledTimes(5);
    expect(read(directory, 'src-gen/test.cpp')).toBe('formatted:double value;');
});

test('formatting failure and an unknown context never become reusable results', async () => {
    const directory = temporaryDirectory();
    const writer = new GeneratedFileWriter();
    const { value, format } = formatter();
    format.mockResolvedValue(undefined);
    for (let pass = 0; pass < 2; pass++) {
        const { session, files } = await prepare(directory, { generated: { ...generated, formatter: value } }, writer);
        await files.write('generated', 'test.cpp', 'raw');
        await session.finish(true);
    }
    expect(format).toHaveBeenCalledTimes(2);
    expect(read(directory, 'src-gen/test.cpp')).toBe('raw');
    format.mockResolvedValue('formatted');
    vi.mocked(value.prepare).mockResolvedValue({ format });
    for (let pass = 0; pass < 2; pass++) {
        const { session, files } = await prepare(directory, { generated: { ...generated, formatter: value } }, writer);
        await files.write('generated', 'test.cpp', 'raw');
        await session.finish(true);
    }
    expect(format).toHaveBeenCalledTimes(4);
});

test.each([new GeneratedFileWriter(1), new GeneratedFileWriter(50_000, 1)])('cache eviction changes only the amount of formatting', async writer => {
    const directory = temporaryDirectory();
    const { value, format } = formatter();
    for (let pass = 0; pass < 2; pass++) {
        const { session, files } = await prepare(directory, { generated: { ...generated, formatter: value } }, writer);
        await files.write('generated', 'a.cpp', 'a');
        await files.write('generated', 'b.cpp', 'b');
        await session.finish(true);
    }
    expect(format).toHaveBeenCalledTimes(4);
    expect(read(directory, 'src-gen/a.cpp')).toBe('formatted:a');
    expect(read(directory, 'src-gen/b.cpp')).toBe('formatted:b');
});

test('directory cleanup uses all contributors, including unchanged files, and removes manual additions', async () => {
    const directory = temporaryDirectory();
    put(directory, 'src-gen/old/removed.cpp', 'old');
    put(directory, 'src-gen/one.cpp', 'one');
    put(directory, 'src-gen/manual.cpp', 'manual');
    const session = new GeneratedFileWriter().createSession(directory);
    const first = session.createFiles('first', { generated });
    const second = session.createFiles('second', { generated });
    await session.prepare();
    await first.write('generated', 'one.cpp', 'one');
    await second.write('generated', 'two.cpp', 'two');
    await session.finish(true);
    expect(fs.readdirSync(path.join(directory, 'src-gen')).sort()).toEqual(['one.cpp', 'two.cpp']);
});

test('tracked cleanup survives a fresh writer and preserves untracked files and create-once neighbours', async () => {
    const directory = temporaryDirectory();
    const outputs = { tracked, user: { ...user, directory: 'python' } };
    const first = await prepare(directory, outputs);
    await first.files.write('tracked', 'old/generated.py', 'generated');
    await first.files.write('user', 'old/user.py', 'user');
    await first.session.finish(true);
    put(directory, 'python/unknown.py', 'unknown');
    const second = await prepare(directory, outputs);
    await second.files.write('tracked', 'new/generated.py', 'new');
    await second.session.finish(true);
    expect(fs.existsSync(path.join(directory, 'python/old/generated.py'))).toBe(false);
    expect(read(directory, 'python/old/user.py')).toBe('user');
    expect(read(directory, 'python/unknown.py')).toBe('unknown');
    expect(read(directory, 'python/new/generated.py')).toBe('new');
});

test('failed generations retain previous and newly written ownership for the next successful cleanup', async () => {
    const directory = temporaryDirectory();
    const first = await prepare(directory, { tracked });
    await first.files.write('tracked', 'old.py', 'old');
    await first.session.finish(true);
    const failed = await prepare(directory, { tracked });
    await failed.files.write('tracked', 'new.py', 'new');
    await failed.session.finish(false);
    expect(read(directory, 'python/old.py')).toBe('old');
    const next = await prepare(directory, { tracked });
    await next.session.finish(true);
    expect(fs.readdirSync(path.join(directory, 'python'))).toEqual([]);
});

test('disk read errors propagate without evaluating the producer or removing previous files', async () => {
    const directory = temporaryDirectory();
    put(directory, 'src-gen/old.cpp', 'old');
    const { session, files } = await prepare(directory, { generated });
    const render = vi.fn(() => 'new');
    vi.spyOn(fs.promises, 'readFile').mockRejectedValue(Object.assign(new Error('denied'), { code: 'EACCES' }));
    await expect(files.write('generated', 'old.cpp', render)).rejects.toThrow('denied');
    await session.finish(false);
    expect(render).not.toHaveBeenCalled();
    expect(read(directory, 'src-gen/old.cpp')).toBe('old');
});

test('failed deletions remain owned and are retried after restart', async () => {
    const directory = temporaryDirectory();
    const first = await prepare(directory, { tracked });
    await first.files.write('tracked', 'old.py', 'old');
    await first.session.finish(true);
    const next = await prepare(directory, { tracked });
    const original = fs.promises.rm;
    vi.spyOn(fs.promises, 'rm').mockImplementation(async (file, options) => {
        if (String(file).endsWith('old.py')) throw Object.assign(new Error('denied'), { code: 'EACCES' });
        return original(file, options);
    });
    await expect(next.session.finish(true)).rejects.toThrow('denied');
    vi.restoreAllMocks();
    const retry = await prepare(directory, { tracked });
    await retry.session.finish(true);
    expect(fs.existsSync(path.join(directory, 'python/old.py'))).toBe(false);
});

test.each(['missing', 'corrupt'])('%s inventory preserves unknown generated-looking files', async mode => {
    const directory = temporaryDirectory();
    put(directory, 'python/old/__init__.py', 'unknown');
    if (mode === 'corrupt') put(directory, '.xsmp/generated-files.json', '{ broken');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { session } = await prepare(directory, { tracked });
    await session.finish(true);
    expect(read(directory, 'python/old/__init__.py')).toBe('unknown');
});

test.each(['.xsmp', '.XSMP'])('inventory entries cannot authorize deleting %s metadata from a root-level output', async metadata => {
    const directory = temporaryDirectory();
    put(directory, '.xsmp/other-metadata.json', 'protected');
    put(directory, '.xsmp/generated-files.json', JSON.stringify({
        version: 1,
        outputs: [{ owner: 'test', output: 'tracked', directory: '.', files: [`${metadata}/other-metadata.json`] }],
    }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { session } = await prepare(directory, { tracked: { ...tracked, directory: '.' } });
    await session.finish(true);
    expect(read(directory, '.xsmp/other-metadata.json')).toBe('protected');
});

test('switching an output or a particular path to create-once permanently abandons deletion ownership', async () => {
    const directory = temporaryDirectory();
    const first = await prepare(directory, { tracked });
    await first.files.write('tracked', 'old.py', 'old');
    await first.files.write('tracked', 'taken.py', 'taken');
    await first.session.finish(true);
    const second = await prepare(directory, { tracked, user: { ...user, directory: 'python' } });
    await second.files.write('tracked', 'old.py', 'old');
    await second.files.write('user', 'taken.py', () => 'ignored');
    await second.session.finish(true);
    const third = await prepare(directory, { tracked: { ...user, directory: 'python' } });
    await third.session.finish(true);
    const fourth = await prepare(directory, { tracked });
    await fourth.session.finish(true);
    expect(read(directory, 'python/old.py')).toBe('old');
    expect(read(directory, 'python/taken.py')).toBe('taken');
});

test('a failed generation abandons tracked ownership transferred to a physical create-once case alias', async () => {
    const directory = temporaryDirectory();
    const first = await prepare(directory, { tracked });
    await first.files.write('tracked', 'Old.py', 'old');
    await first.session.finish(true);
    try {
        fs.linkSync(path.join(directory, 'python/Old.py'), path.join(directory, 'python/old.py'));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const failed = await prepare(directory, { tracked, user: { ...user, directory: 'python' } });
    await failed.files.write('user', 'old.py', () => 'ignored');
    await expect(failed.files.write('tracked', 'failure.py', () => { throw new Error('render failed'); })).rejects.toThrow('render failed');
    await failed.session.finish(false);
    const next = await prepare(directory, { tracked });
    await next.session.finish(true);
    expect(read(directory, 'python/Old.py')).toBe('old');
    expect(read(directory, 'python/old.py')).toBe('old');
});

test.skipIf(process.platform !== 'linux')('failed create-once generation keeps ownership of a distinct case-sensitive tracked file', async () => {
    const directory = temporaryDirectory();
    const first = await prepare(directory, { tracked });
    await first.files.write('tracked', 'Old.py', 'generated');
    await first.session.finish(true);
    put(directory, 'python/old.py', 'user');
    const failed = await prepare(directory, { tracked, user: { ...user, directory: 'python' } });
    await failed.files.write('user', 'old.py', () => 'ignored');
    await failed.session.finish(false);
    const next = await prepare(directory, { tracked });
    await next.session.finish(true);
    expect(fs.existsSync(path.join(directory, 'python/Old.py'))).toBe(false);
    expect(read(directory, 'python/old.py')).toBe('user');
});

test('changing a tracked output directory preserves its old location', async () => {
    const directory = temporaryDirectory();
    const first = await prepare(directory, { tracked });
    await first.files.write('tracked', 'old.py', 'old');
    await first.session.finish(true);
    const second = await prepare(directory, { tracked: { ...tracked, directory: 'new-python' } });
    await second.session.finish(true);
    expect(read(directory, 'python/old.py')).toBe('old');
});

test('a tracked file taken over by another producer is preserved and acquires its new ownership', async () => {
    const directory = temporaryDirectory();
    const first = await prepare(directory, { tracked });
    await first.files.write('tracked', 'module.py', 'old');
    await first.session.finish(true);
    const second = new GeneratedFileWriter().createSession(directory);
    second.createFiles('test', { tracked });
    const replacement = second.createFiles('replacement', { tracked });
    await second.prepare();
    await replacement.write('tracked', 'module.py', 'new');
    await second.finish(true);
    expect(read(directory, 'python/module.py')).toBe('new');
    const third = new GeneratedFileWriter().createSession(directory);
    third.createFiles('replacement', { tracked });
    await third.prepare();
    await third.finish(true);
    expect(fs.existsSync(path.join(directory, 'python/module.py'))).toBe(false);
});

test('a missing tracked file does not block cleanup when a new expected filename differs only in case', async () => {
    const directory = temporaryDirectory();
    const first = await prepare(directory, { tracked });
    await first.files.write('tracked', 'Old.py', 'old');
    await first.session.finish(true);
    fs.unlinkSync(path.join(directory, 'python/Old.py'));
    const second = await prepare(directory, { tracked });
    await second.files.write('tracked', 'old.py', 'new');
    await second.session.finish(true);
    expect(read(directory, 'python/old.py')).toBe('new');
});

test('duplicate destinations are diagnosed across output names even for existing create-once files', async () => {
    const directory = temporaryDirectory();
    put(directory, 'src/user.cpp', 'user');
    const session = new GeneratedFileWriter().createSession(directory);
    const first = session.createFiles('first', { user });
    const second = session.createFiles('second', { other: user });
    await session.prepare();
    await first.write('user', './user.cpp', 'unused');
    await expect(second.write('other', 'user.cpp', 'unused')).rejects.toThrow('Duplicate generated file');
    await session.finish(false);
});

test.each(['if-changed', 'if-missing'] as const)('checks physical case aliases for %s outputs', async writeMode => {
    const directory = temporaryDirectory();
    put(directory, 'src/A.cpp', 'initial');
    try {
        fs.linkSync(path.join(directory, 'src/A.cpp'), path.join(directory, 'src/a.cpp'));
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    const { session, files } = await prepare(directory, { output: { directory: 'src', writeMode } });
    const renderAlias = vi.fn(() => 'second');
    const results = await Promise.allSettled([
        files.write('output', 'A.cpp', 'first'),
        files.write('output', 'a.cpp', renderAlias),
    ]);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe(process.platform === 'win32' && writeMode === 'if-missing' ? 'fulfilled' : 'rejected');
    if (results[1].status === 'rejected') expect(results[1].reason.message).toContain('Duplicate generated file');
    expect(renderAlias).not.toHaveBeenCalled();
    await session.finish(false);
    expect(read(directory, 'src/A.cpp')).toBe(writeMode === 'if-changed' ? 'first' : 'initial');
});

test('waits for the first spelling to be written before detecting a previously absent alias', async () => {
    const directory = temporaryDirectory();
    const { session, files } = await prepare(directory, { generated });
    const original = fs.promises.writeFile;
    vi.spyOn(fs.promises, 'writeFile').mockImplementation(async (file, content, options) => {
        await original(file, content, options);
        if (String(file) === path.join(directory, 'src-gen/A.cpp')) {
            try {
                await fs.promises.link(file as string, path.join(directory, 'src-gen/a.cpp'));
            } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
            }
        }
    });
    const renderAlias = vi.fn(() => 'second');
    const results = await Promise.allSettled([
        files.write('generated', 'A.cpp', async () => 'first'),
        files.write('generated', 'a.cpp', renderAlias),
    ]);
    expect(results[0].status).toBe('fulfilled');
    expect(results[1].status).toBe('rejected');
    expect(renderAlias).not.toHaveBeenCalled();
    expect(read(directory, 'src-gen/A.cpp')).toBe('first');
    expect((session as unknown as { pendingWrites: Map<string, unknown> }).pendingWrites.size).toBe(0);
    await session.finish(false);
});

test.skipIf(process.platform !== 'linux')('allows distinct case-sensitive output paths while keeping unrelated writes concurrent', async () => {
    const directory = temporaryDirectory();
    const { session, files } = await prepare(directory, { generated });
    let release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    const first = files.write('generated', 'A.cpp', async () => {
        await ready;
        return 'first';
    });
    const second = files.write('generated', 'a.cpp', 'second');
    await files.write('generated', 'unrelated.cpp', () => {
        release();
        return 'unrelated';
    });
    await Promise.all([first, second]);
    await session.finish(true);
    expect(read(directory, 'src-gen/A.cpp')).toBe('first');
    expect(read(directory, 'src-gen/a.cpp')).toBe('second');
    expect(read(directory, 'src-gen/unrelated.cpp')).toBe('unrelated');
});

test('validates policies and overlapping roots before writing', async () => {
    const directory = temporaryDirectory();
    await expect(prepare(directory, { user: { ...user, cleanup: 'directory' } })).rejects.toThrow('Create-once');
    await expect(prepare(directory, { generated, user: { ...user, directory: 'src-gen/user' } })).rejects.toThrow('overlaps');
    await expect(prepare(directory, { generated, user: { ...user, directory: 'SRC-GEN/user' } })).rejects.toThrow('overlaps');
    await expect(prepare(directory, { generated: { ...generated, directory: '.' } })).rejects.toThrow('project root');
    expect(fs.readdirSync(directory)).toEqual([]);
});

test('root-level user output can write outside generated roots but cannot cross into them or metadata', async () => {
    const directory = temporaryDirectory();
    const { session, files } = await prepare(directory, { generated, user: { ...user, directory: '.' } });
    await files.write('user', 'README.md', 'user');
    await expect(files.write('user', 'src-gen/User.cpp', 'bad')).rejects.toThrow('wholly generated');
    await expect(files.write('user', 'SRC-GEN/User.cpp', 'bad')).rejects.toThrow('wholly generated');
    await expect(files.write('user', '.xsmp/generated-files.json', 'bad')).rejects.toThrow('reserved');
    await expect(files.write('user', '.XSMP/generated-files.json', 'bad')).rejects.toThrow('reserved');
    await expect(files.write('user', '../escape.cpp', 'bad')).rejects.toThrow('Invalid generated path');
    await expect(files.write('user', '/absolute.cpp', 'bad')).rejects.toThrow('Invalid generated path');
    await session.finish(false);
    expect(read(directory, 'README.md')).toBe('user');
});

test('reserves metadata directory names regardless of case before any output is written', async () => {
    const directory = temporaryDirectory();
    await expect(prepare(directory, { generated: { ...generated, directory: '.XSMP/cache' } })).rejects.toThrow('reserved');
    expect(fs.readdirSync(directory)).toEqual([]);
});

test('releases an alias group after a failed producer without blocking the next write', async () => {
    const directory = temporaryDirectory();
    const { session, files } = await prepare(directory, { generated });
    const first = files.write('generated', 'A.cpp', async () => { throw new Error('render failed'); });
    const second = files.write('generated', 'a.cpp', 'second');
    const results = await Promise.allSettled([first, second]);
    expect(results[0].status).toBe('rejected');
    if (process.platform === 'win32') {
        expect(results[1].status).toBe('rejected');
    } else {
        expect(results[1].status).toBe('fulfilled');
        expect(read(directory, 'src-gen/a.cpp')).toBe('second');
    }
    expect((session as unknown as { pendingWrites: Map<string, unknown> }).pendingWrites.size).toBe(0);
    await session.finish(false);
});

test('rejects symlinks in generated trees and in mixed-output parents without following them', async () => {
    const directory = temporaryDirectory();
    const outside = temporaryDirectory();
    put(directory, 'src-gen/stale.cpp', 'stale');
    put(outside, 'victim.cpp', 'outside');
    fs.symlinkSync(outside, path.join(directory, 'src-gen/link'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(prepare(directory, { generated })).rejects.toThrow('symbolic link');
    expect(read(outside, 'victim.cpp')).toBe('outside');
    const { session, files } = await prepare(directory, { tracked });
    fs.mkdirSync(path.join(directory, 'python'));
    fs.symlinkSync(outside, path.join(directory, 'python/link'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(files.write('tracked', 'link/victim.cpp', 'bad')).rejects.toThrow('not a directory');
    await session.finish(false);
    expect(read(outside, 'victim.cpp')).toBe('outside');
});

test('cancellation skips rendering and cleanup, and finishing closes the facade', async () => {
    const directory = temporaryDirectory();
    put(directory, 'src-gen/old.cpp', 'old');
    const cancellation = new Cancellation.CancellationTokenSource();
    const { session, files } = await prepare(directory, { generated }, new GeneratedFileWriter(), cancellation.token);
    cancellation.cancel();
    const render = vi.fn(() => 'new');
    await expect(files.write('generated', 'new.cpp', render)).rejects.toBeDefined();
    await session.finish(false);
    expect(render).not.toHaveBeenCalled();
    expect(read(directory, 'src-gen/old.cpp')).toBe('old');
    await expect(files.write('generated', 'later.cpp', 'later')).rejects.toThrow('not open');
    expect(() => session.createFiles('late', {})).toThrow('closed');
});

test('invalid byte edits are detected even when UTF-8 decoding would give the same replacement characters', async () => {
    const directory = temporaryDirectory();
    put(directory, 'src-gen/file.txt', Buffer.from([0xff]));
    const { session, files } = await prepare(directory, { generated });
    await files.write('generated', 'file.txt', '\ufffd');
    await session.finish(true);
    expect(fs.readFileSync(path.join(directory, 'src-gen/file.txt'))).toEqual(Buffer.from('\ufffd'));
});
