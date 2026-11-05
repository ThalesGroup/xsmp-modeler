import { Cancellation, type LangiumDocument, URI } from 'langium';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as ast from '@xsmp/core/ast';
import { GeneratedFileWriter, setClangFormat, setGeneratedBy } from '@xsmp/core/generator';
import { createProfileGeneratorTestContext, cleanupProfileGeneratorTestContext, type ProfileGeneratorTestContext } from '../profile-generator-test-utils.js';
import { rebuildTestDocuments } from '../test-services.js';

let context: ProfileGeneratorTestContext;
beforeAll(async () => { context = await createProfileGeneratorTestContext(); });
afterEach(async () => {
    vi.restoreAllMocks();
    setClangFormat(true);
    setGeneratedBy(true);
    await cleanupProfileGeneratorTestContext(context);
});

function temporaryDirectory(): string {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-incremental-generation-'));
    context.tempDirs.push(directory);
    return directory;
}

function snapshot(directory: string): Record<string, { content: string; mtime: number }> {
    const result: Record<string, { content: string; mtime: number }> = {};
    for (const file of fs.readdirSync(directory, { recursive: true, withFileTypes: true })) {
        if (file.isFile()) {
            const absolute = path.join(file.parentPath, file.name);
            result[path.relative(directory, absolute)] = { content: fs.readFileSync(absolute, 'utf8'), mtime: fs.statSync(absolute).mtimeMs };
        }
    }
    return result;
}

const catalogueSource = `catalogue Incremental
namespace demo {
    /** @uuid e6b40930-47b7-4a51-baf9-fc0b9298c4da */
    public struct Value { field Smp.Int32 number = 7 }
    /** @uuid c5ccf47a-e2a2-4d24-9643-2dc9292d6a85 */
    public model Root { field Value value }
}`;

async function fixture(profile: string): Promise<{ directory: string; project: ast.Project; catalogue: LangiumDocument<ast.Catalogue> }> {
    const directory = temporaryDirectory();
    fs.mkdirSync(path.join(directory, 'src'));
    const project = await context.parseProject(`project 'incremental' using 'ECSS_SMP_2025'\nsource 'src'\nprofile '${profile}'\ntool 'smp'\ntool 'adoc'\ntool 'python'`, {
        documentUri: URI.file(path.join(directory, 'xsmp.project')).toString(),
    });
    const source = profile === 'tas-mdk'
        ? catalogueSource.replace('public model Root', 'public model Root extends TasMdk.Model')
            .replace('field Value value', '/** Value. */ field Value sta_value')
            + '\nnamespace TasMdk { /** @uuid 791a9f69-394b-4d08-9a33-35881a411183 */ public model Model {} }'
        : catalogueSource;
    const catalogue = await context.parseCatalogue(source, {
        documentUri: URI.file(path.join(directory, 'src', 'Incremental.xsmpcat')).toString(),
    });
    context.documents.push(project, catalogue);
    await rebuildTestDocuments(context.services, [project, catalogue]);
    expect(project.diagnostics?.filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
    expect(catalogue.diagnostics?.filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
    return { directory, project: project.parseResult.value, catalogue };
}

test.each(['xsmp-sdk', 'tas-mdk'])('%s preserves every unchanged output and removes obsolete generated types', async profile => {
    setClangFormat(false);
    setGeneratedBy(false);
    const { directory, project, catalogue } = await fixture(profile);
    const generator = context.services.shared.DocumentGenerator;
    await generator.generateProject(project, Cancellation.CancellationToken.None);
    const initial = snapshot(directory);
    expect(Object.keys(initial).some(file => file.endsWith('Value.cpp'))).toBe(true);
    const writes = vi.spyOn(fs.promises, 'writeFile');
    await generator.generateProject(project, Cancellation.CancellationToken.None);
    expect(snapshot(directory)).toEqual(initial);
    expect(writes).not.toHaveBeenCalled();

    const source = path.join(directory, 'src-gen', 'demo', 'Value.cpp');
    fs.writeFileSync(source, 'an external edit');
    await generator.generateProject(project, Cancellation.CancellationToken.None);
    expect(fs.readFileSync(source, 'utf8')).toBe(initial[path.relative(directory, source)].content);
    expect(writes).toHaveBeenCalledTimes(1);
    fs.unlinkSync(source);
    await generator.generateProject(project, Cancellation.CancellationToken.None);
    expect(fs.readFileSync(source, 'utf8')).toBe(initial[path.relative(directory, source)].content);

    const diagnostics = catalogue.diagnostics;
    catalogue.diagnostics = [{ severity: 1, message: 'Invalid input', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } }];
    const beforeInvalidGeneration = snapshot(directory);
    await generator.generateProject(project, Cancellation.CancellationToken.None);
    expect(snapshot(directory)).toEqual(beforeInvalidGeneration);
    catalogue.diagnostics = diagnostics;

    // Remove declarations while retaining generation-gap files owned by the user.
    catalogue.parseResult.value.elements[0].elements = [];
    await rebuildTestDocuments(context.services, [catalogue]);
    await generator.generateProject(project, Cancellation.CancellationToken.None);
    const generated = Object.keys(snapshot(directory)).filter(file => file.startsWith('src-gen') || file.startsWith('include-gen'));
    expect(generated.some(file => file.includes('Value.') || file.includes('RootGen.'))).toBe(false);
    // Generation-gap user files and TAS helper user code are never stale-output candidates.
    const userFiles = Object.keys(initial).filter(file => /^(src|include|helpers)[/\\]/.test(file) && !/generated_(info|icd)\.py$/.test(file));
    for (const file of userFiles) {
        expect(fs.readFileSync(path.join(directory, file), 'utf8')).toBe(initial[file].content);
    }
});

test.each(['xsmp-sdk', 'tas-mdk'])('%s repairs disk changes with warm services and after restarting without startup generation', async profile => {
    setClangFormat(false);
    const { directory, project, catalogue } = await fixture(profile);
    await context.services.shared.DocumentGenerator.generateProject(project, Cancellation.CancellationToken.None);
    const original = snapshot(directory);
    const generatedFolders = ['src-gen', 'smdl-gen', 'adoc-gen', ...(profile === 'tas-mdk' ? ['include-gen'] : [])];
    const userFiles = ['src/User.cpp', 'include/User.h', 'python/user.py', 'helpers/user.py'];
    for (const file of userFiles) {
        fs.mkdirSync(path.dirname(path.join(directory, file)), { recursive: true });
        fs.writeFileSync(path.join(directory, file), 'user code');
    }
    const modifyDisk = () => {
        fs.writeFileSync(path.join(directory, 'src-gen/demo/Value.cpp'), 'externally edited');
        fs.unlinkSync(path.join(directory, profile === 'tas-mdk' ? 'include-gen/demo/Value.h' : 'src-gen/demo/Value.h'));
        for (const folder of generatedFolders) {
            fs.mkdirSync(path.join(directory, folder, 'unexpected/deep'), { recursive: true });
            fs.writeFileSync(path.join(directory, folder, 'unexpected/deep/Added.txt'), 'external addition');
            fs.mkdirSync(path.join(directory, folder, 'empty/nested'), { recursive: true });
        }
    };
    const expectRepaired = () => {
        for (const [file, value] of Object.entries(original)) {
            expect(fs.readFileSync(path.join(directory, file), 'utf8'), file).toBe(value.content);
        }
        for (const folder of generatedFolders) {
            expect(fs.existsSync(path.join(directory, folder, 'unexpected'))).toBe(false);
            expect(fs.existsSync(path.join(directory, folder, 'empty'))).toBe(false);
        }
        for (const file of userFiles) {
            expect(fs.readFileSync(path.join(directory, file), 'utf8')).toBe('user code');
        }
    };
    modifyDisk();
    await context.services.shared.DocumentGenerator.generateProject(project, Cancellation.CancellationToken.None);
    expectRepaired();

    const restarted = await createProfileGeneratorTestContext();
    try {
        const projectDocument = await restarted.parseProject(project.$document!.textDocument.getText(), {
            documentUri: project.$document!.uri.toString(),
        });
        const catalogueDocument = await restarted.parseCatalogue(catalogue.textDocument.getText(), {
            documentUri: catalogue.uri.toString(),
        });
        restarted.documents.push(projectDocument, catalogueDocument);
        await rebuildTestDocuments(restarted.services, restarted.documents);
        // No generation has run in these services: only the current disk and model are available.
        modifyDisk();
        await restarted.services.shared.DocumentGenerator.generateProject(projectDocument.parseResult.value, Cancellation.CancellationToken.None);
        expectRepaired();
    } finally {
        await cleanupProfileGeneratorTestContext(restarted);
    }
});

test('retains the union of outputs when generators share an output folder', async () => {
    const directory = temporaryDirectory();
    const folder = path.join(directory, 'src-gen');
    const session = new GeneratedFileWriter().createSession(directory, Cancellation.CancellationToken.None);
    const definition = { generated: { directory: 'src-gen', writeMode: 'if-changed', cleanup: 'directory' } } as const;
    const first = session.createFiles('first', definition);
    const second = session.createFiles('second', definition);
    await session.prepare();
    await first.write('generated', 'a.cpp', 'a');
    await second.write('generated', 'nested/b.cpp', 'b');
    fs.writeFileSync(path.join(folder, 'stale.cpp'), 'stale');
    await session.finish(true);
    expect(fs.readdirSync(folder)).toEqual(['a.cpp', 'nested']);
    expect(fs.readFileSync(path.join(folder, 'nested', 'b.cpp'), 'utf8')).toBe('b');
});

test('does not traverse symbolic links in generated folders', async () => {
    const directory = temporaryDirectory();
    const outside = temporaryDirectory();
    fs.writeFileSync(path.join(outside, 'keep.cpp'), 'outside');
    fs.symlinkSync(outside, path.join(directory, 'src-gen'), process.platform === 'win32' ? 'junction' : 'dir');
    const session = new GeneratedFileWriter().createSession(directory, Cancellation.CancellationToken.None);
    session.createFiles('test', { generated: { directory: 'src-gen', writeMode: 'if-changed', cleanup: 'directory' } });
    await expect(session.prepare()).rejects.toThrow();
    await session.finish(false);
    expect(fs.readFileSync(path.join(outside, 'keep.cpp'), 'utf8')).toBe('outside');
});

test('retains outputs written with non-normalized relative paths', async () => {
    const directory = temporaryDirectory();
    const session = new GeneratedFileWriter().createSession(directory, Cancellation.CancellationToken.None);
    const files = session.createFiles('test', { generated: { directory: 'src-gen', writeMode: 'if-changed', cleanup: 'directory' } });
    await session.prepare();
    await files.write('generated', './value.cpp', 'generated');
    await session.finish(true);
    expect(fs.readFileSync(path.join(directory, 'src-gen/value.cpp'), 'utf8')).toBe('generated');
});

test('recognizes the same file reached with different casing without retaining distinct files', async () => {
    const project = temporaryDirectory();
    const directory = path.join(project, 'src-gen');
    fs.mkdirSync(directory);
    const original = path.join(directory, 'PreviousCase.cpp');
    const requested = path.join(directory, 'previouscase.cpp');
    fs.writeFileSync(original, 'generated');
    const caseSensitive = !fs.existsSync(requested);
    if (caseSensitive) fs.linkSync(original, requested);
    const writer = new GeneratedFileWriter();
    const generate = async () => {
        const session = writer.createSession(project, Cancellation.CancellationToken.None);
        const files = session.createFiles('test', { generated: { directory: 'src-gen', writeMode: 'if-changed', cleanup: 'directory' } });
        await session.prepare();
        await files.write('generated', 'previouscase.cpp', 'generated');
        await session.finish(true);
    };
    await generate();
    expect(fs.readFileSync(original, 'utf8')).toBe('generated');
    if (caseSensitive) {
        fs.unlinkSync(original);
        fs.writeFileSync(original, 'distinct stale file');
        await generate();
        expect(fs.existsSync(original)).toBe(false);
        expect(fs.readFileSync(requested, 'utf8')).toBe('generated');
    }
});
