import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { Cancellation, URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createXsmpServices } from '../../src/language/xsmp-module.js';
import { resolveContributionManifestEntries } from '../../src/language/contributions/xsmp-contribution-registry.js';
import type { XsmpResolvedContributionManifestEntry } from '../../src/language/contributions/xsmp-extension-types.js';

let tempDir: string;

beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-contribution-registry-'));
});

afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('XSMP contribution registry', () => {
    test('scopes builtins to active projects, propagates them transitively and activates generators/validators', async () => {
        const extensionRoot = path.join(tempDir, 'extension');
        const builtinsDir = path.join(extensionRoot, 'builtins');
        fs.mkdirSync(builtinsDir, { recursive: true });
        const logPath = path.join(tempDir, 'generator.log');

        fs.writeFileSync(path.join(extensionRoot, 'fake-tool.xsmptool'), 'tool "fake-tool"\n');
        fs.writeFileSync(path.join(builtinsDir, 'external.xsmpcat'), `
catalogue ext

namespace ext
{
    struct ExternalType
    {
    }
}
`);
        fs.writeFileSync(path.join(extensionRoot, 'handler.mjs'), `
import fs from 'node:fs';

export function registerContribution(api) {
    api.addValidation('xsmpcat', (services, category) => {
        const validator = {
            checkCatalogue(node, accept) {
                accept('warning', 'Fake contribution validation.', { node, keyword: 'catalogue' });
            }
        };
        services.validation.ValidationRegistry.register({ Catalogue: validator.checkCatalogue }, validator, category);
    });
    api.addGenerator(() => ({
        clean(projectUri) {
            fs.appendFileSync(${JSON.stringify(logPath)}, \`clean:\${projectUri.toString()}\\n\`);
        },
        generate(node, projectUri) {
            fs.appendFileSync(${JSON.stringify(logPath)}, \`generate:\${node.$type}:\${projectUri.toString()}\\n\`);
        }
    }));
}
`);

        const depProjectDir = createProjectFixture(tempDir, 'dep', `
project "dep"
tool "fake-tool"
source "src"
`, `
catalogue dep

namespace dep
{
    struct UsesExternal
    {
        field ext.ExternalType external
    }
}
`);
        const appProjectDir = createProjectFixture(tempDir, 'app', `
project "app"
dependency "dep"
source "src"
`, `
catalogue app

namespace app
{
    struct UsesExternal
    {
        field ext.ExternalType external
    }
}
`);
        const isolatedProjectDir = createProjectFixture(tempDir, 'isolated', `
project "isolated"
source "src"
`, `
catalogue isolated

namespace isolated
{
    struct UsesExternal
    {
        field ext.ExternalType external
    }
}
`);

        const services = createXsmpServices(NodeFileSystem);
        await services.shared.ContributionRegistry.ready;

        const contributionEntry: XsmpResolvedContributionManifestEntry = {
            extensionId: 'test.fake-extension',
            extensionRoot,
            descriptorPath: path.join(extensionRoot, 'fake-tool.xsmptool'),
            handlerPath: path.join(extensionRoot, 'handler.mjs'),
            apiVersion: '^1.0.0',
            aliases: ['fake-tool-alias'],
            deprecatedAliases: ['fake-tool-legacy'],
            builtins: [builtinsDir],
        };

        await services.shared.ContributionRegistry.registerDiscoveredContributions([contributionEntry]);

        await services.shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: 'dep', uri: URI.file(depProjectDir) },
            { name: 'app', uri: URI.file(appProjectDir) },
            { name: 'isolated', uri: URI.file(isolatedProjectDir) },
        ]);
        await services.shared.workspace.DocumentBuilder.build(
            services.shared.workspace.LangiumDocuments.all.toArray(),
            { validation: true },
            Cancellation.CancellationToken.None,
        );

        const depDocument = getDocument(services, path.join(depProjectDir, 'src', 'dep.xsmpcat'));
        const appDocument = getDocument(services, path.join(appProjectDir, 'src', 'app.xsmpcat'));
        const isolatedDocument = getDocument(services, path.join(isolatedProjectDir, 'src', 'isolated.xsmpcat'));
        const builtinUri = services.shared.ContributionRegistry.getPayloadBuiltinDocuments()[0]?.uri.toString();

        expect(builtinUri).toBeDefined();
        expect(services.shared.workspace.ProjectManager.getVisibleUris(depDocument)?.has(builtinUri!)).toBe(true);
        expect(services.shared.workspace.ProjectManager.getVisibleUris(appDocument)?.has(builtinUri!)).toBe(true);
        expect(services.shared.workspace.ProjectManager.getVisibleUris(isolatedDocument)?.has(builtinUri!)).toBe(false);

        expect(diagnosticMessages(depDocument)).toContain('Fake contribution validation.');
        expect(diagnosticMessages(appDocument)).not.toContain('Fake contribution validation.');
        expect(diagnosticMessages(appDocument).some(message => message.includes('Could not resolve reference'))).toBe(false);
        expect(diagnosticMessages(isolatedDocument).some(message => message.includes('Could not resolve reference'))).toBe(true);

        const depProject = services.shared.workspace.ProjectManager.getProject(depDocument);
        expect(depProject).toBeDefined();
        await services.shared.DocumentGenerator.generateProject(depProject!, Cancellation.CancellationToken.None);

        const log = fs.readFileSync(logPath, 'utf-8');
        expect(log).toContain('clean:file://');
    });

    test('isolates third-party contribution failures and exposes scaffold metadata for valid ones', async () => {
        const goodExtensionRoot = path.join(tempDir, 'good-extension');
        const badExtensionRoot = path.join(tempDir, 'bad-extension');
        const scaffoldProjectDir = path.join(tempDir, 'scaffolded-project');

        fs.mkdirSync(goodExtensionRoot, { recursive: true });
        fs.mkdirSync(badExtensionRoot, { recursive: true });

        fs.writeFileSync(path.join(goodExtensionRoot, 'good-tool.xsmptool'), 'tool "good-tool"\n');
        fs.writeFileSync(path.join(goodExtensionRoot, 'handler.mjs'), `
import path from 'node:path';

export function registerContribution(api) {
    api.setWizardMetadata({
        label: 'Good Tool',
        description: 'A valid test contribution.',
        defaultSelected: true,
    });
    api.setWizardPrompts([
        {
            id: 'moduleName',
            label: 'Generated module name',
            type: 'string',
            defaultValue: 'default-module'
        }
    ]);
    api.setScaffolder(async context => {
        await context.writeFile(path.join(context.projectDir, 'generated.txt'), String(context.getPromptValue('moduleName') ?? context.projectIdentifier));
        context.addDependency('ExternalFoundation');
    });
}
`);

        fs.writeFileSync(path.join(badExtensionRoot, 'bad-tool.xsmptool'), 'tool "bad-tool"\n');
        fs.writeFileSync(path.join(badExtensionRoot, 'handler.mjs'), `
export function registerContribution() {
    throw new Error('Broken contribution handler.');
}
`);

        const services = createXsmpServices(NodeFileSystem);
        await services.shared.ContributionRegistry.ready;

        const report = await services.shared.ContributionRegistry.registerDiscoveredContributions([
            {
                extensionId: 'test.bad-extension',
                extensionRoot: badExtensionRoot,
                descriptorPath: path.join(badExtensionRoot, 'bad-tool.xsmptool'),
                handlerPath: path.join(badExtensionRoot, 'handler.mjs'),
                apiVersion: '^1.0.0',
                aliases: [],
                deprecatedAliases: [],
                builtins: [],
            },
            {
                extensionId: 'test.good-extension',
                extensionRoot: goodExtensionRoot,
                descriptorPath: path.join(goodExtensionRoot, 'good-tool.xsmptool'),
                handlerPath: path.join(goodExtensionRoot, 'handler.mjs'),
                apiVersion: '^1.0.0',
                aliases: [],
                deprecatedAliases: [],
                builtins: [],
            },
        ]);

        expect(report.registered).toContainEqual({
            id: 'good-tool',
            kind: 'tool',
            extensionId: 'test.good-extension',
        });
        expect(report.failures).toHaveLength(1);
        expect(report.failures[0]?.extensionId).toBe('test.bad-extension');
        expect(report.failures[0]?.phase).toBe('handler');
        expect(report.failures[0]?.message).toContain('Broken contribution handler.');

        expect(services.shared.ContributionRegistry.getContributionSummaries('tool')).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'good-tool',
                    label: 'Good Tool',
                    defaultSelected: true,
                    hasScaffolder: true,
                }),
            ]),
        );

        const prompts = await services.shared.ContributionRegistry.getWizardPrompts({
            selectedToolIds: ['good-tool'],
        });
        expect(prompts).toEqual([
            expect.objectContaining({
                contributionId: 'good-tool',
                id: 'moduleName',
                key: 'good-tool.moduleName',
            }),
        ]);

        const scaffoldResult = await services.shared.ContributionRegistry.scaffoldProject({
            projectName: 'mission-demo',
            projectDir: scaffoldProjectDir,
            selectedToolIds: ['good-tool'],
            promptValues: {
                'good-tool.moduleName': 'custom-module',
            },
        });

        expect(scaffoldResult.failures).toHaveLength(0);
        expect(scaffoldResult.dependencies).toEqual(['ExternalFoundation']);
        expect(fs.readFileSync(path.join(scaffoldProjectDir, 'generated.txt'), 'utf-8')).toBe('custom-module');
    });

    test('registers a packaged external extension from its xsmp manifest entries', async () => {
        const extensionRoot = path.join(tempDir, 'packaged-extension');
        const builtinsDir = path.join(extensionRoot, 'builtins');
        fs.mkdirSync(builtinsDir, { recursive: true });

        fs.writeFileSync(path.join(extensionRoot, 'external-tool.xsmptool'), 'tool "external-tool"\n');
        fs.writeFileSync(path.join(extensionRoot, 'handler.mjs'), `
export function registerContribution(api) {
    api.setWizardMetadata({
        label: 'External Tool',
        description: 'Discovered from a packaged manifest.',
    });
}
`);
        fs.writeFileSync(path.join(builtinsDir, 'types.xsmpcat'), `
catalogue ext

namespace ext
{
    struct ExternalType
    {
    }
}
`);

        const services = createXsmpServices(NodeFileSystem);
        await services.shared.ContributionRegistry.ready;

        const entries = resolveContributionManifestEntries('test.external', extensionRoot, [
            {
                descriptor: 'external-tool.xsmptool',
                handler: 'handler.mjs',
                apiVersion: '^1.0.0',
                aliases: ['external-tool-alias'],
                deprecatedAliases: ['external-tool-legacy'],
                builtins: ['builtins'],
            },
        ]);

        const report = await services.shared.ContributionRegistry.registerDiscoveredContributions(entries);
        expect(report.failures).toHaveLength(0);
        expect(report.registered).toContainEqual({
            id: 'external-tool',
            kind: 'tool',
            extensionId: 'test.external',
        });

        const aliasResolution = services.shared.ContributionRegistry.resolveContribution('tool', 'external-tool-alias');
        const deprecatedResolution = services.shared.ContributionRegistry.resolveContribution('tool', 'external-tool-legacy');
        expect(aliasResolution?.contribution.id).toBe('external-tool');
        expect(aliasResolution?.kind).toBe('alias');
        expect(deprecatedResolution?.contribution.id).toBe('external-tool');
        expect(deprecatedResolution?.kind).toBe('deprecatedAlias');
        expect(services.shared.ContributionRegistry.getPayloadBuiltinDocuments()).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    uri: expect.objectContaining({
                        path: expect.stringContaining('/builtins/types.xsmpcat'),
                    }),
                }),
            ]),
        );
    });
});

function createProjectFixture(rootDir: string, name: string, projectText: string, catalogueText: string): string {
    const projectDir = path.join(rootDir, name);
    const srcDir = path.join(projectDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'xsmp.project'), projectText.trimStart());
    fs.writeFileSync(path.join(srcDir, `${name}.xsmpcat`), catalogueText.trimStart());
    return projectDir;
}

function getDocument(
    services: ReturnType<typeof createXsmpServices>,
    filePath: string,
) {
    const uri = URI.file(filePath).toString();
    const document = services.shared.workspace.LangiumDocuments.all.find(candidate => candidate.uri.toString() === uri);
    if (!document) {
        throw new Error(`Unable to find document '${filePath}'.`);
    }
    return document;
}

function diagnosticMessages(document: { diagnostics?: readonly { message: string }[] }): string[] {
    return [...(document.diagnostics ?? [])].map(diagnostic => diagnostic.message);
}
