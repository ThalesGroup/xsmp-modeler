import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
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
        const configurationHash = await this.configuration(path.dirname(file));
        return {
            cacheKey: configurationHash === undefined ? undefined : `clang-format:${version}:${path.extname(file)}:${configurationHash}`,
            // As with source models, formatter configuration must remain stable during a pass.
            // Unknown configuration still permits formatting, but never cache reuse.
            format: source => run([`--assume-filename=${file}`], source),
        };
    }

    private configuration(directory: string): Promise<string | undefined> {
        let configuration = this.configurations.get(directory);
        if (!configuration) {
            configuration = this.readConfiguration(directory);
            if (this.configurations.size < 4096) {
                this.configurations.set(directory, configuration);
            }
        }
        return configuration;
    }

    private async readConfiguration(directory: string): Promise<string | undefined> {
        const parent = path.dirname(directory);
        // Hash every ancestor without parsing YAML: InheritParentConfig can reach beyond the
        // project. A change to an unused config may invalidate more, but cannot hide a change.
        const hashes = await Promise.all([
            parent === directory ? '' : this.configuration(parent),
            configurationFileHash(path.join(directory, '.clang-format')),
            configurationFileHash(path.join(directory, '_clang-format')),
        ]);
        return hashes.includes(undefined) ? undefined : createHash('sha256').update(hashes.join(':')).digest('hex');
    }
}

async function configurationFileHash(file: string): Promise<string | undefined> {
    try {
        return createHash('sha256').update(await fs.promises.readFile(file)).digest('hex');
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'absent' : undefined;
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
