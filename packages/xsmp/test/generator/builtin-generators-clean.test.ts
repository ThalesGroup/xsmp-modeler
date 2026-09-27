import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import type { XsmpContributionKind } from '../../src/contributions/xsmp-extension-types.js';
import { createBuiltinTestXsmpServices } from '../test-services.js';

let services: Awaited<ReturnType<typeof createBuiltinTestXsmpServices>>;
const tempDirs: string[] = [];

beforeAll(async () => {
    services = await createBuiltinTestXsmpServices(NodeFileSystem);
});

afterEach(() => {
    while (tempDirs.length > 0) {
        fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
});

describe('Built-in generators clean', () => {
    // Removing a generated folder itself fails on Windows while another process holds it.
    test.each<[XsmpContributionKind, string, readonly string[]]>([
        ['tool', 'adoc', ['adoc-gen']],
        ['tool', 'smp', ['smdl-gen']],
        ['profile', 'xsmp-sdk', ['src-gen']],
        ['profile', 'esa-cdk', ['src-gen']],
        ['profile', 'tas-mdk', ['include-gen', 'src-gen']],
    ])("%s '%s' removes the content of its generated folders but keeps them", async (kind, name, folders) => {
        const contribution = services.shared.ContributionRegistry.resolveContribution(kind, name)?.contribution;
        expect(contribution?.generators.length).toBeGreaterThan(0);

        const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-builtin-clean-'));
        tempDirs.push(projectDir);
        for (const folder of folders) {
            fs.mkdirSync(path.join(projectDir, folder, 'demo'), { recursive: true });
            fs.writeFileSync(path.join(projectDir, folder, 'Stale.txt'), '');
            fs.writeFileSync(path.join(projectDir, folder, 'demo', 'Stale.txt'), '');
        }

        for (const generator of contribution!.generators) {
            await generator.clean(URI.file(projectDir));
        }

        for (const folder of folders) {
            expect(fs.readdirSync(path.join(projectDir, folder))).toEqual([]);
        }
    });
});
