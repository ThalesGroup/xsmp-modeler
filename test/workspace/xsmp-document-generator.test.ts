import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { Cancellation, URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createXsmpServices } from '../../src/language/xsmp-module.js';

let tempDir: string;

beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-document-generator-'));
});

afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('XSMP document generator', () => {
    test('generates a validated project only when its visible scope is clean', async () => {
        const projectDir = createProject(tempDir, 'app', `
project "app" using "ECSS_SMP_2025"
source "smdl"
tool "smp"
`, {
            'smdl/app.xsmpcat': `
catalogue app

namespace app
{
    /** @uuid 11111111-1111-1111-1111-111111111111 */
    struct Simple
    {
    }
}
`,
        });

        const services = createXsmpServices(NodeFileSystem);
        await services.shared.ContributionRegistry.ready;
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: 'app', uri: URI.file(projectDir) },
        ]);

        const project = services.shared.workspace.ProjectManager.getProjects().find(candidate => candidate.name === 'app');
        expect(project).toBeDefined();

        const report = await services.shared.DocumentGenerator.generateValidatedProject(project!, Cancellation.CancellationToken.None);

        expect(report.generatedProjects).toEqual(['app']);
        expect(report.skippedProjects).toEqual([]);
        expect(fs.existsSync(path.join(projectDir, 'smdl-gen', 'app.smpcat'))).toBe(true);
        expect(fs.existsSync(path.join(projectDir, 'smdl-gen', 'app.smppkg'))).toBe(true);
    });

    test('generate all skips invalid projects and continues with valid ones', async () => {
        const validProjectDir = createProject(tempDir, 'app', `
project "app" using "ECSS_SMP_2025"
source "smdl"
tool "smp"
`, {
            'smdl/app.xsmpcat': `
catalogue app

namespace app
{
    /** @uuid 22222222-2222-2222-2222-222222222222 */
    struct Simple
    {
    }
}
`,
        });
        const invalidProjectDir = createProject(tempDir, 'broken', `
project "broken" using "ECSS_SMP_2025"
source "smdl"
tool "smp"
`, {
            'smdl/broken.xsmpcat': `
catalogue broken

namespace broken
{
    /** @uuid 33333333-3333-3333-3333-333333333333 */
    struct Broken
    {
        field MissingType missing
    }
}
`,
        });

        const services = createXsmpServices(NodeFileSystem);
        await services.shared.ContributionRegistry.ready;
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: 'app', uri: URI.file(validProjectDir) },
            { name: 'broken', uri: URI.file(invalidProjectDir) },
        ]);

        const projects = services.shared.workspace.ProjectManager.getProjects().toArray()
            .sort((left, right) => left.name.localeCompare(right.name));
        const report = await services.shared.DocumentGenerator.generateValidatedProjects(projects, Cancellation.CancellationToken.None);

        expect(report.generatedProjects).toEqual(['app']);
        expect(report.skippedProjects).toEqual([{ projectName: 'broken', errorCount: 1 }]);
        expect(fs.existsSync(path.join(validProjectDir, 'smdl-gen', 'app.smpcat'))).toBe(true);
        expect(fs.existsSync(path.join(invalidProjectDir, 'smdl-gen'))).toBe(false);
    });
});

function createProject(rootDir: string, name: string, projectContent: string, files: Record<string, string>): string {
    const projectDir = path.join(rootDir, name);
    fs.mkdirSync(projectDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'xsmp.project'), projectContent.trimStart());

    for (const [relativePath, content] of Object.entries(files)) {
        const absolutePath = path.join(projectDir, relativePath);
        fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
        fs.writeFileSync(absolutePath, content.trimStart());
    }

    return projectDir;
}
