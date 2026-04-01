import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import type { ProjectRoot } from 'xsmp/ast-partial';
import { createBuiltinTestXsmpServices } from '../test-services.js';
import { createCompletionProbe, findSnippetItem, labels } from './completion-test-utils.js';

let services: Awaited<ReturnType<typeof createBuiltinTestXsmpServices>>;
let parseRoot: ReturnType<typeof parseHelper<ProjectRoot>>;
let getProjectCompletion: ReturnType<typeof createCompletionProbe>;
const documents: LangiumDocument[] = [];

beforeAll(async () => {
    services = await createBuiltinTestXsmpServices(EmptyFileSystem);
    parseRoot = parseHelper<ProjectRoot>(services.xsmpproject);
    getProjectCompletion = createCompletionProbe(services.xsmpproject);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

afterEach(async () => {
    if (documents.length > 0) {
        await clearDocuments(services.shared, documents.splice(0));
    }
});

describe('Xsmpproject completion provider', () => {
    test('offers contextual root and concrete project statements', async () => {
        const preferredProfileId = services.shared.ContributionRegistry.getPreferredContributionId('profile') ?? 'profile';
        const preferredToolId = services.shared.ContributionRegistry.getPreferredContributionId('tool') ?? 'tool';
        const dependencyDocument = await parseRoot("project 'foundation'\nsource 'smdl'\n", { documentUri: 'memory:///foundation/xsmp.project' });
        documents.push(dependencyDocument);

        const { items: rootItems } = await getProjectCompletion({
            sourceText: '',
            offset: 0,
            parseOptions: { documentUri: 'memory:///root/xsmp.project' },
        });
        expect(labels(rootItems)).toContain('Project');
        expect(labels(rootItems)).not.toContain('project');
        expect(findSnippetItem(rootItems, 'Project')?.insertText).toContain("source '");

        const projectCursor = extractCursor(`project 'MissionDemo' using 'ECSS_SMP_2025'
@@
`);
        const { items: projectItems } = await getProjectCompletion({
            sourceText: projectCursor.text,
            offset: projectCursor.cursor,
            parseOptions: { documentUri: 'memory:///project/xsmp.project' },
        });
        expect(labels(projectItems)).toContain('Source');
        expect(labels(projectItems)).toContain(`dependency 'foundation'`);
        expect(labels(projectItems)).toContain(`profile '${preferredProfileId}'`);
        expect(labels(projectItems)).toContain(`tool '${preferredToolId}'`);
    });

    test('uses registry-backed defaults for profile and tool snippets', async () => {
        const preferredProfileId = services.shared.ContributionRegistry.getPreferredContributionId('profile') ?? 'profile';
        const preferredToolId = services.shared.ContributionRegistry.getPreferredContributionId('tool') ?? 'tool';
        const { items: profileItems } = await getProjectCompletion({
            sourceText: '',
            offset: 0,
            parseOptions: { documentUri: 'memory:///esa.xsmpprofile' },
        });
        const { items: toolItems } = await getProjectCompletion({
            sourceText: '',
            offset: 0,
            parseOptions: { documentUri: 'memory:///adoc.xsmptool' },
        });

        expect(findSnippetItem(profileItems, 'Profile')?.insertText).toContain(preferredProfileId);
        expect(findSnippetItem(toolItems, 'Tool')?.insertText).toContain(preferredToolId);
    });

    test('offers standard values', async () => {
        const profileDocument = await parseRoot("profile 'esa-cdk'", { documentUri: 'memory:///esa.xsmpprofile' });
        const toolDocument = await parseRoot("tool 'adoc'", { documentUri: 'memory:///adoc.xsmptool' });
        const dependencyDocument = await parseRoot("project 'foundation'\nsource 'smdl'\n", { documentUri: 'memory:///foundation/xsmp.project' });
        const projectCursor = extractCursor(`project 'MissionDemo' using @@
dependency ''
tool ''
profile ''
`);
        documents.push(profileDocument, toolDocument, dependencyDocument);

        const { items: standardItems } = await getProjectCompletion({
            sourceText: projectCursor.text,
            offset: projectCursor.cursor,
            parseOptions: { documentUri: 'memory:///mission/xsmp.project' },
        });
        expect(labels(standardItems)).toContain('ECSS_SMP_2025');
    });

    test('replaces statement prefixes with concrete profile, tool and dependency statements', async () => {
        const preferredProfileId = services.shared.ContributionRegistry.getPreferredContributionId('profile') ?? 'profile';
        const preferredToolId = services.shared.ContributionRegistry.getPreferredContributionId('tool') ?? 'tool';
        const dependencyDocument = await parseRoot("project 'foundation'\nsource 'smdl'\n", { documentUri: 'memory:///foundation/xsmp.project' });
        const projectCursor = extractCursor(`project 'MissionDemo'
source 'smdl'
to@@
`);
        documents.push(dependencyDocument);

        const { items } = await getProjectCompletion({
            sourceText: projectCursor.text,
            offset: projectCursor.cursor,
            parseOptions: { documentUri: 'memory:///mission/xsmp.project' },
        });
        expect(labels(items)).toContain(`tool '${preferredToolId}'`);
        expect(labels(items)).not.toContain('Tool');
        expect(labels(items)).toContain(`profile '${preferredProfileId}'`);
        expect(labels(items)).toContain("dependency 'foundation'");

        const toolItem = items.find(item => item.label === `tool '${preferredToolId}'`);
        expect(toolItem?.textEdit?.newText).toContain("tool '");
    });

    test('filters already used contributions and keeps dependency suggestions ordered', async () => {
        const toolIds = services.shared.ContributionRegistry.getContributionSummaries('tool').map(summary => summary.id);
        const profileIds = services.shared.ContributionRegistry.getContributionSummaries('profile').map(summary => summary.id);
        expect(toolIds.length).toBeGreaterThan(1);
        expect(profileIds.length).toBeGreaterThan(1);

        const [usedToolId, remainingToolId] = toolIds;
        const [usedProfileId, remainingProfileId] = profileIds;

        const foundationDocument = await parseRoot(
            "project 'foundation'\ndependency 'mission'\n",
            { documentUri: 'memory:///foundation/xsmp.project' }
        );
        const sharedDocument = await parseRoot(
            "project 'shared'\n",
            { documentUri: 'memory:///shared/xsmp.project' }
        );
        const projectCursor = extractCursor(`project 'mission' using 'ECSS_SMP_2025'
tool '${usedToolId}'
profile '${usedProfileId}'
@@
`);
        documents.push(foundationDocument, sharedDocument);
        await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });

        const { items } = await getProjectCompletion({
            sourceText: projectCursor.text,
            offset: projectCursor.cursor,
            parseOptions: { documentUri: 'memory:///mission/xsmp.project' },
        });
        const dependencyLabels = labels(items).filter(label => label.startsWith("dependency '"));
        expect(dependencyLabels).toEqual(["dependency 'foundation'", "dependency 'shared'"]);
        expect(labels(items)).not.toContain("dependency 'mission'");
        expect(labels(items)).toContain(`tool '${remainingToolId}'`);
        expect(labels(items)).not.toContain(`tool '${usedToolId}'`);
        expect(labels(items)).toContain(`profile '${remainingProfileId}'`);
        expect(labels(items)).not.toContain(`profile '${usedProfileId}'`);
    });

    test('falls back to contextual snippets when all dependencies and contributions are already used', async () => {
        const preferredProfileId = services.shared.ContributionRegistry.getPreferredContributionId('profile') ?? 'profile';
        const preferredToolId = services.shared.ContributionRegistry.getPreferredContributionId('tool') ?? 'tool';
        const allProfileStatements = services.shared.ContributionRegistry
            .getContributionSummaries('profile')
            .map(summary => `profile '${summary.id}'`)
            .join('\n');
        const allToolStatements = services.shared.ContributionRegistry
            .getContributionSummaries('tool')
            .map(summary => `tool '${summary.id}'`)
            .join('\n');
        const projectCursor = extractCursor(`project 'mission' using 'ECSS_SMP_2025'
source 'smdl'
${allProfileStatements}
${allToolStatements}
@@
`);

        const { items } = await getProjectCompletion({
            sourceText: projectCursor.text,
            offset: projectCursor.cursor,
            parseOptions: { documentUri: 'memory:///mission/xsmp.project' },
        });
        expect(labels(items)).toContain(`profile '${preferredProfileId}'`);
        expect(labels(items)).toContain(`tool '${preferredToolId}'`);
        expect(labels(items)).toContain("dependency '<project-name>'");

        expect(findSnippetItem(items, `profile '${preferredProfileId}'`)?.textEdit?.newText).toContain(`profile '\${1:${preferredProfileId}}'`);
        expect(findSnippetItem(items, `tool '${preferredToolId}'`)?.textEdit?.newText).toContain(`tool '\${1:${preferredToolId}}'`);
        expect(findSnippetItem(items, "dependency '<project-name>'")?.textEdit?.newText).toContain("dependency '${1:project}'");
    });
});

function extractCursor(text: string): { cursor: number; text: string } {
    const cursor = text.indexOf('@@');
    if (cursor < 0) {
        throw new Error('Missing cursor marker.');
    }
    return {
        cursor,
        text: text.replace('@@', ''),
    };
}
