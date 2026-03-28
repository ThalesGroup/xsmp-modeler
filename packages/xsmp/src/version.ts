import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';

const dirname = getDirName();
function getDirName() {
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

function loadPackageJson(): { packagePath: string; packageContent: string } {
    const candidates: string[] = [];
    try {
        candidates.push(findPackagePath(dirname));
    } catch {
        // Fall back to the current working directory below.
    }
    candidates.push(path.resolve(process.cwd(), 'package.json'));

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return {
                packagePath: candidate,
                packageContent: fs.readFileSync(candidate, 'utf-8'),
            };
        }
    }

    throw new Error(`Unable to locate package.json from '${dirname}' or '${process.cwd()}'.`);
}

const { packagePath, packageContent } = loadPackageJson();
const packageJson = JSON.parse(packageContent) as { version: string };

export const xsmpVersion = packageJson.version;
export const xsmpExtensionApiVersion = '1.0.0';
export const xsmpPackageRoot = path.dirname(packagePath);
