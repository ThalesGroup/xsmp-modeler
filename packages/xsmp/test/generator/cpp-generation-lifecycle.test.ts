import { Cancellation, URI } from 'langium';
import { afterEach, beforeAll, expect, test, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GeneratedFileWriter, setClangFormat, setGeneratedBy, type Task, type XsmpGenerator } from '@xsmp/core/generator';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { EsaCdkGenerator } from '@xsmp/profile-esa-cdk';
import { TasMdkGenerator } from 'xsmp-tas-mdk';
import {
    cleanupProfileGeneratorTestContext,
    createProfileGeneratorTestContext,
    generateProfileTree,
    parseProfileGeneratorFixture,
    type ProfileGeneratorTestContext,
} from '../profile-generator-test-utils.js';

let context: ProfileGeneratorTestContext;

beforeAll(async () => {
    context = await createProfileGeneratorTestContext();
});

afterEach(async () => {
    vi.restoreAllMocks();
    setClangFormat(true);
    setGeneratedBy(true);
    await cleanupProfileGeneratorTestContext(context);
});

test.each([XsmpSdkGenerator, EsaCdkGenerator, TasMdkGenerator])('%s does not render existing user files or create absent optional sources', async Generator => {
    const document = await parseProfileGeneratorFixture(context);
    const generator = new Generator(context.services.shared);
    setClangFormat(false);
    setGeneratedBy(false);
    const output = await generateProfileTree(context, generator, document, 'cpp-lazy-user-files-');
    const headers = vi.spyOn(generator, 'generateComponentHeader');
    const sources = vi.spyOn(generator, 'generateComponentSource');
    const { session, files, tasks, generationContext } = await prepare(generator, output);
    const writes = vi.spyOn(files, 'write');
    generator.generate(document.parseResult.value, generationContext);
    for (const task of tasks) await task();
    await session.finish(true);
    expect(headers).not.toHaveBeenCalled();
    expect(sources).not.toHaveBeenCalled();
    expect(writes).toHaveBeenCalledWith('userInclude', 'demo/support/RootModel.h', expect.any(Function));
    expect(writes).toHaveBeenCalledWith('userSource', 'demo/support/RootModel.cpp', expect.any(Function));
    // An empty class/exception body and types without a user source stay absent.
    for (const name of ['DeviceError', 'IDevice', 'Counter', 'Payload']) {
        expect(fs.existsSync(path.join(output, 'src', 'demo', 'support', name + '.cpp'))).toBe(false);
    }
});

test('an optional user source disappearing during generation is not replaced with an empty file', async () => {
    const document = await parseProfileGeneratorFixture(context);
    const generator = new XsmpSdkGenerator(context.services.shared);
    setClangFormat(false);
    setGeneratedBy(false);
    const output = await generateProfileTree(context, generator, document, 'cpp-optional-user-source-');
    const relative = 'demo/support/DeviceError.cpp';
    const source = path.join(output, 'src', relative);
    fs.writeFileSync(source, '// user source');
    const { session, files, tasks, generationContext } = await prepare(generator, output);
    const write = files.write.bind(files);
    vi.spyOn(files, 'write').mockImplementation(async (name, relativePath, content) => {
        if (name === 'userSource' && relativePath === relative) {
            fs.unlinkSync(source);
        }
        await write(name, relativePath, content);
    });
    generator.generate(document.parseResult.value, generationContext);
    const results = await Promise.allSettled(tasks.map(task => task()));
    await session.finish(false);
    const failures = results.filter(result => result.status === 'rejected');
    expect(failures).toHaveLength(1);
    expect(failures[0].reason.message).toContain('Optional user file disappeared during generation');
    expect(fs.existsSync(source)).toBe(false);
});

test('preparing another project does not redirect already accepted C++ generation tasks', async () => {
    const document = await parseProfileGeneratorFixture(context);
    const generator = new XsmpSdkGenerator(context.services.shared);
    const writer = new GeneratedFileWriter();
    const cancelToken = Cancellation.CancellationToken.None;
    setClangFormat(false);
    setGeneratedBy(false);

    const pending = [];
    for (let index = 0; index < 2; index++) {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cpp-session-'));
        context.tempDirs.push(directory);
        const projectUri = URI.file(directory);
        const session = writer.createSession(directory);
        const files = generator.prepare({ projectUri, cancelToken, createFiles: definitions => session.createFiles(generator.id, definitions) });
        await session.prepare();
        const tasks: Task[] = [];
        generator.generate(document.parseResult.value, { projectUri, cancelToken, files, acceptTask: task => tasks.push(task) });
        pending.push({ directory, session, tasks });
    }
    for (const { session, tasks } of pending) {
        for (const task of tasks) await task();
        await session.finish(true);
    }
    for (const { directory } of pending) {
        expect(fs.readFileSync(path.join(directory, 'src-gen', 'ProfileGenerators.h'), 'utf8')).toContain('Initialise_ProfileGenerators');
        expect(fs.readFileSync(path.join(directory, 'src', 'demo', 'support', 'RootModel.cpp'), 'utf8')).toContain('RootModel::DoPublish');
    }
});

async function prepare(generator: XsmpGenerator, directory: string) {
    const projectUri = URI.file(directory);
    const cancelToken = Cancellation.CancellationToken.None;
    const session = new GeneratedFileWriter().createSession(directory, cancelToken);
    const files = generator.prepare({ projectUri, cancelToken, createFiles: definitions => session.createFiles(generator.id, definitions) });
    await session.prepare();
    const tasks: Task[] = [];
    return { session, files, tasks, generationContext: { projectUri, cancelToken, files, acceptTask: (task: Task) => tasks.push(task) } };
}
