import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type {
    XsmpContributionScaffoldResult,
    XsmpProjectScaffoldRequest,
} from '../contributions/xsmp-extension-types.js';
import { toXsmpIdentifier } from '../utils/path-utils.js';

export interface XsmpProjectContributionSelection {
    readonly id: string;
    readonly label: string;
}

export interface CreateXsmpProjectRequest {
    /** Name written to the project descriptor and used for the starter catalogue. */
    readonly projectName: string;
    /** Final directory of the new project. */
    readonly projectDir: string;
    readonly profile?: XsmpProjectContributionSelection;
    readonly tools: readonly XsmpProjectContributionSelection[];
    readonly promptValues?: Readonly<Record<string, string | boolean>>;
    /** Roll back the project when a contribution scaffolder reports a failure. Defaults to true. */
    readonly failOnScaffoldError?: boolean;
}

export interface XsmpProjectScaffoldBackend {
    scaffoldProject(request: XsmpProjectScaffoldRequest): Promise<XsmpContributionScaffoldResult>;
}

export interface CreateXsmpProjectResult {
    readonly projectDir: string;
    readonly dependencies: readonly string[];
    readonly failures: XsmpContributionScaffoldResult['failures'];
}

export type XsmpProjectCreationErrorCode =
    | 'INVALID_NAME'
    | 'TARGET_EXISTS'
    | 'SCAFFOLD_FAILED'
    | 'IO_ERROR';

export class XsmpProjectCreationError extends Error {
    readonly code: XsmpProjectCreationErrorCode;
    readonly failures: XsmpContributionScaffoldResult['failures'];

    constructor(
        code: XsmpProjectCreationErrorCode,
        message: string,
        options?: {
            readonly cause?: unknown;
            readonly failures?: XsmpContributionScaffoldResult['failures'];
        },
    ) {
        super(message, { cause: options?.cause });
        this.name = 'XsmpProjectCreationError';
        this.code = code;
        this.failures = options?.failures ?? [];
    }
}

/** Creates a complete XSMP project and removes it again if creation fails. */
export async function createXsmpProject(
    request: CreateXsmpProjectRequest,
    backend: XsmpProjectScaffoldBackend,
): Promise<CreateXsmpProjectResult> {
    validateProjectName(request.projectName);

    const projectDir = path.resolve(request.projectDir);
    try {
        // Reserve the destination atomically. In addition to preventing accidental
        // overwrites, this keeps projectDir stable for contribution scaffolders.
        await fs.promises.mkdir(projectDir);
    } catch (error) {
        if (isNodeError(error) && error.code === 'EEXIST') {
            throw targetExistsError(projectDir, error);
        }
        throw ioError(`Could not prepare project folder '${projectDir}'.`, error);
    }

    try {
        const smdlPath = path.join(projectDir, 'smdl');
        await fs.promises.mkdir(smdlPath);

        const catalogueName = toXsmpIdentifier(request.projectName);
        await fs.promises.writeFile(
            path.join(smdlPath, `${request.projectName}.xsmpcat`),
            createCatalogueContent(request.projectName, catalogueName),
        );

        const scaffoldResult = await scaffoldProject(request, projectDir, backend);
        if ((request.failOnScaffoldError ?? true) && scaffoldResult.failures.length > 0) {
            throw new XsmpProjectCreationError(
                'SCAFFOLD_FAILED',
                formatScaffoldFailureMessage(scaffoldResult.failures),
                { failures: scaffoldResult.failures },
            );
        }

        await fs.promises.writeFile(
            path.join(projectDir, 'xsmp.project'),
            createProjectFileContent(request, scaffoldResult.dependencies),
        );

        return {
            projectDir,
            dependencies: scaffoldResult.dependencies,
            failures: scaffoldResult.failures,
        };
    } catch (error) {
        const cleanupError = await removeCreatedProjectDirectory(projectDir);
        if (cleanupError !== undefined) {
            const failureMessage = error instanceof Error ? error.message : String(error);
            const cleanupMessage = cleanupError instanceof Error ? cleanupError.message : String(cleanupError);
            throw new XsmpProjectCreationError(
                'IO_ERROR',
                `${failureMessage} Incomplete project folder '${projectDir}' could not be removed: ${cleanupMessage}`,
                {
                    cause: error,
                    failures: error instanceof XsmpProjectCreationError ? error.failures : undefined,
                },
            );
        }
        if (error instanceof XsmpProjectCreationError) {
            throw error;
        }
        throw ioError(`Could not create project '${request.projectName}'.`, error);
    }
}

async function scaffoldProject(
    request: CreateXsmpProjectRequest,
    projectDir: string,
    backend: XsmpProjectScaffoldBackend,
): Promise<XsmpContributionScaffoldResult> {
    try {
        return await backend.scaffoldProject({
            projectName: request.projectName,
            projectDir,
            selectedProfileId: request.profile?.id,
            selectedToolIds: request.tools.map(tool => tool.id),
            promptValues: request.promptValues,
        });
    } catch (error) {
        throw new XsmpProjectCreationError(
            'SCAFFOLD_FAILED',
            `Could not scaffold project '${request.projectName}'.`,
            { cause: error },
        );
    }
}

function validateProjectName(projectName: string): void {
    if (!/^[a-zA-Z][a-zA-Z0-9_.-]*$/.test(projectName)) {
        throw new XsmpProjectCreationError(
            'INVALID_NAME',
            String.raw`Project name must follow the format [a-zA-Z][a-zA-Z0-9_.-]*.`,
        );
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
    request: CreateXsmpProjectRequest,
    dependencies: readonly string[],
): string {
    let content = `
/**
 * XSMP Project configuration for ${request.projectName}
 */
project '${request.projectName}'

// project relative path(s) containing modeling file(s)
source 'smdl'

`;

    if (request.profile) {
        content += `
// use ${request.profile.label}
profile '${request.profile.id}'

`;
    }

    for (const tool of request.tools) {
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

async function removeCreatedProjectDirectory(projectDir: string): Promise<unknown | undefined> {
    try {
        await fs.promises.rm(projectDir, { recursive: true, force: true });
        return undefined;
    } catch (error) {
        return error;
    }
}

function targetExistsError(projectDir: string, cause?: unknown): XsmpProjectCreationError {
    return new XsmpProjectCreationError(
        'TARGET_EXISTS',
        `Project folder '${projectDir}' already exists.`,
        { cause },
    );
}

function ioError(message: string, cause: unknown): XsmpProjectCreationError {
    return new XsmpProjectCreationError('IO_ERROR', message, { cause });
}

function formatScaffoldFailureMessage(failures: XsmpContributionScaffoldResult['failures']): string {
    return `Project scaffold failed: ${failures
        .map(failure => `${failure.contributionId}: ${failure.message}`)
        .join('; ')}`;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
    return error instanceof Error;
}
