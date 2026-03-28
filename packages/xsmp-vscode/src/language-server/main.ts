import * as path from 'node:path';
import { NodeFileSystem } from 'langium/node';
import { startLanguageServer } from 'langium/lsp';
import { ProposedFeatures, createConnection } from 'vscode-languageserver/node.js';
import { createXsmpServices } from 'xsmp';
import { loadVscodeBuiltinContributionPackages } from '../builtin-packages.js';

async function main(): Promise<void> {
    // Create a connection to the client
    const connection = createConnection(ProposedFeatures.all);
    const vendorRoot = path.resolve(__dirname, '..', 'vendor', '@xsmp');
    const builtinDir = path.resolve(__dirname, '..', 'vendor', 'xsmp', 'builtins');

    // Inject the shared services and language-specific services
    const { shared } = createXsmpServices({ connection, ...NodeFileSystem, builtinDir });
    const builtinPackages = await loadVscodeBuiltinContributionPackages(vendorRoot);
    const report = await shared.ContributionRegistry.registerBuiltinPackages(builtinPackages);
    if (report.failures.length > 0) {
        const messages = report.failures.map(failure => `[${failure.phase}] ${failure.extensionId}: ${failure.message}`);
        throw new AggregateError([], `Built-in XSMP contribution initialization failed:\n${messages.join('\n')}`);
    }

    // Start the language server with the shared services
    startLanguageServer(shared);
}

void (async () => {
    try {
        await main();
    } catch (error) {
        console.error(error);
        process.exitCode = 1;
    }
})();
