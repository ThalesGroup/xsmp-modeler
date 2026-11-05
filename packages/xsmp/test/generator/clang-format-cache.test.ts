import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { Cancellation } from 'langium';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GeneratedFileWriter } from '../../src/generator/generated-files.js';

const state = vi.hoisted(() => ({ version: 'clang-format 20', style: 'IndentWidth: 2', fail: false, failConfiguration: false, calls: [] as string[][] }));
vi.mock('node:child_process', () => ({
    spawn: (_command: string, args: string[]) => {
        state.calls.push(args);
        const child = Object.assign(new EventEmitter(), {
            stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
        });
        let input = '';
        child.stdin.on('data', data => { input += data.toString(); });
        child.stdin.on('finish', () => {
            queueMicrotask(() => {
                if (args.includes('--version')) {
                    child.stdout.write(state.version);
                } else if (args.includes('--dump-config')) {
                    child.stdout.write(state.style);
                } else if (!state.fail) {
                    child.stdout.write(`${state.version}\n${state.style}\n${input}`);
                }
                const failed = state.failConfiguration && args.includes('--dump-config')
                    || state.fail && !args.includes('--version') && !args.includes('--dump-config');
                child.emit('close', failed ? 1 : 0);
            });
        });
        return child;
    },
}));

import { ClangFormatter } from '../../src/generator/cpp/clang-format.js';

beforeEach(() => {
    state.version = 'clang-format 20';
    state.style = 'IndentWidth: 2';
    state.fail = false;
    state.failConfiguration = false;
    state.calls = [];
});

const formattingCalls = () => state.calls.filter(args => !args.includes('--version') && !args.includes('--dump-config'));

let directory: string;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-format-reuse-')); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(directory, { recursive: true, force: true }); });

async function generate(writer: GeneratedFileWriter, sources: Record<string, string>, project = directory): Promise<void> {
    const session = writer.createSession(project, Cancellation.CancellationToken.None);
    const files = session.createFiles('cpp', {
        generated: { directory: 'src-gen', writeMode: 'if-changed', cleanup: 'directory', formatter: new ClangFormatter() },
    });
    await session.prepare();
    // Same bounded batches as a generator task queue, without retaining rendered results.
    const entries = Object.entries(sources);
    for (let offset = 0; offset < entries.length; offset += 8) {
        await Promise.all(entries.slice(offset, offset + 8).map(([file, source]) => files.write('generated', file, source)));
    }
    await session.finish(true);
}

test('skips formatting and writing unchanged disk bytes while resolving configuration each generation', async () => {
    const writer = new GeneratedFileWriter();
    const sources = { 'a.cpp': 'int a;', 'b.cpp': 'int b;', 'a.h': 'int a;' };
    await generate(writer, sources);
    expect(formattingCalls()).toHaveLength(3);
    state.calls = [];
    const read = vi.spyOn(fs.promises, 'readFile');
    const write = vi.spyOn(fs.promises, 'writeFile');
    await generate(writer, sources);
    expect(formattingCalls()).toHaveLength(0);
    expect(write).not.toHaveBeenCalled();
    for (const file of Object.keys(sources)) {
        expect(read.mock.calls.filter(args => args[0] === path.join(directory, 'src-gen', file))).toHaveLength(1);
    }
    expect(state.calls.filter(args => args.includes('--version'))).toHaveLength(1);
    expect(state.calls.filter(args => args.includes('--dump-config'))).toHaveLength(2);
});

test('reformats changed raw source, effective configuration, version and destination', async () => {
    const writer = new GeneratedFileWriter();
    await generate(writer, { 'a.cpp': 'int value;' });
    await generate(writer, { 'a.cpp': 'double value;' });
    state.style = 'IndentWidth: 4';
    await generate(writer, { 'a.cpp': 'double value;' });
    expect(fs.readFileSync(path.join(directory, 'src-gen/a.cpp'), 'utf8')).toContain('IndentWidth: 4');
    state.version = 'clang-format 21';
    await generate(writer, { 'a.cpp': 'double value;' });
    expect(fs.readFileSync(path.join(directory, 'src-gen/a.cpp'), 'utf8')).toContain('clang-format 21');
    await generate(writer, { 'b.cpp': 'double value;' });
    expect(formattingCalls()).toHaveLength(5);
});

test('repairs an edited or deleted output even when size and modification time are unchanged', async () => {
    const writer = new GeneratedFileWriter();
    const sources = { 'a.cpp': 'int value;' };
    await generate(writer, sources);
    const file = path.join(directory, 'src-gen/a.cpp');
    const initial = fs.readFileSync(file);
    // Warm the cache with a fixed timestamp, then change only the file's bytes.
    const timestamp = new Date('2020-01-01T00:00:00Z');
    fs.utimesSync(file, timestamp, timestamp);
    await generate(writer, sources);
    fs.writeFileSync(file, Buffer.alloc(initial.length, 0xff));
    fs.utimesSync(file, timestamp, timestamp);
    await generate(writer, sources);
    expect(fs.readFileSync(file)).toEqual(initial);
    fs.unlinkSync(file);
    await generate(writer, sources);
    expect(fs.readFileSync(file)).toEqual(initial);
    expect(formattingCalls()).toHaveLength(3);
});

test('does not cache raw fallbacks after a formatter failure', async () => {
    const writer = new GeneratedFileWriter();
    const sources = { 'a.cpp': 'int value;' };
    state.fail = true;
    await generate(writer, sources);
    await generate(writer, sources);
    expect(fs.readFileSync(path.join(directory, 'src-gen/a.cpp'), 'utf8')).toBe('int value;');
    state.fail = false;
    await generate(writer, sources);
    await generate(writer, sources);
    expect(formattingCalls()).toHaveLength(3);
    expect(fs.readFileSync(path.join(directory, 'src-gen/a.cpp'), 'utf8')).toContain('clang-format 20');
});

test('formats without reuse when configuration discovery is unavailable', async () => {
    const writer = new GeneratedFileWriter();
    const sources = { 'a.cpp': 'int value;' };
    state.failConfiguration = true;
    await generate(writer, sources);
    await generate(writer, sources);
    state.failConfiguration = false;
    await generate(writer, sources);
    await generate(writer, sources);
    expect(formattingCalls()).toHaveLength(3);
});

test('reuses hashes across projects A, B, then A', async () => {
    const writer = new GeneratedFileWriter();
    const sources = { 'a.cpp': 'int value;' };
    await generate(writer, sources, path.join(directory, 'A'));
    await generate(writer, sources, path.join(directory, 'B'));
    state.calls = [];
    await generate(writer, sources, path.join(directory, 'A'));
    expect(formattingCalls()).toHaveLength(0);
});

test('reuses all 4200 unchanged outputs beyond the old formatted-text cache limit', async () => {
    const writer = new GeneratedFileWriter();
    const sources = Object.fromEntries(Array.from({ length: 4200 }, (_, index) => [`type${index}.cpp`, `int value${index};`]));
    await generate(writer, sources);
    expect(formattingCalls()).toHaveLength(4200);
    state.calls = [];
    await generate(writer, sources);
    expect(formattingCalls()).toHaveLength(0);
}, 30_000);
