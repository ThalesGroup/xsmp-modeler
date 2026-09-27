import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Removes the content of generated folders but keeps the folders themselves.
 *
 * On Windows, a folder cannot be removed while another process holds it (e.g. as its current
 * directory): removing it recursively then fails with EBUSY, whereas the files it contains can
 * still be removed. Every entry is attempted before the failures, if any, are thrown.
 * Missing folders are ignored.
 */
export async function cleanGeneratedFolders(...folderPaths: string[]): Promise<void> {
    const errors: unknown[] = [];
    for (const folderPath of new Set(folderPaths)) {
        let entryPaths: string[];
        try {
            entryPaths = await getEntriesToRemove(folderPath);
        } catch (error) {
            errors.push(error);
            continue;
        }
        const removals = await Promise.allSettled(
            entryPaths.map(entryPath => fs.promises.rm(entryPath, { recursive: true, force: true })),
        );
        errors.push(...removals
            .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
            .map(result => result.reason));
    }

    if (errors.length === 1) {
        throw errors[0];
    }
    if (errors.length > 1) {
        throw new AggregateError(errors, `Could not remove ${errors.length} generated files or folders.`);
    }
}

async function getEntriesToRemove(folderPath: string): Promise<string[]> {
    let stats: fs.Stats;
    try {
        stats = await fs.promises.lstat(folderPath);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return [];
        }
        throw error;
    }
    // Only a real folder is kept: a file or a symbolic link found in its place is removed as a whole.
    return stats.isDirectory()
        ? (await fs.promises.readdir(folderPath)).map(entry => path.join(folderPath, entry))
        : [folderPath];
}
