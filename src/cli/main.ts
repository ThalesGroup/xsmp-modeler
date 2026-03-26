import { Cancellation } from 'langium';
import { Command, CommanderError } from 'commander';
import { xsmpVersion } from '../language/version.js';
import {
    CliError,
    collectDiagnostics,
    collectMissingDependencyDiagnostics,
    createCliDiagnostic,
    createConsoleIo,
    type CliCommandOptions,
    type CliIo,
    hasErrors,
    loadCliProjectContext,
    mergeDiagnostics,
    renderDiagnostics,
    renderSummary,
} from './cli-util.js';

export async function runCli(argv: readonly string[] = process.argv, io: CliIo = createConsoleIo()): Promise<number> {
    let exitCode = 0;
    const program = createProgram(io, async (inputPath, options) => {
        exitCode = await validateCommand(inputPath, options, io);
    }, async (inputPath, options) => {
        exitCode = await generateCommand(inputPath, options, io);
    });

    try {
        await program.parseAsync([...argv], { from: 'node' });
        return exitCode;
    } catch (error) {
        if (error instanceof CommanderError) {
            return error.exitCode;
        }
        if (error instanceof CliError) {
            io.stderr(`${error.message}\n`);
            return error.exitCode;
        }
        io.stderr(`${formatUnexpectedError(error)}\n`);
        return 2;
    }
}

type CliAction = (inputPath: string, options: CliCommandOptions) => Promise<void>;

function createProgram(io: CliIo, onValidate: CliAction, onGenerate: CliAction): Command {
    const program = new Command();
    program
        .name('xsmpproject-cli')
        .description('Validate and generate XSMP projects.')
        .version(xsmpVersion)
        .showHelpAfterError()
        .configureOutput({
            writeOut: text => io.stdout(text),
            writeErr: text => io.stderr(text),
        })
        .exitOverride();

    program
        .command('validate')
        .argument('<path>', 'project directory or xsmp.project file')
        .option('-w, --workspace-root <dir>', 'workspace root to scan for xsmp.project dependencies')
        .description('validate the target XSMP project and its visible dependency closure')
        .action(onValidate);

    program
        .command('generate')
        .argument('<path>', 'project directory or xsmp.project file')
        .option('-w, --workspace-root <dir>', 'workspace root to scan for xsmp.project dependencies')
        .description('validate the target XSMP project, then run its active tool/profile generators')
        .action(onGenerate);

    return program;
}

async function validateCommand(inputPath: string, options: CliCommandOptions, io: CliIo): Promise<number> {
    const context = await loadCliProjectContext(inputPath, options);
    const diagnostics = collectProjectDiagnostics(context);
    renderDiagnostics(io, diagnostics, context.input.workspaceRoot);
    renderSummary(io, diagnostics);
    return hasErrors(diagnostics) ? 1 : 0;
}

async function generateCommand(inputPath: string, options: CliCommandOptions, io: CliIo): Promise<number> {
    const context = await loadCliProjectContext(inputPath, options);
    const diagnostics = collectProjectDiagnostics(context);
    renderDiagnostics(io, diagnostics, context.input.workspaceRoot);
    renderSummary(io, diagnostics);

    if (hasErrors(diagnostics)) {
        return 1;
    }
    if (!context.targetProject) {
        return 1;
    }

    await context.services.shared.DocumentGenerator.generateProject(context.targetProject, Cancellation.CancellationToken.None);
    io.stdout(`Generated outputs for project "${context.targetProject.name}".\n`);
    return 0;
}

function collectProjectDiagnostics(context: Awaited<ReturnType<typeof loadCliProjectContext>>) {
    const diagnostics = collectDiagnostics(context.scopedDocuments);
    const projectDiagnostics = context.targetProject
        ? collectMissingDependencyDiagnostics(context.targetProject, context.services.shared.workspace.ProjectManager)
        : [createCliDiagnostic(context.targetDocument, 'Input file does not declare an XSMP project root.')];

    const filteredDiagnostics = diagnostics.filter(diagnostic =>
        !projectDiagnostics.some(projectDiagnostic =>
            projectDiagnostic.document.uri.toString() === diagnostic.document.uri.toString()
            && projectDiagnostic.line === diagnostic.line
            && projectDiagnostic.column === diagnostic.column
        )
    );

    return mergeDiagnostics(filteredDiagnostics, projectDiagnostics);
}

function formatUnexpectedError(error: unknown): string {
    if (error instanceof Error) {
        return error.stack ?? error.message;
    }
    return String(error);
}

export default runCli;
