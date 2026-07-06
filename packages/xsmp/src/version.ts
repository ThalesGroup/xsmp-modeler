import * as fs from 'node:fs';
import * as path from 'node:path';
import * as url from 'node:url';

export const xsmpExtensionApiVersion = '1.0.0';

interface PackageInfo {
    version: string;
    root: string;
}

let cachedPackageInfo: PackageInfo | undefined;

function getDirName(): string {
    try {
        return url.fileURLToPath(new URL('.', import.meta.url));
    }
    catch {
        return __dirname;
    }
}

function loadPackageInfoFrom(startDir: string): PackageInfo | undefined {
    let currentDir = startDir;
    for (;;) {
        const candidate = path.join(currentDir, 'package.json');
        if (fs.existsSync(candidate)) {
            const json = JSON.parse(fs.readFileSync(candidate, 'utf-8')) as { version?: unknown };
            if (typeof json.version === 'string' && json.version.length > 0) {
                return { version: json.version, root: currentDir };
            }
        }
        const parentDir = path.dirname(currentDir);
        if (parentDir === currentDir) {
            return undefined;
        }
        currentDir = parentDir;
    }
}

function getConfiguredVersion(): string | undefined {
    const version = process.env.XSMP_CORE_VERSION;
    return version && version.length > 0 ? version : undefined;
}

function loadPackageInfo(): PackageInfo {
    if (cachedPackageInfo) {
        return cachedPackageInfo;
    }

    const dirname = getDirName();
    for (const candidateDir of [dirname, process.cwd()]) {
        const packageInfo = loadPackageInfoFrom(candidateDir);
        if (packageInfo) {
            cachedPackageInfo = packageInfo;
            return cachedPackageInfo;
        }
    }

    throw new Error(`Unable to locate package.json with a version from '${dirname}' or '${process.cwd()}'.`);
}

export function getXsmpVersion(): string {
    return getConfiguredVersion() ?? loadPackageInfo().version;
}

export function getXsmpPackageRoot(): string {
    return loadPackageInfo().root;
}
