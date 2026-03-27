import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import type { LanguageClient } from 'vscode-languageclient/node.js';
import { GetContributionSummaries, GetContributionWizardPrompts, ScaffoldProject } from '../lsp/language-server.js';
import { isSameOrContainedPath, toXsmpIdentifier } from '../utils/path-utils.js';
import type {
    XsmpContributionWizardPrompt,
    XsmpContributionKind,
    XsmpContributionScaffoldResult,
    XsmpContributionSummary,
} from '../contributions/xsmp-extension-types.js';

interface ContributionQuickPickItem extends vscode.QuickPickItem {
    readonly summary: XsmpContributionSummary;
}

export async function createProjectWizard(client: LanguageClient): Promise<void> {
    const destinationFolders = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        title: 'Root directory containing the new project.',
        openLabel: 'Select the root directory containing the new project.',
    });

    if (!destinationFolders || destinationFolders.length === 0) {
        return;
    }

    const destinationFolder = destinationFolders[0].fsPath;
    const projectName = await promptProjectName();
    if (!projectName) {
        return;
    }

    const profile = await pickContribution(client, 'profile', {
        placeHolder: 'Select a profile',
    });
    const selectedTools = await pickContributions(client, 'tool', {
        placeHolder: 'Select tools to enable',
    });
    if (!selectedTools) {
        return;
    }

    const promptValues = await collectWizardPromptValues(client, profile?.summary, selectedTools.map(item => item.summary));
    if (promptValues === undefined) {
        return;
    }

    const projectFolderPath = path.join(destinationFolder, projectName);
    if (fs.existsSync(projectFolderPath)) {
        vscode.window.showErrorMessage(`Project folder '${projectFolderPath}' already exists.`);
        return;
    }

    try {
        await createTemplateProject(client, projectName, projectFolderPath, profile?.summary, selectedTools.map(item => item.summary), promptValues);
    } catch (error) {
        if (isNodeError(error) && error.code === 'EEXIST') {
            vscode.window.showErrorMessage(`Project folder '${projectFolderPath}' already exists.`);
            return;
        }
        throw error;
    }

    await maybeAddProjectToWorkspace(projectFolderPath);

    const xsmpcatFilePath = path.join(projectFolderPath, 'smdl', `${projectName}.xsmpcat`);
    const xsmpcatDocument = await vscode.workspace.openTextDocument(xsmpcatFilePath);
    await vscode.window.showTextDocument(xsmpcatDocument);
}

async function promptProjectName(): Promise<string | undefined> {
    for (;;) {
        const input = await vscode.window.showInputBox({
            prompt: 'Enter project name',
        });

        if (input === undefined) {
            return undefined;
        }

        if (input && /^[a-zA-Z][a-zA-Z0-9_.-]*$/.test(input)) {
            return input;
        }

        await vscode.window.showErrorMessage('Project name must follow the format [a-zA-Z][a-zA-Z0-9_.-]\\w*');
    }
}

async function pickContribution(
    client: LanguageClient,
    kind: XsmpContributionKind,
    options: vscode.QuickPickOptions,
): Promise<ContributionQuickPickItem | undefined> {
    const items = await getContributionItems(client, kind);
    if (items.length === 0) {
        return undefined;
    }
    return await vscode.window.showQuickPick(items, options);
}

async function pickContributions(
    client: LanguageClient,
    kind: XsmpContributionKind,
    options: vscode.QuickPickOptions,
): Promise<readonly ContributionQuickPickItem[] | undefined> {
    const items = await getContributionItems(client, kind);
    if (items.length === 0) {
        return [];
    }
    return await vscode.window.showQuickPick(items, {
        ...options,
        canPickMany: true,
    });
}

async function getContributionItems(
    client: LanguageClient,
    kind: XsmpContributionKind,
): Promise<ContributionQuickPickItem[]> {
    const summaries = await client.sendRequest(GetContributionSummaries, kind);
    return summaries
        .slice()
        .sort((left, right) => left.label.localeCompare(right.label))
        .map(summary => ({
            label: summary.label,
            description: summary.id === summary.label ? undefined : summary.id,
            detail: summary.description,
            picked: summary.defaultSelected,
            summary,
        }));
}

async function createTemplateProject(
    client: LanguageClient,
    projectName: string,
    dirPath: string,
    profile: XsmpContributionSummary | undefined,
    tools: readonly XsmpContributionSummary[],
    promptValues: Readonly<Record<string, string | boolean>>,
): Promise<void> {
    await fs.promises.mkdir(dirPath);

    const smdlPath = path.join(dirPath, 'smdl');
    await fs.promises.mkdir(smdlPath);

    const catalogueName = toXsmpIdentifier(projectName);
    await fs.promises.writeFile(path.join(smdlPath, `${projectName}.xsmpcat`), createCatalogueContent(projectName, catalogueName));

    const scaffoldResult = await client.sendRequest(ScaffoldProject, {
        projectName,
        projectDir: dirPath,
        selectedProfileId: profile?.id,
        selectedToolIds: tools.map(tool => tool.id),
        promptValues,
    });

    await fs.promises.writeFile(
        path.join(dirPath, 'xsmp.project'),
        createProjectFileContent(projectName, profile, tools, scaffoldResult.dependencies),
    );

    reportScaffoldFailures(scaffoldResult);
}

async function collectWizardPromptValues(
    client: LanguageClient,
    profile: XsmpContributionSummary | undefined,
    tools: readonly XsmpContributionSummary[],
): Promise<Readonly<Record<string, string | boolean>> | undefined> {
    const prompts = await client.sendRequest(GetContributionWizardPrompts, {
        selectedProfileId: profile?.id,
        selectedToolIds: tools.map(tool => tool.id),
    });

    if (prompts.length === 0) {
        return {};
    }

    const values: Record<string, string | boolean> = {};
    for (const prompt of prompts) {
        const value = await promptForWizardValue(prompt);
        if (value === undefined) {
            return undefined;
        }
        values[prompt.key] = value;
    }
    return values;
}

async function promptForWizardValue(prompt: XsmpContributionWizardPrompt): Promise<string | boolean | undefined> {
    switch (prompt.type) {
        case 'boolean': {
            const selected = await vscode.window.showQuickPick(
                [
                    {
                        label: 'Yes',
                        value: true,
                        description: prompt.description,
                    },
                    {
                        label: 'No',
                        value: false,
                    },
                ],
                {
                    placeHolder: `${prompt.contributionId}: ${prompt.label}`,
                },
            );
            return selected?.value;
        }
        case 'choice': {
            const items = (prompt.choices ?? []).map(choice => ({
                label: choice.label ?? choice.value,
                description: choice.description,
                value: choice.value,
            }));
            if (items.length === 0) {
                return prompt.defaultValue;
            }
            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: `${prompt.contributionId}: ${prompt.label}`,
            });
            return selected?.value;
        }
        case 'string':
        default:
            return await vscode.window.showInputBox({
                prompt: `${prompt.contributionId}: ${prompt.label}`,
                placeHolder: prompt.placeholder,
                value: typeof prompt.defaultValue === 'string' ? prompt.defaultValue : undefined,
            });
    }
}

function createCatalogueContent(projectName: string, catalogueName: string): string {
    return `// Copyright (C) \${year} \${user}. All rights reserved.
//
// Generation date:  \${date} \${time}
                
/**
 * Catalogue ${projectName}
 * 
 * @creator ${os.userInfo().username}
 * @date ${new Date(Date.now()).toISOString()}
 */
catalogue ${catalogueName}

namespace ${catalogueName}
{
    
} // namespace ${catalogueName}

`;
}

function createProjectFileContent(
    projectName: string,
    profile: XsmpContributionSummary | undefined,
    tools: readonly XsmpContributionSummary[],
    dependencies: readonly string[],
): string {
    let content = `
/**
 * XSMP Project configuration for ${projectName}
 */
project '${projectName}'

// project relative path(s) containing modeling file(s)
source 'smdl'

`;

    if (profile) {
        content += `
// use ${profile.label}
profile '${profile.id}'

`;
    }

    for (const tool of tools) {
        content += `
// use ${tool.label}
tool '${tool.id}'

`;
    }

    for (const dependency of [...new Set(dependencies)].sort((left, right) => left.localeCompare(right))) {
        content += `
dependency '${dependency}'

`;
    }

    content += `
// If your project needs types from outside sources,
// you can include them by adding project dependencies.
// For example: dependency 'otherProject'
//              dependency 'otherProject2'

`;

    return content;
}

function reportScaffoldFailures(result: XsmpContributionScaffoldResult): void {
    if (result.failures.length === 0) {
        return;
    }

    const details = result.failures
        .slice(0, 3)
        .map(failure => `${failure.contributionId}: ${failure.message}`)
        .join('\n');
    const remaining = result.failures.length > 3 ? `\n…and ${result.failures.length - 3} more.` : '';
    void vscode.window.showWarningMessage(`Project scaffold completed with errors.\n${details}${remaining}`);
}

async function maybeAddProjectToWorkspace(projectFolderPath: string): Promise<void> {
    const addToWorkspace = await vscode.window.showQuickPick(
        [
            { label: 'Yes', addToWorkspace: true },
            { label: 'No', addToWorkspace: false },
        ],
        {
            placeHolder: 'Add project to workspace?',
        },
    );

    const uri = vscode.Uri.file(projectFolderPath);
    if (!vscode.workspace.workspaceFolders?.some(folder => isSameOrContainedPath(folder.uri.fsPath, uri.fsPath, path))) {
        if (addToWorkspace?.addToWorkspace) {
            vscode.workspace.updateWorkspaceFolders(vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders.length : 0, null, { uri });
        }
    }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error;
}
