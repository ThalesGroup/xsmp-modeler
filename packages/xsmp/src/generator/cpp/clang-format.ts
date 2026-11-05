import { spawn } from 'node:child_process';
import * as path from 'node:path';

const clangFormatCommand = process.platform.startsWith('win') ? 'clang-format.exe' : 'clang-format';

interface FormattedFile {
    readonly source: string;
    readonly configuration: string;
    readonly version: string;
    readonly formatted: string;
}

/** Reuse formatting only when clang-format reports the same effective configuration and version. */
export class ClangFormatter {
    private previous = new Map<string, FormattedFile>();
    private current = new Map<string, FormattedFile>();
    private configurations = new Map<string, Promise<string | undefined>>();
    private version: Promise<string | undefined> | undefined;

    beginGeneration(): void {
        // Retain only the preceding generation, so deleted/renamed paths cannot accumulate.
        this.previous = this.current;
        this.current = new Map();
        this.configurations.clear();
        this.version = undefined;
    }

    async format(file: string, source: string): Promise<string> {
        const version = await (this.version ??= run(['--version']));
        if (version === undefined) {
            return source;
        }
        // Directory controls style-file lookup; extension controls clang-format's language.
        // Let clang-format resolve parent inheritance and all supported configuration options.
        const configurationKey = path.join(path.dirname(file), path.extname(file));
        let configuration = this.configurations.get(configurationKey);
        if (!configuration) {
            configuration = run(['--dump-config', `--assume-filename=${file}`]);
            this.configurations.set(configurationKey, configuration);
        }
        const effectiveConfiguration = await configuration;
        if (effectiveConfiguration === undefined) {
            // Configuration discovery is only a cache optimization. Keep formatting normally
            // when it fails, without retaining a result whose configuration is unknown.
            return await run([`--assume-filename=${file}`], source) ?? source;
        }
        const cached = this.current.get(file) ?? this.previous.get(file);
        if (cached?.source === source && cached.configuration === effectiveConfiguration && cached.version === version) {
            this.current.set(file, cached);
            return cached.formatted;
        }
        const formatted = await run([`--assume-filename=${file}`], source);
        if (formatted === undefined) {
            return source;
        }
        this.current.set(file, { source, configuration: effectiveConfiguration, version, formatted });
        return formatted;
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
        child.once('error', () => { failed = true; });
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
