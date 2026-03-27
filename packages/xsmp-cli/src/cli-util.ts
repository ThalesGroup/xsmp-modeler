import { AstUtils, Cancellation, type LangiumDocument, type WorkspaceFolder } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { DiagnosticSeverity, type Diagnostic } from 'vscode-languageserver';
import { URI } from 'vscode-uri';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as ast from 'xsmp/ast-partial';
import { createXsmpServices, isSmpMirrorDocument } from 'xsmp';
import { cliBuiltinContributionPackages } from './builtin-packages.js';

const ignoredWorkspaceDirectories = new Set([
    '.git',
    '.tsbuildinfo',
    'coverage',
    'lib',
    'node_modules',
    'out',
]);

export interface CliIo {
    stdout(text: string): void;
    stderr(text: string): void;
}

export interface CliCommandOptions {
    workspaceRoot?: string;
}

export interface CliImportCommandOptions {
    output?: string;
    force?: boolean;
}

export interface CliProjectInput {
    readonly projectFile: string;
    readonly projectDir: string;
    readonly workspaceRoot: string;
}

export interface CliProjectContext {
    readonly services: ReturnType<typeof createXsmpServices>;
    readonly input: CliProjectInput;
    readonly targetDocument: LangiumDocument;
    readonly targetProject?: ast.Project;
    readonly scopedDocuments: readonly LangiumDocument[];
}

export interface CliDiagnostic {
    readonly document: LangiumDocument;
    readonly message: string;
    readonly severity: 'error' | 'warning' | 'information' | 'hint';
    readonly line: number;
    readonly column: number;
}

export interface CliMissingDependencyDiagnostic extends CliDiagnostic {
    readonly dependencyName: string;
}

export class CliError extends Error {
    readonly exitCode: 1 | 2;

    constructor(message: string, exitCode: 1 | 2 = 2) {
        super(message);
        this.name = 'CliError';
        this.exitCode = exitCode;
    }
}

export function createConsoleIo(): CliIo {
    return {
        stdout: text => process.stdout.write(text),
        stderr: text => process.stderr.write(text),
    };
}

export async function createCliServices() {
    const services = createXsmpServices(NodeFileSystem);
    const report = await services.shared.ContributionRegistry.registerBuiltinPackages(cliBuiltinContributionPackages);
    if (report.failures.length > 0) {
        const details = report.failures.map(failure => `[${failure.phase}] ${failure.extensionId}: ${failure.message}`).join('\n');
        throw new CliError(`Built-in XSMP contribution initialization failed:\n${details}`, 2);
    }
    return services;
}

export async function loadCliProjectContext(inputPath: string, options: CliCommandOptions = {}): Promise<CliProjectContext> {
    const input = await resolveCliProjectInput(inputPath, options.workspaceRoot);
    const services = await createCliServices();

    const folders = await discoverWorkspaceFolders(input.workspaceRoot, input.projectDir);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace(folders);
    await services.shared.workspace.DocumentBuilder.build(
        services.shared.workspace.LangiumDocuments.all.toArray(),
        { validation: true },
        Cancellation.CancellationToken.None,
    );

    const targetDocument = services.shared.workspace.LangiumDocuments.getDocument(URI.file(input.projectFile));
    if (!targetDocument) {
        throw new CliError(`Project file '${input.projectFile}' could not be loaded.`, 2);
    }

    const targetProject = ast.isProject(targetDocument.parseResult.value) ? targetDocument.parseResult.value : undefined;

    return {
        services,
        input,
        targetDocument,
        targetProject,
        scopedDocuments: getScopedDocuments(services.shared.workspace.LangiumDocuments.all.toArray(), services.shared.workspace.ProjectManager, targetDocument, targetProject),
    };
}

export async function resolveCliProjectInput(inputPath: string, workspaceRootOption?: string): Promise<CliProjectInput> {
    const resolvedPath = path.resolve(inputPath);
    const stat = await tryStat(resolvedPath);

    if (!stat) {
        throw new CliError(`Path '${inputPath}' does not exist.`, 2);
    }

    let projectFile: string;
    if (stat.isDirectory()) {
        projectFile = path.join(resolvedPath, 'xsmp.project');
        const projectStat = await tryStat(projectFile);
        if (!projectStat?.isFile()) {
            throw new CliError(`Directory '${inputPath}' does not contain an 'xsmp.project' file.`, 2);
        }
    } else if (stat.isFile()) {
        if (path.basename(resolvedPath) !== 'xsmp.project') {
            throw new CliError(`File '${inputPath}' is not an 'xsmp.project'.`, 2);
        }
        projectFile = resolvedPath;
    } else {
        throw new CliError(`Path '${inputPath}' is neither a project directory nor an 'xsmp.project' file.`, 2);
    }

    const projectDir = path.dirname(projectFile);
    const workspaceRoot = workspaceRootOption ? path.resolve(workspaceRootOption) : path.dirname(projectDir);
    const workspaceRootStat = await tryStat(workspaceRoot);
    if (!workspaceRootStat?.isDirectory()) {
        throw new CliError(`Workspace root '${workspaceRoot}' does not exist or is not a directory.`, 2);
    }

    return { projectFile, projectDir, workspaceRoot };
}

export async function discoverWorkspaceFolders(workspaceRoot: string, targetProjectDir: string): Promise<WorkspaceFolder[]> {
    const discoveredProjectDirs = new Set<string>();
    await collectProjectDirectories(workspaceRoot, discoveredProjectDirs);
    discoveredProjectDirs.add(targetProjectDir);

    return [...discoveredProjectDirs]
        .sort((left, right) => left.localeCompare(right))
        .map(directory => ({
            name: path.basename(directory),
            uri: URI.file(directory).toString(),
        }));
}

async function collectProjectDirectories(currentDir: string, projectDirs: Set<string>): Promise<void> {
    let entries;
    try {
        entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
        return;
    }

    if (entries.some(entry => entry.isFile() && entry.name === 'xsmp.project')) {
        projectDirs.add(currentDir);
    }

    await Promise.all(entries.map(async entry => {
        if (!entry.isDirectory() || ignoredWorkspaceDirectories.has(entry.name)) {
            return;
        }
        await collectProjectDirectories(path.join(currentDir, entry.name), projectDirs);
    }));
}

async function tryStat(filePath: string) {
    try {
        return await fs.stat(filePath);
    } catch {
        return undefined;
    }
}

function getScopedDocuments(
    allDocuments: readonly LangiumDocument[],
    projectManager: ReturnType<typeof createXsmpServices>['shared']['workspace']['ProjectManager'],
    targetDocument: LangiumDocument,
    targetProject: ast.Project | undefined,
): readonly LangiumDocument[] {
    if (!targetProject) {
        return [targetDocument];
    }

    const reachableProjects = projectManager.getDependencies(targetProject);
    const reachableProjectUris = new Set(
        [...reachableProjects].map(project => AstUtils.getDocument(project).uri.toString())
    );

    return allDocuments
        .filter(document => {
            if (reachableProjectUris.has(document.uri.toString())) {
                return true;
            }
            const ownerProject = projectManager.getProject(document);
            return Boolean(ownerProject && reachableProjects.has(ownerProject));
        })
        .sort((left, right) => left.uri.fsPath.localeCompare(right.uri.fsPath));
}

export function collectDiagnostics(
    documents: readonly LangiumDocument[],
    services?: ReturnType<typeof createXsmpServices>['shared'],
): CliDiagnostic[] {
    const diagnostics = new Map<string, CliDiagnostic>();

    for (const document of documents) {
        for (const parserError of document.parseResult.parserErrors) {
            const diagnostic = toCliParserErrorDiagnostic(document, parserError, services);
            diagnostics.set(createDiagnosticKey(diagnostic), diagnostic);
        }
        for (const diagnostic of document.diagnostics ?? []) {
            const cliDiagnostic = toCliDiagnostic(document, diagnostic, toSeverityLabel(diagnostic.severity), services);
            diagnostics.set(createDiagnosticKey(cliDiagnostic), cliDiagnostic);
        }
    }

    if (services) {
        for (const entry of services.SmpMirrorManager.getSourceDiagnosticEntries()) {
            for (const diagnostic of entry.diagnostics) {
                const cliDiagnostic = toCliDiagnostic(createUriOnlyDocument(entry.uri), diagnostic, toSeverityLabel(diagnostic.severity), services);
                diagnostics.set(createDiagnosticKey(cliDiagnostic), cliDiagnostic);
            }
        }
    }

    return sortCliDiagnostics([...diagnostics.values()]);
}

export function collectMissingDependencyDiagnostics(
    targetProject: ast.Project,
    projectManager: ReturnType<typeof createXsmpServices>['shared']['workspace']['ProjectManager'],
): CliMissingDependencyDiagnostic[] {
    const diagnostics = new Map<string, CliMissingDependencyDiagnostic>();
    const visited = new Set<ast.Project>();
    const queue: ast.Project[] = [targetProject];

    while (queue.length > 0) {
        const project = queue.shift();
        if (!project || visited.has(project)) {
            continue;
        }
        visited.add(project);

        for (const dependency of project.elements.filter(ast.isDependency)) {
            const dependencyName = dependency.project?.$refText ?? dependency.project?.ref?.name;
            if (!dependencyName) {
                continue;
            }

            const resolvedProject = dependency.project?.ref ?? projectManager.getProjectByName(dependencyName);
            if (resolvedProject) {
                queue.push(resolvedProject);
                continue;
            }

            const document = AstUtils.getDocument(project);
            const refNode = (dependency.project as { $refNode?: { range?: { start?: { line: number; character: number } } } } | undefined)?.$refNode;
            const start = refNode?.range?.start ?? dependency.$cstNode?.range.start;
            const diagnostic: CliMissingDependencyDiagnostic = {
                document,
                dependencyName,
                message: `Missing dependency project "${dependencyName}" in the scanned workspace.`,
                severity: 'error',
                line: (start?.line ?? 0) + 1,
                column: (start?.character ?? 0) + 1,
            };
            diagnostics.set(createDiagnosticKey(diagnostic), diagnostic);
        }
    }

    return sortCliDiagnostics([...diagnostics.values()]) as CliMissingDependencyDiagnostic[];
}

export function mergeDiagnostics(...groups: readonly CliDiagnostic[][]): CliDiagnostic[] {
    const diagnostics = new Map<string, CliDiagnostic>();
    for (const group of groups) {
        for (const diagnostic of group) {
            diagnostics.set(createDiagnosticKey(diagnostic), diagnostic);
        }
    }
    return sortCliDiagnostics([...diagnostics.values()]);
}

export function createCliDiagnostic(
    document: LangiumDocument,
    message: string,
    severity: CliDiagnostic['severity'] = 'error',
    line = 1,
    column = 1,
): CliDiagnostic {
    return {
        document,
        message,
        severity,
        line,
        column,
    };
}

function toCliDiagnostic(
    document: LangiumDocument,
    diagnostic: Diagnostic,
    severity: CliDiagnostic['severity'],
    services?: ReturnType<typeof createXsmpServices>['shared'],
): CliDiagnostic {
    const outputDocument = resolveCliDiagnosticDocument(document, services);
    return {
        document: outputDocument,
        message: diagnostic.message,
        severity,
        line: diagnostic.range.start.line + 1,
        column: diagnostic.range.start.character + 1,
    };
}

function toCliParserErrorDiagnostic(
    document: LangiumDocument,
    diagnostic: unknown,
    services?: ReturnType<typeof createXsmpServices>['shared'],
): CliDiagnostic {
    const parserError = diagnostic as {
        message?: string;
        token?: {
            startLine?: number;
            startColumn?: number;
        };
    };

    const outputDocument = resolveCliDiagnosticDocument(document, services);
    return {
        document: outputDocument,
        message: parserError.message ?? 'Parser error',
        severity: 'error',
        line: parserError.token?.startLine ?? 1,
        column: parserError.token?.startColumn ?? 1,
    };
}

function toSeverityLabel(severity: DiagnosticSeverity | undefined): CliDiagnostic['severity'] {
    switch (severity) {
        case DiagnosticSeverity.Warning:
            return 'warning';
        case DiagnosticSeverity.Information:
            return 'information';
        case DiagnosticSeverity.Hint:
            return 'hint';
        default:
            return 'error';
    }
}

function resolveCliDiagnosticDocument(
    document: LangiumDocument,
    services?: ReturnType<typeof createXsmpServices>['shared'],
): LangiumDocument {
    if (!services || !isSmpMirrorDocument(document.uri)) {
        return document;
    }
    const sourceUri = services.SmpMirrorManager.getSourceUri(document.uri);
    return sourceUri ? createUriOnlyDocument(sourceUri) : document;
}

function createUriOnlyDocument(uri: URI): LangiumDocument {
    return { uri } as LangiumDocument;
}

function createDiagnosticKey(diagnostic: CliDiagnostic): string {
    return [
        diagnostic.document.uri.toString(),
        diagnostic.line,
        diagnostic.column,
        diagnostic.severity,
        diagnostic.message,
    ].join(':');
}

export function renderDiagnostics(io: CliIo, diagnostics: readonly CliDiagnostic[], workspaceRoot: string): void {
    for (const diagnostic of diagnostics) {
        const relativePath = toDisplayPath(diagnostic.document.uri.fsPath, workspaceRoot);
        io.stderr(`${relativePath}:${diagnostic.line}:${diagnostic.column} ${diagnostic.severity} ${diagnostic.message}\n`);
    }
}

export function renderSummary(io: CliIo, diagnostics: readonly CliDiagnostic[]): void {
    const errors = diagnostics.filter(diagnostic => diagnostic.severity === 'error').length;
    const warnings = diagnostics.filter(diagnostic => diagnostic.severity === 'warning').length;
    io.stdout(`${errors} errors, ${warnings} warnings\n`);
}

export function hasErrors(diagnostics: readonly CliDiagnostic[]): boolean {
    return diagnostics.some(diagnostic => diagnostic.severity === 'error');
}

function sortCliDiagnostics<T extends CliDiagnostic>(diagnostics: readonly T[]): T[] {
    return [...diagnostics].sort((left, right) =>
        left.document.uri.fsPath.localeCompare(right.document.uri.fsPath)
        || left.line - right.line
        || left.column - right.column
        || left.message.localeCompare(right.message)
    );
}

function toDisplayPath(filePath: string, workspaceRoot: string): string {
    const relative = path.relative(workspaceRoot, filePath);
    return (relative.length > 0 ? relative : path.basename(filePath)).replaceAll(path.sep, '/');
}
