import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { NodeFileSystem } from 'langium/node';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createXsmpServices } from 'xsmp';
import { xsmpContributionPackage } from '@xsmp/tool-python';

let tempDir: string;

beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-python-scaffold-'));
});

afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('@xsmp/tool-python scaffolding', () => {
    test('scaffolds pytest configuration and starter Python tests through the contribution registry', async () => {
        const services = createXsmpServices(NodeFileSystem);
        const report = await services.shared.ContributionRegistry.registerBuiltinPackages([xsmpContributionPackage]);
        expect(report.failures).toEqual([]);

        const projectDir = path.join(tempDir, 'mission-demo');
        const result = await services.shared.ContributionRegistry.scaffoldProject({
            projectName: 'mission-demo',
            projectDir,
            selectedToolIds: ['python'],
        });

        expect(result.failures).toEqual([]);
        expect(result.dependencies).toEqual([]);
        expect(fs.readFileSync(path.join(projectDir, 'pytest.ini'), 'utf-8')).toContain('testpaths = python');

        const starterTest = fs.readFileSync(path.join(projectDir, 'python', 'mission_demo', 'test_mission_demo.py'), 'utf-8');
        expect(starterTest).toContain('import mission_demo');
        expect(starterTest).toContain('sim.LoadLibrary("mission_demo")');
        expect(starterTest).toContain('class Testmission_demo(xsmp.unittest.TestCase):');
        expect(starterTest).toContain('def test_mission_demo(self):');
    });
});
