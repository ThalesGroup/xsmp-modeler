import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanGeneratedFolders } from '../../src/generator/generated-folder.js';

// Entries that cannot be removed, like a file locked by another process on Windows.
const lockedEntries = new Map<string, Error>();
const rm = fs.promises.rm;
let tempDir: string;

beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-generated-folder-'));
    vi.spyOn(fs.promises, 'rm').mockImplementation(async (target, options) => {
        const error = lockedEntries.get(String(target));
        if (error) {
            throw error;
        }
        await rm(target, options);
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    lockedEntries.clear();
    fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('cleanGeneratedFolders', () => {
    test('removes the generated content but keeps the folders', async () => {
        const includeGen = createFolder('include-gen', ['demo/Model.h', 'demo.h']);
        const srcGen = createFolder('src-gen', ['demo/Model.cpp']);
        const includeGenInode = fs.statSync(includeGen).ino;

        await cleanGeneratedFolders(includeGen, srcGen);

        expect(fs.readdirSync(includeGen)).toEqual([]);
        expect(fs.readdirSync(srcGen)).toEqual([]);
        expect(fs.statSync(includeGen).ino).toBe(includeGenInode);
    });

    test('ignores missing folders', async () => {
        const adocGen = path.join(tempDir, 'adoc-gen');

        await cleanGeneratedFolders(adocGen);

        expect(fs.existsSync(adocGen)).toBe(false);
    });

    test('removes a file found where a folder is expected', async () => {
        const smdlGen = path.join(tempDir, 'smdl-gen');
        fs.writeFileSync(smdlGen, '');

        await cleanGeneratedFolders(smdlGen);

        expect(fs.existsSync(smdlGen)).toBe(false);
    });

    test('removes every other entry before rethrowing the failure of a locked one', async () => {
        const adocGen = createFolder('adoc-gen', ['Locked-gen.adoc', 'Demo-gen.adoc']);
        const smdlGen = createFolder('smdl-gen', ['demo.smpcat']);
        const failure = lock(path.join(adocGen, 'Locked-gen.adoc'));

        await expect(cleanGeneratedFolders(adocGen, smdlGen)).rejects.toBe(failure);
        expect(fs.readdirSync(adocGen)).toEqual(['Locked-gen.adoc']);
        expect(fs.readdirSync(smdlGen)).toEqual([]);
    });

    test('reports every failure', async () => {
        const adocGen = createFolder('adoc-gen', ['First-gen.adoc', 'Second-gen.adoc']);
        const first = lock(path.join(adocGen, 'First-gen.adoc'));
        const second = lock(path.join(adocGen, 'Second-gen.adoc'));

        const thrown = await cleanGeneratedFolders(adocGen).catch((error: unknown) => error);

        expect(thrown).toBeInstanceOf(AggregateError);
        expect((thrown as AggregateError).errors).toHaveLength(2);
        expect((thrown as AggregateError).errors).toEqual(expect.arrayContaining([first, second]));
    });
});

function createFolder(name: string, files: readonly string[]): string {
    const folder = path.join(tempDir, name);
    fs.mkdirSync(folder, { recursive: true });
    for (const file of files) {
        const filePath = path.join(folder, file);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, '');
    }
    return folder;
}

function lock(entryPath: string): Error {
    const error = Object.assign(new Error(`EBUSY: resource busy or locked, unlink '${entryPath}'`), { code: 'EBUSY' });
    lockedEntries.set(entryPath, error);
    return error;
}
