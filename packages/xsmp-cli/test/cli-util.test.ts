import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const readlineState = vi.hoisted(() => ({
    close: vi.fn(),
    question: vi.fn(),
}));

vi.mock('node:readline/promises', () => ({
    createInterface: () => readlineState,
}));

import { createConsoleIo } from '../src/cli-util.js';

beforeEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
    Object.defineProperty(process.stdout, 'isTTY', { configurable: true, value: true });
});

afterEach(() => {
    readlineState.close.mockReset();
    readlineState.question.mockReset();
    Reflect.deleteProperty(process.stdin, 'isTTY');
    Reflect.deleteProperty(process.stdout, 'isTTY');
});

describe('console CLI prompts', () => {
    test('preserves an empty input when no default is defined', async () => {
        readlineState.question.mockResolvedValueOnce('');
        const io = createConsoleIo();

        await expect(io.prompt?.({
            type: 'input',
            message: 'Project name',
        })).resolves.toBe('');
        expect(readlineState.close).toHaveBeenCalledOnce();
    });

    test('uses the input default when the answer is empty', async () => {
        readlineState.question.mockResolvedValueOnce('');
        const io = createConsoleIo();

        await expect(io.prompt?.({
            type: 'input',
            message: 'Parent directory',
            defaultValue: '/workspace',
        })).resolves.toBe('/workspace');
        expect(readlineState.close).toHaveBeenCalledOnce();
    });
});
