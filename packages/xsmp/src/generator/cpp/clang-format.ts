import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as path from 'node:path';
import type { FileFormatter, PreparedFileFormatter } from '../generated-files.js';

const clangFormatCommand = process.platform.startsWith('win') ? 'clang-format.exe' : 'clang-format';

/** One generation's formatter configuration. Output hashes belong to the shared writer. */
export class ClangFormatter implements FileFormatter {
    private readonly configurations = new Map<string, Promise<string | undefined>>();
    private version: Promise<string | undefined> | undefined;

    async prepare(file: string): Promise<PreparedFileFormatter> {
        const version = await (this.version ??= run(['--version']));
        if (version === undefined) {
            return { format: async () => undefined };
        }
        // Directory controls style lookup; extension controls clang-format's language.
        // Resolve the effective style once per directory/language in this generation.
        const key = path.join(path.dirname(file), path.extname(file));
        let configuration = this.configurations.get(key);
        if (!configuration) {
            configuration = run(['--dump-config', `--assume-filename=${file}`]).then(value =>
                value === undefined ? undefined : createHash('sha256').update(value).digest('hex'));
            if (this.configurations.size < 4096) {
                this.configurations.set(key, configuration);
            }
        }
        const configurationHash = await configuration;
        return {
            cacheKey: configurationHash === undefined ? undefined : `clang-format:${version}:${configurationHash}`,
            // As with source models, formatter configuration must remain stable during a pass.
            // Unknown configuration still permits formatting, but never cache reuse.
            format: source => run([`--assume-filename=${file}`], source),
        };
    }
}

async function run(arguments_: string[], source?: string): Promise<string | undefined> {
    return new Promise(resolve => {
        const child = spawn(clangFormatCommand, arguments_, { shell: false });
        let output = '';
        let errors = '';
        let failed = false;
        child.stdout.setEncoding('utf8').on('data', data => { output += data; });
        child.stderr.setEncoding('utf8').on('data', data => { errors += data; });
        child.once('error', error => { failed = true; errors ||= error.message; });
        // A formatter that exits before consuming stdin can close its pipe early.
        child.stdin.on('error', () => { failed = true; });
        child.once('close', code => {
            if (code === 0 && !failed) {
                resolve(output);
            } else {
                if (errors) {
                    console.warn(`clang-format failed: ${errors.trim()}`);
                }
                resolve(undefined);
            }
        });
        child.stdin.end(source);
    });
}
