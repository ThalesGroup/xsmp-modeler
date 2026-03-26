import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { InsertTextFormat, type CompletionItem } from 'vscode-languageserver';
import { createXsmpServices } from '../../src/language/xsmp-module.js';
import type { ProjectRoot } from '../../src/language/generated/ast-partial.js';

let services: ReturnType<typeof createXsmpServices>;
let parseRoot: ReturnType<typeof parseHelper<ProjectRoot>>;
const documents: LangiumDocument[] = [];

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parseRoot = parseHelper<ProjectRoot>(services.xsmpproject);
});

afterEach(async () => {
    if (documents.length > 0) {
        await clearDocuments(services.shared, documents.splice(0));
    }
});

describe('Xsmpproject completion provider', () => {
    test('offers contextual root and project statement snippets', async () => {
        const preferredProfileId = services.shared.ContributionRegistry.getPreferredContributionId('profile') ?? 'profile';
        const preferredToolId = services.shared.ContributionRegistry.getPreferredContributionId('tool') ?? 'tool';
        const rootDocument = await parseRoot('', { documentUri: 'memory:///root/xsmp.project' });
        documents.push(rootDocument);

        const rootItems = await getCompletionItems(rootDocument, 0);
        expect(labels(rootItems)).toContain('Project');
        expect(labels(rootItems)).not.toContain('project');
        expect(findSnippetItem(rootItems, 'Project')?.insertText).toContain('source "');

        const projectText = `project "MissionDemo" using "ECSS_SMP_2025"
@@
`;
        const projectDocument = await parseRoot(projectText.replace('@@', ''), { documentUri: 'memory:///project/xsmp.project' });
        documents.push(projectDocument);

        const projectItems = await getCompletionItems(projectDocument, projectText.indexOf('@@'));
        expect(labels(projectItems)).toContain('Source');
        expect(labels(projectItems)).toContain('Dependency');
        expect(labels(projectItems)).toContain('Profile');
        expect(labels(projectItems)).toContain('Tool');
        expect(findSnippetItem(projectItems, 'Profile')?.insertText).toContain(preferredProfileId);
        expect(findSnippetItem(projectItems, 'Tool')?.insertText).toContain(preferredToolId);
    });

    test('uses registry-backed defaults for profile and tool snippets', async () => {
        const preferredProfileId = services.shared.ContributionRegistry.getPreferredContributionId('profile') ?? 'profile';
        const preferredToolId = services.shared.ContributionRegistry.getPreferredContributionId('tool') ?? 'tool';
        const profileDocument = await parseRoot('', { documentUri: 'memory:///esa.xsmpprofile' });
        const toolDocument = await parseRoot('', { documentUri: 'memory:///adoc.xsmptool' });
        documents.push(profileDocument, toolDocument);

        const profileItems = await getCompletionItems(profileDocument, 0);
        const toolItems = await getCompletionItems(toolDocument, 0);

        expect(findSnippetItem(profileItems, 'Profile')?.insertText).toContain(preferredProfileId);
        expect(findSnippetItem(toolItems, 'Tool')?.insertText).toContain(preferredToolId);
    });

    test('offers standard values', async () => {
        const profileDocument = await parseRoot('profile "esa-cdk"', { documentUri: 'memory:///esa.xsmpprofile' });
        const toolDocument = await parseRoot('tool "adoc"', { documentUri: 'memory:///adoc.xsmptool' });
        const dependencyDocument = await parseRoot('project "foundation"\nsource "smdl"\n', { documentUri: 'memory:///foundation/xsmp.project' });
        const projectText = `project "MissionDemo" using @@
dependency ""
tool ""
profile ""
`;
        const projectDocument = await parseRoot(projectText.replace('@@', ''), { documentUri: 'memory:///mission/xsmp.project' });
        documents.push(profileDocument, toolDocument, dependencyDocument, projectDocument);
        await services.shared.workspace.DocumentBuilder.build(documents, { validation: false });

        const standardItems = await getCompletionItems(projectDocument, projectText.indexOf('@@'));
        expect(labels(standardItems)).toContain('ECSS_SMP_2025');
    });
});

async function getCompletionItems(document: LangiumDocument, offset: number): Promise<CompletionItem[]> {
    const completion = await services.xsmpproject.lsp.CompletionProvider?.getCompletion(document, {
        textDocument: { uri: document.textDocument.uri },
        position: document.textDocument.positionAt(offset),
    });
    return completion?.items ?? [];
}

function labels(items: CompletionItem[]): string[] {
    return items.map(item => item.label);
}

function findSnippetItem(items: CompletionItem[], label: string): CompletionItem | undefined {
    return items.find(item => item.label === label && item.insertTextFormat === InsertTextFormat.Snippet);
}
