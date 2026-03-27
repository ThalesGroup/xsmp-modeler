import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const watchMode = process.argv.includes('--watch');
const packageDir = process.cwd();
const extensionDir = path.join(packageDir, 'vscode');
const stagedLibDir = path.join(extensionDir, 'lib');
const watchedEntries = [
    path.join(packageDir, 'package.json'),
    path.join(packageDir, 'src'),
];

await syncStagedProfile();

if (watchMode) {
    await watchProfilePackage();
}

async function syncStagedProfile() {
    await runCommand('npm', ['run', 'build:package'], packageDir);
    await fs.rm(stagedLibDir, { recursive: true, force: true });
    await fs.cp(path.join(packageDir, 'lib'), stagedLibDir, { recursive: true });
}

async function watchProfilePackage() {
    let fingerprint = await createFingerprint();

    for (;;) {
        await delay(500);

        const nextFingerprint = await createFingerprint();
        if (nextFingerprint === fingerprint) {
            continue;
        }

        fingerprint = nextFingerprint;
        try {
            await syncStagedProfile();
        } catch (error) {
            console.error('Failed to rebuild XSMP TAS-MDK extension payload.', error);
        }
    }
}

async function createFingerprint() {
    const fingerprints = [];
    for (const entry of watchedEntries) {
        await collectFingerprint(entry, fingerprints);
    }
    return fingerprints.join('|');
}

async function collectFingerprint(entryPath, fingerprints) {
    let stat;
    try {
        stat = await fs.stat(entryPath);
    } catch {
        fingerprints.push(`missing:${path.relative(packageDir, entryPath)}`);
        return;
    }

    const relativePath = path.relative(packageDir, entryPath);
    if (stat.isDirectory()) {
        fingerprints.push(`dir:${relativePath}`);
        const entries = await fs.readdir(entryPath);
        for (const entry of entries.sort()) {
            await collectFingerprint(path.join(entryPath, entry), fingerprints);
        }
        return;
    }

    fingerprints.push(`file:${relativePath}:${stat.size}:${stat.mtimeMs}`);
}

function runCommand(command, args, cwd) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd,
            stdio: 'inherit',
            shell: process.platform === 'win32',
        });
        child.on('error', reject);
        child.on('exit', code => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`Command '${command} ${args.join(' ')}' failed with exit code ${code ?? 'unknown'}.`));
        });
    });
}
