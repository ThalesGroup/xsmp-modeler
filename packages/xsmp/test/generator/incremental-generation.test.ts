import { Cancellation, type LangiumDocument, URI } from 'langium';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as ast from '@xsmp/core/ast';
import { GeneratedFiles, checkGeneratedFolders, cleanStaleGeneratedFiles, setClangFormat, setGeneratedBy } from '@xsmp/core/generator';
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
    const userFiles = Object.keys(initial).filter(file => /^(src|include|helpers)[/\\]/.test(file));
    for (const file of userFiles) {
        expect(fs.readFileSync(path.join(directory, file), 'utf8')).toBe(initial[file].content);
    }
});

test('retains the union of outputs when generators share an output folder', async () => {
    const directory = temporaryDirectory();
    const folder = path.join(directory, 'src-gen');
    const first = new GeneratedFiles([folder]);
    const second = new GeneratedFiles([folder]);
    await first.write(path.join(folder, 'a.cpp'), 'a');
    await second.write(path.join(folder, 'nested', 'b.cpp'), 'b');
    fs.writeFileSync(path.join(folder, 'stale.cpp'), 'stale');
    await cleanStaleGeneratedFiles([first, second]);
    expect(fs.readdirSync(folder)).toEqual(['a.cpp', 'nested']);
    expect(fs.readFileSync(path.join(folder, 'nested', 'b.cpp'), 'utf8')).toBe('b');
});

test('does not traverse symbolic links in generated folders', async () => {
    const directory = temporaryDirectory();
    const outside = temporaryDirectory();
    fs.writeFileSync(path.join(outside, 'keep.cpp'), 'outside');
    const folder = path.join(directory, 'src-gen');
    fs.symlinkSync(outside, folder, process.platform === 'win32' ? 'junction' : 'dir');
    const outputs = [new GeneratedFiles([folder])];
    await expect(checkGeneratedFolders(outputs)).rejects.toThrow('not a directory');
    await expect(cleanStaleGeneratedFiles(outputs)).rejects.toThrow('not a directory');
    expect(fs.readFileSync(path.join(outside, 'keep.cpp'), 'utf8')).toBe('outside');
});

test('retains outputs written with relative or non-normalized paths', async () => {
    const directory = temporaryDirectory();
    const outputs = new GeneratedFiles([directory]);
    const relative = path.relative(process.cwd(), path.join(directory, 'value.cpp'));
    await outputs.write(`${path.dirname(relative)}${path.sep}.${path.sep}${path.basename(relative)}`, 'generated');
    await cleanStaleGeneratedFiles([outputs]);
    expect(fs.readFileSync(path.join(directory, 'value.cpp'), 'utf8')).toBe('generated');
});

test('recognizes the same file reached with different casing without retaining distinct files', async () => {
    const directory = temporaryDirectory();
    const original = path.join(directory, 'PreviousCase.cpp');
    const requested = path.join(directory, 'previouscase.cpp');
    fs.writeFileSync(original, 'generated');
    // On case-sensitive filesystems, a hard link emulates two spellings of one file.
    const caseSensitive = !fs.existsSync(requested);
    if (caseSensitive) {
        fs.linkSync(original, requested);
    }
    const outputs = new GeneratedFiles([directory]);
    await outputs.write(requested, 'generated');
    await cleanStaleGeneratedFiles([outputs]);
    expect(fs.readFileSync(original, 'utf8')).toBe('generated');
    if (caseSensitive) {
        fs.unlinkSync(original);
        fs.writeFileSync(original, 'distinct stale file');
        await cleanStaleGeneratedFiles([outputs]);
        expect(fs.existsSync(original)).toBe(false);
        expect(fs.readFileSync(requested, 'utf8')).toBe('generated');
    }
});
