import type { LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node.js';
import * as vscode from 'vscode';
import * as path from 'node:path';
import satisfies from 'semver/functions/satisfies.js';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node.js';
import { builtInScheme } from 'xsmp';
import { createProjectWizard } from 'xsmp/wizard';
import { GetServerFileContentRequest, RegisterContributions } from 'xsmp/lsp';
import type {
    XsmpContributionRegistrationReport,
    XsmpExtensionContributionManifestEntry,
    XsmpResolvedContributionManifestEntry,
} from 'xsmp/contributions';
import { xsmpExtensionApiVersion } from 'xsmp';

let client: LanguageClient | undefined;
let contributionOutputChannel: vscode.OutputChannel | undefined;

// This function is called when the extension is activated.
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    contributionOutputChannel = vscode.window.createOutputChannel('XSMP Contributions');
    context.subscriptions.push(contributionOutputChannel);

    try {
        client = await startLanguageClient(context);
        BuiltinLibraryFileSystemProvider.register(context);
        await registerDiscoveredXsmpContributions(context);
    } catch (error) {
        logContributionMessage('Failed to activate XSMP extension.');
        logContributionError(error);
        contributionOutputChannel.show(true);
        throw error;
    }

    // New project Wizard
    context.subscriptions.push(
        vscode.commands.registerCommand('xsmp.wizard', () => createProjectWizard(getClient()))
    );
    context.subscriptions.push(
        vscode.commands.registerCommand('xsmp.registerContributor', async (entries: XsmpResolvedContributionManifestEntry | XsmpResolvedContributionManifestEntry[]) => {
            const payload = Array.isArray(entries) ? entries : [entries];
            const report = await getClient().sendRequest(RegisterContributions, payload);
            reportContributionRegistration(report, 'XSMP contribution registration completed with errors.');
        })
    );

}

async function registerDiscoveredXsmpContributions(context: vscode.ExtensionContext): Promise<void> {
    const contributions: XsmpResolvedContributionManifestEntry[] = [];
    const skippedEntries: string[] = [];
    for (const extension of vscode.extensions.all) {
        if (extension.id === context.extension.id) {
            continue;
        }

        const manifestEntries = readXsmpContributionEntries(extension.packageJSON);
        if (manifestEntries.length === 0) {
            continue;
        }

        for (const entry of manifestEntries) {
            if (!satisfies(xsmpExtensionApiVersion, entry.apiVersion)) {
                skippedEntries.push(`${extension.id}: skipped contribution '${entry.descriptor}' because API ${entry.apiVersion} does not satisfy ${xsmpExtensionApiVersion}`);
                continue;
            }
            contributions.push({
                extensionId: extension.id,
                extensionRoot: extension.extensionPath,
                descriptorPath: path.resolve(extension.extensionPath, entry.descriptor),
                handlerPath: path.resolve(extension.extensionPath, entry.handler),
                apiVersion: entry.apiVersion,
                aliases: [...(entry.aliases ?? [])],
                deprecatedAliases: [...(entry.deprecatedAliases ?? [])],
                builtins: [...(entry.builtins ?? [])].map(builtin => path.resolve(extension.extensionPath, builtin)),
                wizard: entry.wizard,
            });
        }
    }

    for (const message of skippedEntries) {
        logContributionMessage(message);
    }

    if (contributions.length > 0) {
        logContributionMessage(`Registering ${contributions.length} external XSMP contribution(s).`);
        const report = await getClient().sendRequest(RegisterContributions, contributions);
        reportContributionRegistration(report, 'Some XSMP contributions failed to initialize.');
    }
}

function readXsmpContributionEntries(packageJson: unknown): readonly XsmpExtensionContributionManifestEntry[] {
    if (typeof packageJson !== 'object' || packageJson === null) {
        return [];
    }
    const contributes = Reflect.get(packageJson, 'contributes');
    if (typeof contributes !== 'object' || contributes === null) {
        return [];
    }
    const xsmp = Reflect.get(contributes, 'xsmp');
    return Array.isArray(xsmp) ? xsmp as readonly XsmpExtensionContributionManifestEntry[] : [];
}

function reportContributionRegistration(
    report: XsmpContributionRegistrationReport,
    prefix: string,
): void {
    for (const entry of report.registered) {
        logContributionMessage(`Registered ${entry.kind} contribution '${entry.id}' from '${entry.extensionId}'.`);
    }

    if (report.failures.length === 0) {
        return;
    }

    logContributionMessage(`Encountered ${report.failures.length} contribution registration failure(s).`);
    for (const failure of report.failures) {
        logContributionMessage(`- ${failure.extensionId} [${failure.phase}] ${failure.contributionId ?? path.basename(failure.descriptorPath)}: ${failure.message}`);
        logContributionMessage(`  descriptor: ${failure.descriptorPath}`);
        logContributionMessage(`  handler: ${failure.handlerPath}`);
        if (failure.stack) {
            contributionOutputChannel?.appendLine(failure.stack);
        }
    }

    const details = report.failures
        .slice(0, 3)
        .map(failure => `${failure.extensionId} (${failure.phase}): ${failure.message}`)
        .join('\n');
    const remaining = report.failures.length > 3 ? `\n…and ${report.failures.length - 3} more.` : '';
    void vscode.window.showWarningMessage(`${prefix}\n${details}${remaining}`, 'Show Details')
        .then(selection => {
            if (selection === 'Show Details') {
                contributionOutputChannel?.show(true);
            }
        });
}

function logContributionMessage(message: string): void {
    contributionOutputChannel?.appendLine(`[${new Date().toISOString()}] ${message}`);
}

function logContributionError(error: unknown): void {
    if (error instanceof Error) {
        logContributionMessage(error.message);
        if (error.stack) {
            contributionOutputChannel?.appendLine(error.stack);
        }
        return;
    }
    logContributionMessage(String(error));
}

// This function is called when the extension is deactivated.
export function deactivate(): Thenable<void> | undefined {
    return client?.stop();
}

function getClient(): LanguageClient {
    if (!client) {
        throw new Error('XSMP language client is not initialized.');
    }
    return client;
}

async function startLanguageClient(context: vscode.ExtensionContext): Promise<LanguageClient> {
    const serverModule = context.asAbsolutePath(path.join('out', 'language', 'main.cjs')),
        // The debug options for the server
        // --inspect=6009: runs the server in Node's Inspector mode so VS Code can attach to the server for debugging.
        // By setting `process.env.DEBUG_BREAK` to a truthy value, the language server will wait until a debugger is attached.
        debugOptions = { execArgv: ['--nolazy', `--inspect${process.env.DEBUG_BREAK ? '-brk' : ''}=${process.env.DEBUG_SOCKET ?? '6009'}`] },

        // If the extension is launched in debug mode then the debug server options are used
        // Otherwise the run options are used
        serverOptions: ServerOptions = {
            run: { module: serverModule, transport: TransportKind.ipc },
            debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
        },

        // Options to control the language client
        clientOptions: LanguageClientOptions = {
            documentSelector: [
                { scheme: 'file', language: 'xsmpproject' },
                { scheme: builtInScheme, language: 'xsmpproject' },
                { scheme: 'file', language: 'xsmpcat' },
                { scheme: builtInScheme, language: 'xsmpcat' },
                { scheme: 'file', language: 'xsmpasb' },
                { scheme: builtInScheme, language: 'xsmpasb' },
                { scheme: 'file', language: 'xsmpcfg' },
                { scheme: builtInScheme, language: 'xsmpcfg' },
                { scheme: 'file', language: 'xsmplnk' },
                { scheme: builtInScheme, language: 'xsmplnk' },
                { scheme: 'file', language: 'xsmpsed' },
                { scheme: builtInScheme, language: 'xsmpsed' },
            ],
            markdown: {
                isTrusted: true, supportHtml: true
            },
        },

        // Create the language client and start the client.
        client = new LanguageClient(
            'xsmp',
            'Xsmp',
            serverOptions,
            clientOptions
        );
    // Start the client. This will also launch the server
    await client.start();
    return client;
}

export class BuiltinLibraryFileSystemProvider implements vscode.FileSystemProvider {

    static register(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.workspace.registerFileSystemProvider(builtInScheme, new BuiltinLibraryFileSystemProvider(), {
                isReadonly: true,
                isCaseSensitive: true
            }));
    }

    async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
        const date = Date.now();
        const value = await getClient().sendRequest(GetServerFileContentRequest, uri.toString());
        if (value) {
            return {
                ctime: date,
                mtime: date,
                size: Buffer.from(value).length,
                type: vscode.FileType.File
            };
        }

        return {
            ctime: date,
            mtime: date,
            size: 0,
            type: vscode.FileType.Unknown
        };
    }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const value = await getClient().sendRequest(GetServerFileContentRequest, uri.toString());
        if (value) { return new Uint8Array(Buffer.from(value)); }

        return new Uint8Array();
    }

    // The following class members only serve to satisfy the interface

    private readonly didChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    onDidChangeFile = this.didChangeFile.event;

    watch() {
        return {
            dispose: () => { }
        };
    }

    readDirectory(): [] {
        throw vscode.FileSystemError.NoPermissions();
    }

    createDirectory() {
        throw vscode.FileSystemError.NoPermissions();
    }

    writeFile() {
        throw vscode.FileSystemError.NoPermissions();
    }

    delete() {
        throw vscode.FileSystemError.NoPermissions();
    }

    rename() {
        throw vscode.FileSystemError.NoPermissions();
    }
}
