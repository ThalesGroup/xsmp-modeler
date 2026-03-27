import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDir, '..');
const packageJsonPath = path.join(packageRoot, 'package.json');

async function readJsonFile<T>(filePath: string): Promise<T> {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
}

describe('SMP mirror preview contribution', () => {
    test('opens SMP XML files in the XSMP view by default', async () => {
        const packageJson = await readJsonFile<{
            contributes: {
                customEditors: Array<{
                    viewType: string;
                    displayName: string;
                    priority: string;
                    selector: Array<{ filenamePattern: string }>;
                }>;
            };
        }>(packageJsonPath);

        expect(packageJson.contributes.customEditors).toContainEqual({
            viewType: 'xsmp.smpMirrorPreview',
            displayName: 'XSMP Preview',
            priority: 'default',
            selector: [
                { filenamePattern: '*.smpcat' },
                { filenamePattern: '*.smpcfg' },
                { filenamePattern: '*.smplnk' },
                { filenamePattern: '*.smpasb' },
                { filenamePattern: '*.smpsed' },
            ],
        });
    });
});
