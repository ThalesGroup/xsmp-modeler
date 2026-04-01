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

describe('SMP mirror commands contribution', () => {
    test('contributes commands to switch between SMP XML and XSMP mirror views', async () => {
        const packageJson = await readJsonFile<{
            contributes: {
                commands: Array<{ command: string; title: string }>;
            };
        }>(packageJsonPath);

        expect(packageJson.contributes.commands).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    command: 'xsmp.openSmpMirror',
                    title: 'Open XSMP',
                }),
                expect.objectContaining({
                    command: 'xsmp.openSmpXmlSource',
                    title: 'Open XML Source',
                }),
            ]),
        );
    });

    test('shows title buttons for XML source files and xsmp-smp mirror documents', async () => {
        const packageJson = await readJsonFile<{
            contributes: {
                menus: {
                    'editor/title': Array<{ command: string; when: string }>;
                };
            };
        }>(packageJsonPath);

        expect(packageJson.contributes.menus['editor/title']).toEqual(
            expect.arrayContaining([
                {
                    command: 'xsmp.openSmpMirror',
                    group: 'navigation@100',
                    when: 'resourceScheme == file && (resourceExtname == .smpcat || resourceExtname == .smpcfg || resourceExtname == .smplnk || resourceExtname == .smpasb || resourceExtname == .smpsed)',
                },
                {
                    command: 'xsmp.openSmpXmlSource',
                    group: 'navigation@101',
                    when: 'resourceScheme == xsmp-smp',
                },
            ]),
        );
    });

    test('activates on readonly XSMP filesystem schemes so restored mirror tabs can reopen', async () => {
        const packageJson = await readJsonFile<{
            activationEvents: string[];
        }>(packageJsonPath);

        expect(packageJson.activationEvents).toEqual(
            expect.arrayContaining([
                'onFileSystem:xsmp',
                'onFileSystem:xsmp-smp',
            ]),
        );
    });
});
