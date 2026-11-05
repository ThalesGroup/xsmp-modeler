import * as fs from 'node:fs';
import * as path from 'node:path';

/** Outputs of one generation. Only wholly generated folders may be cleaned. */
export class GeneratedFiles {
    readonly files = new Set<string>();

    readonly folders: readonly string[];

    constructor(folders: readonly string[] = []) {
        this.folders = folders.map(folder => path.resolve(folder));
    }

    async write(file: string, content: string): Promise<void> {
        this.files.add(path.resolve(file));
        await writeFileIfChanged(file, content);
    }
}

export async function writeFileIfChanged(file: string, content: string): Promise<void> {
    try {
        if (await fs.promises.readFile(file, 'utf8') === content) {
            return;
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }
    }
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.writeFile(file, content, 'utf8');
}

/** The old full cleanup removed symlinks; incremental writes must not follow them instead. */
export async function checkGeneratedFolders(outputs: readonly GeneratedFiles[]): Promise<void> {
    const visit = async (folder: string): Promise<void> => {
        let stats;
        try {
            stats = await fs.promises.lstat(folder);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return;
            }
            throw error;
        }
        if (!stats.isDirectory()) {
            throw new Error(`Generated folder is not a directory: ${folder}`);
        }
        for (const entry of await fs.promises.readdir(folder, { withFileTypes: true })) {
            const file = path.join(folder, entry.name);
            if (entry.isSymbolicLink()) {
                throw new Error(`Generated output is a symbolic link: ${file}`);
            }
            if (entry.isDirectory()) {
                await visit(file);
            }
        }
    };
    for (const folder of new Set(outputs.flatMap(output => [...output.folders]))) {
        await visit(folder);
    }
}

/** Call only after all generators and their accepted tasks have succeeded. */
export async function cleanStaleGeneratedFiles(outputs: readonly GeneratedFiles[]): Promise<void> {
    const retained = new Set(outputs.flatMap(output => [...output.files].map(file => path.resolve(file))));
    const caseVariants = new Map<string, string[]>();
    for (const file of retained) {
        const key = file.toLowerCase();
        const variants = caseVariants.get(key) ?? [];
        variants.push(file);
        caseVariants.set(key, variants);
    }
    const folders = new Set(outputs.flatMap(output => [...output.folders]));
    for (const folder of folders) {
        await cleanFolder(folder, retained, caseVariants, true);
    }
}

async function cleanFolder(
    folder: string,
    retained: ReadonlySet<string>,
    caseVariants: ReadonlyMap<string, readonly string[]>,
    root = false,
): Promise<void> {
    let entries: fs.Dirent[];
    try {
        if (!(await fs.promises.lstat(folder)).isDirectory()) {
            throw new Error(`Generated folder is not a directory: ${folder}`);
        }
        entries = await fs.promises.readdir(folder, { withFileTypes: true });
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return;
        }
        throw error;
    }
    for (const entry of entries) {
        const file = path.join(folder, entry.name);
        if (entry.isDirectory()) {
            await cleanFolder(file, retained, caseVariants);
        } else if (!retained.has(file) && !await isRetainedFile(file, caseVariants.get(file.toLowerCase()))) {
            await fs.promises.rm(file, { force: true });
        }
    }
    if (!root && (await fs.promises.readdir(folder)).length === 0) {
        await fs.promises.rmdir(folder);
    }
}

async function isRetainedFile(file: string, candidates: readonly string[] | undefined): Promise<boolean> {
    if (!candidates) {
        return false;
    }
    // Case-insensitive filesystems can preserve an old directory-entry spelling. Compare
    // physical identities only for ambiguous paths; exact matches require no extra I/O.
    const actual = await fs.promises.stat(file, { bigint: true });
    for (const candidate of candidates) {
        try {
            const expected = await fs.promises.stat(candidate, { bigint: true });
            if (actual.dev === expected.dev && actual.ino === expected.ino) {
                return true;
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }
    }
    return false;
}
