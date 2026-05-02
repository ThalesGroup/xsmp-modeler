import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';

export const xsmpExtensionApiVersion = '1.0.0';

interface PackageInfo {
    version: string;
    root: string;
}

let cached: PackageInfo | undefined;

function getDirName(): string {
    try {
        return url.fileURLToPath(new URL('.', import.meta.url));
    }
    catch {
        return __dirname;
    }
}

function findPackagePath(startDir: string): string {
    let currentDir = startDir;
    for (;;) {
        const candidate = path.join(currentDir, 'package.json');
        if (fs.existsSync(candidate)) {
            return candidate;
        }
        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) {
            throw new Error(`Unable to locate package.json from '${startDir}'.`);
        }
        currentDir = parentDir;
    }
}

function load(): PackageInfo {
    if (cached) {
        return cached;
    }

    const dirname = getDirName();
    const candidates: string[] = [];
    try {
        candidates.push(findPackagePath(dirname));
    } catch {
        // Fall back to the current working directory below.
    }
    candidates.push(path.resolve(process.cwd(), 'package.json'));

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            const json = JSON.parse(fs.readFileSync(candidate, 'utf-8')) as { version: string };
            cached = { version: json.version, root: path.dirname(candidate) };
            return cached;
        }
    }

    throw new Error(`Unable to locate package.json from '${dirname}' or '${process.cwd()}'.`);
}

export function getXsmpVersion(): string {
    return load().version;
}

export function getXsmpPackageRoot(): string {
    return load().root;
}
