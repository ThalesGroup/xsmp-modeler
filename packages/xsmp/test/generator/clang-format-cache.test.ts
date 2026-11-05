import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { beforeEach, expect, test, vi } from 'vitest';

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

test('reuses unchanged formatting while checking the actual configuration and tool version each generation', async () => {
    const formatter = new ClangFormatter();
    const files = ['/workspace/src-gen/a.cpp', '/workspace/src-gen/b.cpp', '/workspace/src-gen/a.h'];
    const initial = await Promise.all(files.map(file => formatter.format(file, 'int value;')));
    expect(formattingCalls()).toHaveLength(3);
    formatter.beginGeneration();
    state.calls = [];
    expect(await Promise.all(files.map(file => formatter.format(file, 'int value;')))).toEqual(initial);
    expect(formattingCalls()).toHaveLength(0);
    expect(state.calls.filter(args => args.includes('--version'))).toHaveLength(1);
    expect(state.calls.filter(args => args.includes('--dump-config'))).toHaveLength(2);
});

test('invalidates changed source, effective configuration, version and filename', async () => {
    const formatter = new ClangFormatter();
    await formatter.format('/workspace/src-gen/a.cpp', 'int value;');
    formatter.beginGeneration();
    await formatter.format('/workspace/src-gen/a.cpp', 'double value;');
    formatter.beginGeneration();
    state.style = 'IndentWidth: 4';
    expect(await formatter.format('/workspace/src-gen/a.cpp', 'double value;')).toContain('IndentWidth: 4');
    formatter.beginGeneration();
    state.version = 'clang-format 21';
    expect(await formatter.format('/workspace/src-gen/a.cpp', 'double value;')).toContain('clang-format 21');
    formatter.beginGeneration();
    await formatter.format('/workspace/src-gen/b.cpp', 'double value;');
    expect(formattingCalls()).toHaveLength(5);
});

test('does not reuse a formatting failure or retain paths absent from the previous generation', async () => {
    const formatter = new ClangFormatter();
    state.fail = true;
    expect(await formatter.format('/workspace/a.cpp', 'int value;')).toBe('int value;');
    state.fail = false;
    formatter.beginGeneration();
    expect(await formatter.format('/workspace/a.cpp', 'int value;')).not.toBe('int value;');
    formatter.beginGeneration();
    await formatter.format('/workspace/b.cpp', 'int other;');
    formatter.beginGeneration();
    await formatter.format('/workspace/a.cpp', 'int value;');
    expect(formattingCalls()).toHaveLength(4);
});


test('keeps ordinary formatting when configuration discovery fails and does not cache that result', async () => {
    const formatter = new ClangFormatter();
    state.failConfiguration = true;
    expect(await formatter.format('/workspace/a.cpp', 'int value;')).not.toBe('int value;');
    formatter.beginGeneration();
    state.failConfiguration = false;
    await formatter.format('/workspace/a.cpp', 'int value;');
    expect(formattingCalls()).toHaveLength(2);
    formatter.beginGeneration();
    await formatter.format('/workspace/a.cpp', 'int value;');
    expect(formattingCalls()).toHaveLength(2);
});
