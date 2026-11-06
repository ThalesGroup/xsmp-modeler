import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { URI } from 'langium';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCli } from '@xsmp/cli';
import { CliFileSystemProvider } from '../src/file-system.js';

let directory: string;
const provider = new CliFileSystemProvider();

beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-cli-utf8-'));
});

afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
});

describe('CLI source encoding', () => {
    test.each(['', '\uFEFFModèle 😀 \uFFFD'])('preserves valid UTF-8, including BOM and replacement characters (%j)', async text => {
        const uri = URI.file(path.join(directory, 'source.xsmpcat'));
        fs.writeFileSync(uri.fsPath, text);

        expect(await provider.readFile(uri)).toBe(text);
        expect(provider.readFileSync(uri)).toBe(text);
    });

    test.each([
        ['Latin-1', [0x4d, 0x6f, 0x64, 0xe8, 0x6c, 0x65]],
        ['truncated multibyte character', [0xe2, 0x82]],
        ['overlong encoding', [0xc0, 0xaf]],
    ])('rejects %s in asynchronous and synchronous reads', async (_name, bytes) => {
        const uri = URI.file(path.join(directory, 'source.xsmpcat'));
        fs.writeFileSync(uri.fsPath, Buffer.from(bytes));

        await expect(provider.readFile(uri)).rejects.toThrow(`File '${uri.fsPath}' is not valid UTF-8`);
        expect(() => provider.readFileSync(uri)).toThrow(`File '${uri.fsPath}' is not valid UTF-8`);
    });

    test('preserves I/O errors', async () => {
        const uri = URI.file(path.join(directory, 'missing.xsmpcat'));

        await expect(provider.readFile(uri)).rejects.toMatchObject({ code: 'ENOENT' });
        expect(() => provider.readFileSync(uri)).toThrow(/ENOENT/);
    });

    test.each(['validate', 'generate'])('%s rejects invalid source bytes before changing outputs', async command => {
        fs.mkdirSync(path.join(directory, 'src'));
        fs.mkdirSync(path.join(directory, 'adoc-gen'));
        fs.writeFileSync(path.join(directory, 'xsmp.project'), 'project "Utf8"\nsource "src"\ntool "adoc"\n');
        const source = path.join(directory, 'src/Utf8.xsmpcat');
        fs.writeFileSync(source, Buffer.from('catalogue Utf8\n/** Modèle */', 'latin1'));
        fs.writeFileSync(path.join(directory, 'adoc-gen/existing.adoc'), 'previous generation');
        let stderr = '';
        const code = await runCli(['node', 'xsmp', command, directory, '--workspace-root', directory], {
            stdout: () => undefined,
            stderr: text => { stderr += text; },
        });

        expect(code).toBe(2);
        expect(stderr).toContain(`File '${URI.file(source).fsPath}' is not valid UTF-8`);
        expect(fs.readdirSync(path.join(directory, 'adoc-gen'))).toEqual(['existing.adoc']);
        expect(fs.readFileSync(path.join(directory, 'adoc-gen/existing.adoc'), 'utf8')).toBe('previous generation');
    });

    test('rejects an invalid project file', async () => {
        const project = path.join(directory, 'xsmp.project');
        fs.writeFileSync(project, Buffer.from('project "Utf8"\n// café', 'latin1'));
        let stderr = '';
        const code = await runCli(['node', 'xsmp', 'validate', directory, '--workspace-root', directory], {
            stdout: () => undefined,
            stderr: text => { stderr += text; },
        });

        expect(code).toBe(2);
        expect(stderr).toContain(`File '${URI.file(project).fsPath}' is not valid UTF-8`);
    });

    test('generates valid Unicode documentation from a source with a BOM', async () => {
        fs.mkdirSync(path.join(directory, 'src'));
        fs.writeFileSync(path.join(directory, 'xsmp.project'), 'project "Utf8"\nsource "src"\ntool "adoc"\n');
        fs.writeFileSync(path.join(directory, 'src/Utf8.xsmpcat'), `\uFEFFcatalogue Utf8
namespace unicode {
    /** Modèle 😀 \uFFFD
     * @uuid af345678-0000-4000-8000-000000000001 */
    public struct Data { field Int32 value }
}`);
        let stderr = '';
        const code = await runCli(['node', 'xsmp', 'generate', directory, '--workspace-root', directory], {
            stdout: () => undefined,
            stderr: text => { stderr += text; },
        });

        expect(stderr).toBe('');
        expect(code).toBe(0);
        expect(fs.readFileSync(path.join(directory, 'adoc-gen/Utf8-gen.adoc'), 'utf8')).toContain('Modèle 😀 \uFFFD');
    });
});
