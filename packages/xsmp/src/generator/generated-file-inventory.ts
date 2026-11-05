import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

export interface OwnedOutput {
    owner: string;
    output: string;
    directory: string;
    files: string[];
}

/** Ownership survives restarts; unlike the formatter cache, it authorizes deletion. */
export class GeneratedFileInventory {
    private previous: string | undefined;
    readonly outputs = new Map<string, OwnedOutput>();
    readonly file: string;

    constructor(file: string) {
        this.file = file;
    }

    async load(): Promise<void> {
        try {
            this.previous = await fs.promises.readFile(this.file, 'utf8');
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
            throw error;
        }
        try {
            const value: unknown = JSON.parse(this.previous);
            if (!isInventory(value)) throw new Error('Invalid inventory');
            for (const output of value.outputs) {
                const key = outputKey(output);
                if (this.outputs.has(key)) throw new Error('Duplicate output');
                this.outputs.set(key, output);
            }
        } catch {
            this.outputs.clear();
            console.warn(`Ignoring invalid generated-file inventory '${this.file}'; unknown files will be preserved.`);
        }
    }

    async save(): Promise<void> {
        if (!this.previous && this.outputs.size === 0) return;
        const outputs = [...this.outputs.values()]
            .filter(output => output.files.length > 0)
            .map(output => ({ ...output, files: [...output.files].sort() }))
            .sort((left, right) => outputKey(left).localeCompare(outputKey(right)));
        const content = JSON.stringify({ version: 1, outputs }) + '\n';
        if (content === this.previous) return;
        await fs.promises.mkdir(path.dirname(this.file), { recursive: true });
        const temporary = `${this.file}.${randomUUID()}.tmp`;
        try {
            await fs.promises.writeFile(temporary, content, { flag: 'wx' });
            await fs.promises.rename(temporary, this.file);
            this.previous = content;
        } finally {
            await fs.promises.rm(temporary, { force: true });
        }
    }
}

export function outputKey(output: Pick<OwnedOutput, 'owner' | 'output' | 'directory'>): string {
    return JSON.stringify([output.owner, output.output, output.directory]);
}

export function isRelativePath(value: string, allowRoot = false): boolean {
    if (value.includes('\0') || path.isAbsolute(value) || path.win32.isAbsolute(value)) return false;
    const normalized = value.replaceAll('\\', '/');
    if (!normalized || normalized.split('/').includes('..')) return false;
    return allowRoot || path.posix.normalize(normalized) !== '.';
}

function isInventory(value: unknown): value is { version: 1; outputs: OwnedOutput[] } {
    if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 1
        || !('outputs' in value) || !Array.isArray(value.outputs)) return false;
    return value.outputs.every((output: unknown) => {
        if (!output || typeof output !== 'object') return false;
        const entry = output as Partial<OwnedOutput>;
        return typeof entry.owner === 'string' && typeof entry.output === 'string'
            && typeof entry.directory === 'string' && isRelativePath(entry.directory, true)
            && Array.isArray(entry.files) && entry.files.every(file => {
                if (typeof file !== 'string' || !isRelativePath(file)) return false;
                const destination = path.posix.normalize(`${entry.directory!.replaceAll('\\', '/')}/${file.replaceAll('\\', '/')}`).toLowerCase();
                return destination !== '.xsmp' && !destination.startsWith('.xsmp/');
            });
    });
}
