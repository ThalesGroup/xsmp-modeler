import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { URI } from 'langium';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { checkGeneratedFolders, removeStaleGeneratedFiles, setClangFormat, type Task } from '@xsmp/core/generator';
import type { XsmpContributionKind } from '../../src/contributions/xsmp-extension-types.js';
import { cleanupProfileGeneratorTestContext, createProfileGeneratorTestContext, parseProfileGeneratorFixture, type ProfileGeneratorTestContext } from '../profile-generator-test-utils.js';

let context: ProfileGeneratorTestContext;

beforeAll(async () => {
    context = await createProfileGeneratorTestContext();
});

afterEach(async () => {
    setClangFormat(true);
    await cleanupProfileGeneratorTestContext(context);
});

describe('Built-in generator output lifecycle', () => {
    test.each<[XsmpContributionKind, string, readonly string[]]>([
        ['tool', 'adoc', ['adoc-gen']],
        ['tool', 'smp', ['smdl-gen']],
        ['tool', 'python', []],
        ['profile', 'xsmp-sdk', ['src-gen']],
        ['profile', 'esa-cdk', ['src-gen']],
        ['profile', 'tas-mdk', ['include-gen', 'src-gen']],
    ])("%s '%s' tracks its outputs and removes stale files after generation", async (kind, name, folders) => {
        setClangFormat(false);
        const catalogue = await parseProfileGeneratorFixture(context);
        const contribution = context.services.shared.ContributionRegistry.resolveContribution(kind, name)?.contribution;
        expect(contribution?.generators.length).toBeGreaterThan(0);

        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-builtin-lifecycle-'));
        context.tempDirs.push(projectDir);
        const folderInodes = new Map<string, number>();
        for (const folder of folders) {
            fs.mkdirSync(path.join(projectDir, folder, 'demo'), { recursive: true });
            fs.writeFileSync(path.join(projectDir, folder, 'Stale.txt'), '');
            fs.writeFileSync(path.join(projectDir, folder, 'demo', 'Stale.txt'), '');
            folderInodes.set(folder, fs.statSync(path.join(projectDir, folder)).ino);
        }
        const userFiles = ['src/User.cpp', 'include/User.h', 'python/user.py', 'helpers/user.py'];
        for (const file of userFiles) {
            const absolute = path.join(projectDir, file);
            fs.mkdirSync(path.dirname(absolute), { recursive: true });
            fs.writeFileSync(absolute, 'user code');
        }
        const projectUri = URI.file(projectDir);
        const outputs = contribution!.generators.map(generator => generator.prepareGeneration(projectUri));
        expect(new Set(outputs.flatMap(output => [...output.folders])))
            .toEqual(new Set(folders.map(folder => path.join(projectDir, folder))));
        await checkGeneratedFolders(outputs);
        const tasks: Task[] = [];
        for (const generator of contribution!.generators) {
            generator.generate(catalogue.parseResult.value, projectUri, task => tasks.push(task));
        }
        expect(tasks.length).toBeGreaterThan(0);
        for (const task of tasks) {
            await task();
        }
        for (const folder of folders) {
            expect(fs.existsSync(path.join(projectDir, folder, 'Stale.txt'))).toBe(true);
        }
        const generated = outputs.flatMap(output => [...output.files]);
        expect(generated.length).toBeGreaterThan(0);
        await removeStaleGeneratedFiles(outputs);
        for (const file of generated) {
            expect(fs.existsSync(file), file).toBe(true);
        }
        for (const folder of folders) {
            expect(fs.existsSync(path.join(projectDir, folder, 'Stale.txt'))).toBe(false);
            expect(fs.existsSync(path.join(projectDir, folder, 'demo', 'Stale.txt'))).toBe(false);
            // The root remains usable when another process holds it on Windows.
            expect(fs.statSync(path.join(projectDir, folder)).ino).toBe(folderInodes.get(folder));
        }
        for (const file of userFiles) {
            expect(fs.readFileSync(path.join(projectDir, file), 'utf8')).toBe('user code');
        }
    });
});
