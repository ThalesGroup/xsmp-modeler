import * as path from 'node:path';
import {
    createXsmpProject,
    XsmpProjectCreationError,
    type XsmpProjectContributionSelection,
} from '@xsmp/core/project';
import type {
    XsmpContributionKind,
    XsmpContributionSummary,
    XsmpContributionWizardPrompt,
} from '@xsmp/core/contributions';
import {
    CliError,
    createCliServices,
    type CliIo,
    type CliPromptAnswer,
    type CliPromptRequest,
} from './cli-util.js';

const noProfileChoice = '__no_profile__';
const projectNamePattern = /^[a-zA-Z][a-zA-Z0-9_.-]*$/;
const invalidProjectNameMessage = String.raw`Project name must follow the format [a-zA-Z][a-zA-Z0-9_.-]*.`;

export interface CliNewProjectOptions {
    readonly profile?: string;
    readonly tool?: readonly string[];
    readonly set?: readonly string[];
    readonly interactive?: boolean;
    readonly yes?: boolean;
}

type ContributionRegistry = Awaited<ReturnType<typeof createCliServices>>['shared']['ContributionRegistry'];

interface QualifiedPrompt {
    readonly kind: XsmpContributionKind;
    readonly qualifiedKey: string;
    readonly prompt: XsmpContributionWizardPrompt;
}

export async function newProjectCommand(
    projectNameArgument: string | undefined,
    directoryArgument: string | undefined,
    options: CliNewProjectOptions,
    io: CliIo,
): Promise<number> {
    const canPrompt = options.interactive !== false
        && options.yes !== true
        && io.isInteractive === true
        && io.prompt !== undefined;
    const projectName = await resolveProjectName(projectNameArgument, canPrompt, io);
    const parentDir = await resolveParentDirectory(directoryArgument, canPrompt, io);
    const services = await createCliServices();
    const registry = services.shared.ContributionRegistry;

    const profile = await resolveProfile(options.profile, registry, canPrompt, io);
    const tools = await resolveTools(options.tool, registry, canPrompt, io);
    const promptValues = await resolvePromptValues(options.set, profile, tools, registry, canPrompt, io);
    const projectDir = path.join(parentDir, projectName);

    if (canPrompt) {
        renderProjectSummary(io, projectName, projectDir, profile, tools);
        const confirmed = await prompt(io, {
            type: 'confirm',
            message: 'Create this project?',
            defaultValue: true,
        });
        if (confirmed !== true) {
            io.stdout('Project creation cancelled.\n');
            return 0;
        }
    }

    try {
        const result = await createXsmpProject({
            projectName,
            projectDir,
            profile,
            tools,
            promptValues,
            failOnScaffoldError: true,
        }, registry);
        io.stdout(`Created XSMP project "${projectName}" in ${result.projectDir}\n`);
        return 0;
    } catch (error) {
        if (error instanceof XsmpProjectCreationError) {
            throw new CliError(error.message, 2);
        }
        throw error;
    }
}

async function resolveParentDirectory(
    directoryArgument: string | undefined,
    canPrompt: boolean,
    io: CliIo,
): Promise<string> {
    if (directoryArgument !== undefined) {
        return path.resolve(directoryArgument);
    }
    const currentDirectory = process.cwd();
    if (!canPrompt) {
        return currentDirectory;
    }
    const answer = await prompt(io, {
        type: 'input',
        message: 'Parent directory',
        defaultValue: currentDirectory,
    });
    if (typeof answer !== 'string' || answer.trim().length === 0) {
        return currentDirectory;
    }
    return path.resolve(answer.trim());
}

async function resolveProjectName(
    projectNameArgument: string | undefined,
    canPrompt: boolean,
    io: CliIo,
): Promise<string> {
    if (projectNameArgument !== undefined) {
        if (!projectNamePattern.test(projectNameArgument)) {
            throw new CliError(invalidProjectNameMessage, 2);
        }
        return projectNameArgument;
    }
    if (!canPrompt) {
        throw new CliError('Project name is required. Pass it as an argument or run in an interactive terminal.', 2);
    }
    for (;;) {
        const answer = await prompt(io, {
            type: 'input',
            message: 'Project name',
        });
        if (typeof answer !== 'string') {
            throw new CliError('Project name is required.', 2);
        }
        const projectName = answer.trim();
        if (projectNamePattern.test(projectName)) {
            return projectName;
        }
        io.stderr(`${invalidProjectNameMessage}\n`);
    }
}

async function resolveProfile(
    requestedProfile: string | undefined,
    registry: ContributionRegistry,
    canPrompt: boolean,
    io: CliIo,
): Promise<XsmpProjectContributionSelection | undefined> {
    if (requestedProfile !== undefined) {
        return resolveContribution('profile', requestedProfile, registry, io);
    }

    const summaries = sortedSummaries(registry.getContributionSummaries('profile'));
    const defaultProfile = summaries.find(summary => summary.defaultSelected);
    if (!canPrompt || summaries.length === 0) {
        return undefined;
    }

    const answer = await prompt(io, {
        type: 'select',
        message: 'Select a profile',
        choices: [
            ...summaries.map(toPromptChoice),
            { value: noProfileChoice, label: 'No profile' },
        ],
        defaultValue: defaultProfile?.id ?? noProfileChoice,
    });
    if (answer === noProfileChoice) {
        return undefined;
    }
    if (typeof answer !== 'string') {
        throw new CliError('A profile selection is required.', 2);
    }
    return resolveContribution('profile', answer, registry, io);
}

async function resolveTools(
    requestedTools: readonly string[] | undefined,
    registry: ContributionRegistry,
    canPrompt: boolean,
    io: CliIo,
): Promise<readonly XsmpProjectContributionSelection[]> {
    if (requestedTools !== undefined) {
        return deduplicateSelections(requestedTools.map(id => resolveContribution('tool', id, registry, io)));
    }

    const summaries = sortedSummaries(registry.getContributionSummaries('tool'));
    const defaultTools = summaries.filter(summary => summary.defaultSelected);
    if (!canPrompt || summaries.length === 0) {
        return [];
    }

    const answer = await prompt(io, {
        type: 'multiselect',
        message: 'Select tools (comma-separated)',
        choices: summaries.map(toPromptChoice),
        defaultValue: defaultTools.map(tool => tool.id),
    });
    if (!Array.isArray(answer) || !answer.every(value => typeof value === 'string')) {
        throw new CliError('A tool selection is required.', 2);
    }
    return deduplicateSelections(answer.map(id => resolveContribution('tool', id, registry, io)));
}

async function resolvePromptValues(
    settings: readonly string[] | undefined,
    profile: XsmpProjectContributionSelection | undefined,
    tools: readonly XsmpProjectContributionSelection[],
    registry: ContributionRegistry,
    canPrompt: boolean,
    io: CliIo,
): Promise<Readonly<Record<string, string | boolean>>> {
    const prompts = await getQualifiedPrompts(profile, tools, registry);
    const providedValues = parseSettings(settings ?? [], profile, tools, prompts, registry, io);

    const values: Record<string, string | boolean> = {};
    for (const item of prompts) {
        const providedValue = providedValues.get(item.qualifiedKey);
        if (providedValue !== undefined) {
            values[item.prompt.key] = parsePromptValue(item.prompt, providedValue, item.qualifiedKey);
            continue;
        }
        if (item.prompt.type === 'choice' && (item.prompt.choices?.length ?? 0) === 0) {
            if (item.prompt.defaultValue !== undefined) {
                values[item.prompt.key] = item.prompt.defaultValue;
                continue;
            }
            throw missingSettingError(item.qualifiedKey);
        }
        if (canPrompt) {
            const answer = await prompt(io, toPromptRequest(item.prompt));
            if (answer !== undefined) {
                values[item.prompt.key] = parsePromptValue(item.prompt, answer, item.qualifiedKey);
                continue;
            }
        }
        if (item.prompt.defaultValue !== undefined) {
            values[item.prompt.key] = item.prompt.defaultValue;
            continue;
        }
        throw missingSettingError(item.qualifiedKey);
    }
    return values;
}

function missingSettingError(key: string): CliError {
    return new CliError(`Missing required setting '${key}'. Pass --set ${key}=<value> or use interactive mode.`, 2);
}

async function getQualifiedPrompts(
    profile: XsmpProjectContributionSelection | undefined,
    tools: readonly XsmpProjectContributionSelection[],
    registry: ContributionRegistry,
): Promise<QualifiedPrompt[]> {
    const prompts: QualifiedPrompt[] = [];
    if (profile) {
        const profilePrompts = await registry.getWizardPrompts({
            selectedProfileId: profile.id,
            selectedToolIds: [],
        });
        prompts.push(...profilePrompts.map(promptDefinition => ({
            kind: 'profile' as const,
            qualifiedKey: `profile.${profile.id}.${promptDefinition.id}`,
            prompt: promptDefinition,
        })));
    }
    for (const tool of tools) {
        const toolPrompts = await registry.getWizardPrompts({
            selectedToolIds: [tool.id],
        });
        prompts.push(...toolPrompts.map(promptDefinition => ({
            kind: 'tool' as const,
            qualifiedKey: `tool.${tool.id}.${promptDefinition.id}`,
            prompt: promptDefinition,
        })));
    }
    return prompts;
}

function parseSettings(
    settings: readonly string[],
    profile: XsmpProjectContributionSelection | undefined,
    tools: readonly XsmpProjectContributionSelection[],
    prompts: readonly QualifiedPrompt[],
    registry: ContributionRegistry,
    io: CliIo,
): Map<string, string> {
    const values = new Map<string, string>();
    for (const setting of settings) {
        const separator = setting.indexOf('=');
        const key = separator < 0 ? '' : setting.slice(0, separator).trim();
        if (!key) {
            throw new CliError(
                `Invalid setting '${setting}'. Expected --set profile.<id>.<prompt>=value or --set tool.<id>.<prompt>=value.`,
                2,
            );
        }
        const promptDefinition = resolveQualifiedPrompt(key, profile, tools, prompts, registry, io);
        if (values.has(promptDefinition.qualifiedKey)) {
            throw new CliError(`Setting '${promptDefinition.qualifiedKey}' was specified more than once.`, 2);
        }
        values.set(promptDefinition.qualifiedKey, setting.slice(separator + 1));
    }
    return values;
}

function resolveQualifiedPrompt(
    key: string,
    profile: XsmpProjectContributionSelection | undefined,
    tools: readonly XsmpProjectContributionSelection[],
    prompts: readonly QualifiedPrompt[],
    registry: ContributionRegistry,
    io: CliIo,
): QualifiedPrompt {
    const exactPrompt = prompts.find(promptDefinition => promptDefinition.qualifiedKey === key);
    if (exactPrompt) {
        return exactPrompt;
    }

    const kind = key.startsWith('profile.') ? 'profile' : key.startsWith('tool.') ? 'tool' : undefined;
    if (!kind) {
        throw invalidQualifiedSettingError(key, prompts);
    }
    const remainder = key.slice(kind.length + 1);
    const match = findSettingContribution(kind, remainder, registry);
    if (!match) {
        const inputId = remainder.split('.')[0];
        const otherKind: XsmpContributionKind = kind === 'profile' ? 'tool' : 'profile';
        if (registry.resolveContribution(otherKind, inputId)) {
            throw new CliError(`Contribution '${inputId}' is a ${otherKind}, not a ${kind}.`, 2);
        }
        throw new CliError(`Unknown ${kind} '${inputId}' in setting '${key}'.`, 2);
    }
    if (match.resolution.kind === 'deprecatedAlias') {
        io.stderr(`warning ${kind} '${match.input}' is deprecated; use '${match.resolution.contribution.id}'.\n`);
    }

    const contributionId = match.resolution.contribution.id;
    const selected = kind === 'profile'
        ? profile?.id === contributionId
        : tools.some(tool => tool.id === contributionId);
    if (!selected) {
        throw new CliError(`${kind === 'profile' ? 'Profile' : 'Tool'} '${contributionId}' is not selected.`, 2);
    }

    const canonicalKey = `${kind}.${contributionId}.${match.promptId}`;
    const promptDefinition = prompts.find(prompt => prompt.qualifiedKey === canonicalKey);
    if (!promptDefinition) {
        throw invalidQualifiedSettingError(key, prompts);
    }
    return promptDefinition;
}

function findSettingContribution(
    kind: XsmpContributionKind,
    remainder: string,
    registry: ContributionRegistry,
) {
    const names = registry.getContributions(kind)
        .flatMap(contribution => [contribution.id, ...contribution.aliases, ...contribution.deprecatedAliases])
        .filter(name => remainder.startsWith(`${name}.`))
        .sort((left, right) => right.length - left.length);
    const input = names[0];
    if (!input) {
        return undefined;
    }
    const resolution = registry.resolveContribution(kind, input);
    if (!resolution) {
        return undefined;
    }
    return {
        input,
        resolution,
        promptId: remainder.slice(input.length + 1),
    };
}

function invalidQualifiedSettingError(key: string, prompts: readonly QualifiedPrompt[]): CliError {
    const available = prompts.length > 0
        ? ` Available settings: ${prompts.map(prompt => prompt.qualifiedKey).join(', ')}.`
        : '';
    return new CliError(`Unknown project setting '${key}'.${available}`, 2);
}

function parsePromptValue(
    promptDefinition: XsmpContributionWizardPrompt,
    value: CliPromptAnswer,
    displayKey: string,
): string | boolean {
    switch (promptDefinition.type) {
        case 'boolean': {
            if (typeof value === 'boolean') {
                return value;
            }
            if (typeof value === 'string' && value.toLowerCase() === 'true') {
                return true;
            }
            if (typeof value === 'string' && value.toLowerCase() === 'false') {
                return false;
            }
            throw new CliError(`Setting '${displayKey}' must be true or false.`, 2);
        }
        case 'choice': {
            if (typeof value !== 'string' || !promptDefinition.choices?.some(choice => choice.value === value)) {
                const choices = promptDefinition.choices?.map(choice => choice.value).join(', ') ?? '';
                throw new CliError(`Setting '${displayKey}' must be one of: ${choices}.`, 2);
            }
            return value;
        }
        case 'string':
        default:
            if (typeof value !== 'string') {
                throw new CliError(`Setting '${displayKey}' must be a string.`, 2);
            }
            return value;
    }
}

function toPromptRequest(promptDefinition: XsmpContributionWizardPrompt): CliPromptRequest {
    const message = `${promptDefinition.contributionId}: ${promptDefinition.label}`;
    switch (promptDefinition.type) {
        case 'boolean':
            return {
                type: 'confirm',
                message,
                defaultValue: typeof promptDefinition.defaultValue === 'boolean' ? promptDefinition.defaultValue : undefined,
            };
        case 'choice':
            return {
                type: 'select',
                message,
                choices: (promptDefinition.choices ?? []).map(choice => ({
                    value: choice.value,
                    label: choice.label ?? choice.value,
                    description: choice.description,
                })),
                defaultValue: typeof promptDefinition.defaultValue === 'string' ? promptDefinition.defaultValue : undefined,
            };
        case 'string':
        default:
            return {
                type: 'input',
                message,
                defaultValue: typeof promptDefinition.defaultValue === 'string' ? promptDefinition.defaultValue : undefined,
            };
    }
}

function resolveContribution(
    kind: XsmpContributionKind,
    input: string,
    registry: ContributionRegistry,
    io: CliIo,
): XsmpProjectContributionSelection {
    const resolution = registry.resolveContribution(kind, input);
    if (!resolution) {
        const otherKind: XsmpContributionKind = kind === 'profile' ? 'tool' : 'profile';
        if (registry.resolveContribution(otherKind, input)) {
            throw new CliError(`Contribution '${input}' is a ${otherKind}, not a ${kind}.`, 2);
        }
        const available = registry.getCanonicalNames(kind);
        const details = available.length > 0 ? ` Available ${kind}s: ${available.join(', ')}.` : '';
        throw new CliError(`Unknown ${kind} '${input}'.${details}`, 2);
    }
    if (resolution.kind === 'deprecatedAlias') {
        io.stderr(`warning ${kind} '${input}' is deprecated; use '${resolution.contribution.id}'.\n`);
    }
    return {
        id: resolution.contribution.id,
        label: resolution.contribution.wizard.label,
    };
}

async function prompt(io: CliIo, request: CliPromptRequest): Promise<CliPromptAnswer> {
    if (!io.prompt) {
        return undefined;
    }
    return await io.prompt(request);
}

function sortedSummaries(summaries: readonly XsmpContributionSummary[]): XsmpContributionSummary[] {
    return [...summaries].sort((left, right) => left.label.localeCompare(right.label));
}

function toPromptChoice(summary: XsmpContributionSummary) {
    return {
        value: summary.id,
        label: summary.label,
        description: summary.description,
    };
}

function deduplicateSelections(
    selections: readonly XsmpProjectContributionSelection[],
): readonly XsmpProjectContributionSelection[] {
    return [...new Map(selections.map(selection => [selection.id, selection])).values()];
}

function renderProjectSummary(
    io: CliIo,
    projectName: string,
    projectDir: string,
    profile: XsmpProjectContributionSelection | undefined,
    tools: readonly XsmpProjectContributionSelection[],
): void {
    io.stdout([
        '',
        'Project summary:',
        `  Name: ${projectName}`,
        `  Directory: ${projectDir}`,
        `  Profile: ${profile ? `${profile.label} (${profile.id})` : 'none'}`,
        `  Tools: ${tools.length > 0 ? tools.map(tool => `${tool.label} (${tool.id})`).join(', ') : 'none'}`,
        '',
    ].join('\n'));
}
