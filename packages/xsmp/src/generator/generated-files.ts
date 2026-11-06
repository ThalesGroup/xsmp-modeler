import { Cancellation, interruptAndCheck } from 'langium';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { GeneratedFileInventory, isRelativePath, outputKey } from './generated-file-inventory.js';

export type GeneratedContent = string | (() => string | Promise<string>);

export interface PreparedFileFormatter {
    /** Identifies the actual tool, options and configuration used by format. */
    readonly cacheKey?: string;
    /** Undefined means formatting failed; write the raw text without caching it. */
    format(source: string): Promise<string | undefined>;
}

export interface FileFormatter {
    prepare(file: string): Promise<PreparedFileFormatter>;
}

export interface OutputDefinition {
    readonly directory: string;
    readonly writeMode: 'if-changed' | 'if-missing';
    readonly cleanup?: 'none' | 'tracked' | 'directory';
    readonly formatter?: FileFormatter;
}

export interface GeneratedFiles {
    write(output: string, relativePath: string, content: GeneratedContent): Promise<void>;
    resolvePath(output: string, relativePath: string): string;
}

interface ResolvedOutput extends OutputDefinition {
    readonly owner: string;
    readonly output: string;
    readonly root: string;
    readonly key: string;
    readonly completed: Set<string>;
}

interface FormattedHashes {
    readonly rawHash: string;
    readonly formattedHash: string;
    readonly context: string;
}

/** Workspace-scoped, bounded metadata only: no source, formatted text or AST references. */
export class GeneratedFileWriter {
    private readonly cache = new Map<string, FormattedHashes>();
    private cacheBytes = 0;
    private readonly maxEntries: number;
    private readonly maxBytes: number;

    constructor(maxEntries = 50_000, maxBytes = 16 * 1024 * 1024) {
        this.maxEntries = maxEntries;
        this.maxBytes = maxBytes;
    }

    createSession(projectDirectory: string, cancelToken = Cancellation.CancellationToken.None): GenerationSession {
        return new GenerationSession(this, path.resolve(projectDirectory), cancelToken);
    }

    get(file: string): FormattedHashes | undefined {
        const entry = this.cache.get(file);
        if (entry) {
            this.cache.delete(file);
            this.cache.set(file, entry);
        }
        return entry;
    }

    remember(file: string, entry: FormattedHashes): void {
        this.forget(file);
        const bytes = cacheSize(file, entry);
        if (this.maxEntries <= 0 || bytes > this.maxBytes) return;
        while (this.cache.size >= this.maxEntries || this.cacheBytes + bytes > this.maxBytes) {
            this.forget(this.cache.keys().next().value!);
        }
        this.cache.set(file, entry);
        this.cacheBytes += bytes;
    }

    forget(file: string): void {
        const entry = this.cache.get(file);
        if (entry) {
            this.cacheBytes -= cacheSize(file, entry);
            this.cache.delete(file);
        }
    }
}

/** Owned by the orchestrator; generators receive only their named-output facade. */
export class GenerationSession {
    private state: 'declaring' | 'preparing' | 'ready' | 'closed' = 'declaring';
    private readonly outputs: ResolvedOutput[] = [];
    private readonly owners = new Set<string>();
    private readonly expected = new Map<string, ResolvedOutput>();
    private readonly caseVariants = new Map<string, string[]>();
    private readonly pendingWrites = new Map<string, Promise<void>>();
    private readonly createOnceWrites = new Map<string, Promise<void>>();
    private readonly checkedDirectories = new Map<string, Promise<void>>();
    private readonly inventory: GeneratedFileInventory;
    private purgeRoots: string[] = [];
    private failed = false;
    private readonly writer: GeneratedFileWriter;
    private readonly projectDirectory: string;
    private readonly cancelToken: Cancellation.CancellationToken;

    constructor(
        writer: GeneratedFileWriter,
        projectDirectory: string,
        cancelToken: Cancellation.CancellationToken,
    ) {
        this.writer = writer;
        this.projectDirectory = projectDirectory;
        this.cancelToken = cancelToken;
        this.inventory = new GeneratedFileInventory(path.join(projectDirectory, '.xsmp', 'generated-files.json'));
    }

    createFiles(owner: string, definitions: Readonly<Record<string, OutputDefinition>>): GeneratedFiles {
        if (this.state !== 'declaring') throw new Error('Output declarations are closed.');
        if (this.owners.has(owner)) throw new Error(`Outputs already declared by '${owner}'.`);
        this.owners.add(owner);
        const outputs = new Map<string, ResolvedOutput>();
        for (const [name, definition] of Object.entries(definitions)) {
            if (!isRelativePath(definition.directory, true)) throw new Error(`Invalid output directory '${definition.directory}'.`);
            const directory = path.normalize(definition.directory.replaceAll('\\', '/'));
            const root = path.resolve(this.projectDirectory, directory);
            if (containsIgnoringCase(path.join(this.projectDirectory, '.xsmp'), root)) throw new Error('The .xsmp metadata directory is reserved.');
            const output = { ...definition, directory, owner, output: name, root, completed: new Set<string>(), key: '' };
            output.key = outputKey(output);
            outputs.set(name, output);
            this.outputs.push(output);
        }
        const resolve = (name: string, relativePath: string): [ResolvedOutput, string] => {
            const output = outputs.get(name);
            if (!output) throw new Error(`Unknown output '${name}' for '${owner}'.`);
            if (!isRelativePath(relativePath)) throw new Error(`Invalid generated path '${relativePath}'.`);
            const file = path.resolve(output.root, relativePath.replaceAll('\\', '/'));
            if (file === output.root || !contains(output.root, file)) throw new Error(`Generated path escapes output '${name}'.`);
            if (containsIgnoringCase(path.join(this.projectDirectory, '.xsmp'), file)) throw new Error('The .xsmp metadata directory is reserved.');
            return [output, file];
        };
        return {
            resolvePath: (name, relativePath) => resolve(name, relativePath)[1],
            write: async (name, relativePath, content) => {
                try {
                    const [output, file] = resolve(name, relativePath);
                    await this.write(output, file, content);
                } catch (error) {
                    this.failed = true;
                    throw error;
                }
            },
        };
    }

    async prepare(): Promise<void> {
        if (this.state !== 'declaring') throw new Error('Generation has already been prepared.');
        this.state = 'preparing';
        await interruptAndCheck(this.cancelToken);
        for (const output of this.outputs) {
            if (!['if-changed', 'if-missing'].includes(output.writeMode)
                || !['none', 'tracked', 'directory'].includes(output.cleanup ?? 'none')) {
                throw new Error(`Invalid output policy for '${output.owner}/${output.output}'.`);
            }
            if (output.writeMode === 'if-missing' && output.cleanup && output.cleanup !== 'none') {
                throw new Error('Create-once outputs cannot remove files.');
            }
            if (output.cleanup === 'directory' && output.root === this.projectDirectory) {
                throw new Error('The project root cannot be a wholly generated directory.');
            }
        }
        const roots = [...new Map(this.outputs.filter(output => output.cleanup === 'directory')
            .map(output => [pathIdentity(output.root), output.root])).values()];
        this.purgeRoots = roots.filter(root => !roots.some(other => root !== other && contains(other, root)));
        for (const root of this.purgeRoots) {
            for (const output of this.outputs) {
                if (output.cleanup !== 'directory' && containsIgnoringCase(root, output.root)) {
                    throw new Error(`Generated directory '${root}' overlaps protected output '${output.owner}/${output.output}'.`);
                }
            }
            await this.checkParents(path.join(root, '_'));
            await this.scanDirectory(root, [], []);
        }
        await this.checkParents(this.inventory.file);
        await this.checkFile(this.inventory.file);
        await this.inventory.load();
        this.state = 'ready';
    }

    private async write(output: ResolvedOutput, file: string, content: GeneratedContent): Promise<void> {
        if (this.state !== 'ready') throw new Error('Generation is not open for writing.');
        if (output.cleanup !== 'directory' && this.purgeRoots.some(root => containsIgnoringCase(root, file))) {
            throw new Error(`Protected output '${file}' is inside a wholly generated directory.`);
        }
        const identity = pathIdentity(file);
        const previous = this.expected.get(identity);
        if (previous) {
            if (previous === output && output.writeMode === 'if-missing') return this.createOnceWrites.get(identity)!;
            throw new Error(`Duplicate generated file '${file}' from '${previous.owner}/${previous.output}' and '${output.owner}/${output.output}'.`);
        }
        this.expected.set(identity, output);
        const caseKey = file.toLowerCase();
        const variants = this.caseVariants.get(caseKey) ?? [];
        const previousVariants = variants.slice();
        variants.push(file);
        this.caseVariants.set(caseKey, variants);
        // Serialize only ambiguous spellings. A first write can create the file that
        // reveals an alias on a case-insensitive volume, even when neither existed.
        const predecessor = this.pendingWrites.get(caseKey);
        let release!: () => void;
        const pending = new Promise<void>(resolve => { release = resolve; });
        this.pendingWrites.set(caseKey, pending);
        const result = (async () => {
            try {
                if (predecessor) await predecessor;
                await this.writeContent(output, file, content, previousVariants);
            } finally {
                release();
                if (this.pendingWrites.get(caseKey) === pending) this.pendingWrites.delete(caseKey);
            }
        })();
        // Unlike the alias lock, this promise preserves the first request's failure as well
        // as its success. Retain it for sequential duplicates until the session closes.
        if (output.writeMode === 'if-missing') this.createOnceWrites.set(identity, result);
        return result;
    }

    private async writeContent(output: ResolvedOutput, file: string, content: GeneratedContent, aliases: readonly string[]): Promise<void> {
        await interruptAndCheck(this.cancelToken);
        await this.checkParents(file);
        const existing = await this.checkFile(file, output.writeMode === 'if-missing');
        if (existing && aliases.length > 0) await this.checkAliases(file, aliases);
        if (output.writeMode === 'if-missing' && existing) return;
        const current = output.writeMode === 'if-changed' ? await readBytes(file) : undefined;
        await interruptAndCheck(this.cancelToken);
        const raw = typeof content === 'function' ? await content() : content;
        if (typeof raw !== 'string') throw new Error(`Generated content for '${file}' must be a string.`);
        await interruptAndCheck(this.cancelToken);
        const prepared = await output.formatter?.prepare(file);
        const rawHash = output.writeMode !== 'if-changed' || prepared?.cacheKey === undefined ? undefined : hash(Buffer.from(raw));
        const cached = rawHash === undefined ? undefined : this.writer.get(file);
        if (current && cached && cached.rawHash === rawHash && cached.context === prepared?.cacheKey
            && hash(current) === cached.formattedHash) {
            if (output.cleanup === 'tracked') output.completed.add(path.relative(output.root, file));
            return;
        }
        const formatted = prepared ? await prepared.format(raw) : undefined;
        const bytes = Buffer.from(formatted ?? raw);
        await interruptAndCheck(this.cancelToken);
        if (output.writeMode === 'if-missing' || !current?.equals(bytes)) {
            await fs.promises.mkdir(path.dirname(file), { recursive: true });
            try {
                await fs.promises.writeFile(file, bytes, { flag: output.writeMode === 'if-missing' ? 'wx' : 'w' });
            } catch (error) {
                if (output.writeMode === 'if-missing' && (error as NodeJS.ErrnoException).code === 'EEXIST') return;
                throw error;
            }
        }
        if (output.cleanup === 'tracked') output.completed.add(path.relative(output.root, file));
        if (output.writeMode === 'if-changed' && formatted !== undefined && rawHash !== undefined && prepared?.cacheKey !== undefined) {
            this.writer.remember(file, { rawHash, formattedHash: hash(bytes), context: prepared.cacheKey });
        } else {
            this.writer.forget(file);
        }
    }

    /** Must run after all accepted tasks have drained, including on failure. */
    async finish(success: boolean): Promise<void> {
        if (this.state === 'closed') throw new Error('Generation is already closed.');
        const ready = this.state === 'ready';
        this.state = 'closed';
        if (!ready) return;
        let failure: unknown;
        try {
            if (success && !this.failed) {
                await interruptAndCheck(this.cancelToken);
                await this.removeStale();
            }
        } catch (error) {
            failure = error;
        }
        try {
            await this.updateOwnership();
            await this.inventory.save();
        } catch (error) {
            failure ??= error;
        } finally {
            this.expected.clear();
            this.caseVariants.clear();
            this.pendingWrites.clear();
            this.createOnceWrites.clear();
            this.checkedDirectories.clear();
            this.outputs.length = 0;
        }
        if (failure) throw failure;
    }

    private async removeStale(): Promise<void> {
        // Validate every purge tree before starting destructive work.
        const files: string[] = [];
        const directories: string[] = [];
        const outputRoots = new Set(this.outputs.map(output => output.root.toLowerCase()));
        for (const root of this.purgeRoots) await this.scanDirectory(root, files, directories);
        for (const file of files) {
            await interruptAndCheck(this.cancelToken);
            if (!await this.isExpected(file)) {
                await fs.promises.rm(file, { force: true });
                this.writer.forget(file);
            }
        }
        for (const directory of directories.reverse()) {
            // A declared output root may be nested inside another generated output.
            if (outputRoots.has(directory.toLowerCase())) continue;
            await interruptAndCheck(this.cancelToken);
            try {
                await fs.promises.rmdir(directory);
            } catch (error) {
                // Removing empty subdirectories is optional. Windows may keep a directory
                // locked while a terminal or another process uses it as its working directory.
                // Required stale-file removals above and below still report their errors.
                if (!['ENOTEMPTY', 'ENOENT', 'EEXIST', 'EBUSY', 'EPERM', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
            }
        }
        for (const output of this.outputs.filter(value => value.cleanup === 'tracked')) {
            const owned = this.inventory.outputs.get(output.key);
            if (!owned) continue;
            const remaining = new Set(owned.files);
            try {
                for (const relative of owned.files) {
                    const file = path.resolve(output.root, relative);
                    await interruptAndCheck(this.cancelToken);
                    if (!await this.isExpected(file)) {
                        await this.checkParents(file);
                        await this.checkFile(file);
                        await fs.promises.rm(file, { force: true });
                        this.writer.forget(file);
                    }
                    // A surviving file is recorded below by its current owner or user-owned.
                    remaining.delete(relative);
                }
            } finally {
                owned.files = [...remaining];
            }
        }
    }

    private async updateOwnership(): Promise<void> {
        for (const output of this.outputs) {
            if (output.writeMode === 'if-missing') {
                this.inventory.outputs.delete(output.key);
                continue;
            }
            if (output.cleanup !== 'tracked' || output.completed.size === 0) continue;
            const previous = this.inventory.outputs.get(output.key);
            this.inventory.outputs.set(output.key, {
                owner: output.owner, output: output.output, directory: output.directory,
                files: [...new Set([...(previous?.files ?? []), ...output.completed])],
            });
        }
        for (const owned of this.inventory.outputs.values()) {
            const root = path.resolve(this.projectDirectory, owned.directory);
            const retained: string[] = [];
            for (const relative of owned.files) {
                if (!await this.isExpected(path.resolve(root, relative), 'if-missing')) retained.push(relative);
            }
            owned.files = retained;
        }
    }

    private async isExpected(file: string, writeMode?: OutputDefinition['writeMode']): Promise<boolean> {
        const owner = this.expected.get(pathIdentity(file));
        if (owner && (!writeMode || owner.writeMode === writeMode)) return true;
        // A case-insensitive volume can retain a previous directory-entry spelling.
        const candidates = this.caseVariants.get(file.toLowerCase())?.filter(candidate =>
            !writeMode || this.expected.get(pathIdentity(candidate))?.writeMode === writeMode);
        if (!candidates?.length) return false;
        const actual = await stat(file);
        if (!actual) return false;
        for (const candidate of candidates) {
            const expected = await stat(candidate);
            if (expected && actual.dev === expected.dev && actual.ino === expected.ino) return true;
        }
        return false;
    }

    private async checkAliases(file: string, aliases: readonly string[]): Promise<void> {
        const actual = await stat(file);
        if (!actual) return;
        for (const alias of aliases) {
            const previous = await stat(alias);
            if (previous && actual.dev === previous.dev && actual.ino === previous.ino) {
                throw new Error(`Duplicate generated file '${file}' aliases '${alias}'.`);
            }
        }
    }

    private async scanDirectory(root: string, files: string[], directories: string[], nested = false): Promise<void> {
        await interruptAndCheck(this.cancelToken);
        const stats = await lstat(root);
        if (!stats) return;
        if (!stats.isDirectory()) throw new Error(`Generated folder is not a directory: ${root}`);
        if (nested) directories.push(root);
        for (const entry of await fs.promises.readdir(root, { withFileTypes: true })) {
            const file = path.join(root, entry.name);
            if (entry.isSymbolicLink()) throw new Error(`Generated output is a symbolic link: ${file}`);
            if (entry.isDirectory()) await this.scanDirectory(file, files, directories, true);
            else files.push(file);
        }
    }

    private async checkParents(file: string): Promise<void> {
        const directory = path.dirname(file);
        if (directory === this.projectDirectory) return;
        if (!contains(this.projectDirectory, directory)) throw new Error(`Generated path escapes the project: ${file}`);
        let checked = this.checkedDirectories.get(directory);
        if (!checked) {
            checked = (async () => {
                await this.checkParents(directory);
                const stats = await lstat(directory);
                if (stats && !stats.isDirectory()) throw new Error(`Output parent is not a directory: ${directory}`);
            })();
            this.checkedDirectories.set(directory, checked);
        }
        await checked;
    }

    private async checkFile(file: string, preserveSymlink = false): Promise<fs.Stats | undefined> {
        const stats = await lstat(file);
        if (stats && (!stats.isFile() && !(preserveSymlink && stats.isSymbolicLink()))) {
            throw new Error(`Output is not a regular file: ${file}`);
        }
        return stats;
    }
}

function contains(parent: string, child: string): boolean {
    const relative = path.relative(parent, child);
    return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

/** Reject ambiguous policy boundaries on every platform, including case-sensitive volumes. */
function containsIgnoringCase(parent: string, child: string): boolean {
    return contains(parent.toLowerCase(), child.toLowerCase());
}

function pathIdentity(file: string): string {
    return process.platform === 'win32' ? file.toLowerCase() : file;
}

function hash(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex');
}

function cacheSize(file: string, value: FormattedHashes): number {
    return 128 + 2 * (file.length + value.rawHash.length + value.formattedHash.length + value.context.length);
}

async function lstat(file: string): Promise<fs.Stats | undefined> {
    try {
        return await fs.promises.lstat(file);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
    }
}

async function readBytes(file: string): Promise<Buffer | undefined> {
    try {
        return await fs.promises.readFile(file);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
    }
}

async function stat(file: string): Promise<fs.BigIntStats | undefined> {
    try {
        return await fs.promises.stat(file, { bigint: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
        throw error;
    }
}
