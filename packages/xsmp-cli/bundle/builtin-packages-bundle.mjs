import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { embeddedAssetsHash, embeddedTextAssets } from 'xsmp-cli-embedded-assets';
import { registerContribution as registerEsaCdkContribution } from '../../xsmp-profile-esa-cdk/lib/contributor.js';
import { registerContribution as registerXsmpSdkContribution } from '../../xsmp-profile-xsmp-sdk/lib/contributor.js';
import { registerContribution as registerAdocContribution } from '../../xsmp-tool-adoc/lib/contributor.js';
import { registerContribution as registerPythonContribution } from '../../xsmp-tool-python/lib/contributor.js';
import { registerContribution as registerSmpContribution } from '../../xsmp-tool-smp/lib/contributor.js';
import { registerContribution as registerTasMdkContribution } from '../../xsmp-tas-mdk/lib/contributor.js';

const bundledContributionDefinitions = [
    {
        name: '@xsmp/tool-smp',
        extensionId: '@xsmp/tool-smp',
        descriptorPath: path.join('contributions', '@xsmp', 'tool-smp', 'smp.xsmptool'),
        deprecatedAliases: ['org.eclipse.xsmp.tool.smp'],
        registerContribution: registerSmpContribution,
    },
    {
        name: '@xsmp/tool-adoc',
        extensionId: '@xsmp/tool-adoc',
        descriptorPath: path.join('contributions', '@xsmp', 'tool-adoc', 'adoc.xsmptool'),
        deprecatedAliases: ['org.eclipse.xsmp.tool.adoc'],
        registerContribution: registerAdocContribution,
    },
    {
        name: '@xsmp/tool-python',
        extensionId: '@xsmp/tool-python',
        descriptorPath: path.join('contributions', '@xsmp', 'tool-python', 'python.xsmptool'),
        deprecatedAliases: ['org.eclipse.xsmp.tool.python'],
        registerContribution: registerPythonContribution,
    },
    {
        name: '@xsmp/profile-xsmp-sdk',
        extensionId: '@xsmp/profile-xsmp-sdk',
        descriptorPath: path.join('contributions', '@xsmp', 'profile-xsmp-sdk', 'xsmp-sdk.xsmpprofile'),
        deprecatedAliases: ['org.eclipse.xsmp.profile.xsmp-sdk'],
        registerContribution: registerXsmpSdkContribution,
    },
    {
        name: '@xsmp/profile-esa-cdk',
        extensionId: '@xsmp/profile-esa-cdk',
        descriptorPath: path.join('contributions', '@xsmp', 'profile-esa-cdk', 'esa-cdk.xsmpprofile'),
        deprecatedAliases: ['org.eclipse.xsmp.profile.esa-cdk'],
        registerContribution: registerEsaCdkContribution,
    },
    {
        name: 'xsmp-tas-mdk',
        extensionId: 'xsmp-tas-mdk',
        descriptorPath: path.join('contributions', 'xsmp-tas-mdk', 'tas-mdk.xsmpprofile'),
        deprecatedAliases: ['org.eclipse.xsmp.profile.tas-mdk'],
        registerContribution: registerTasMdkContribution,
    },
];

let bundledRuntimePromise;

export async function getCliBuiltinContributionPackages() {
    const runtime = await getBundledRuntime();
    return bundledContributionDefinitions.map(definition => ({
        name: definition.name,
        extensionId: definition.extensionId,
        descriptorUrl: pathToFileURL(path.join(runtime.rootDir, definition.descriptorPath)),
        aliases: definition.aliases,
        deprecatedAliases: definition.deprecatedAliases,
        registerContribution: definition.registerContribution,
    }));
}

export async function getCliBuiltinDirectory() {
    const runtime = await getBundledRuntime();
    return runtime.builtinDir;
}

async function getBundledRuntime() {
    bundledRuntimePromise ??= extractBundledAssets();
    return bundledRuntimePromise;
}

async function extractBundledAssets() {
    const version = process.env.XSMP_CLI_VERSION ?? 'dev';
    const rootDir = path.join(os.tmpdir(), 'xsmpproject-cli', `${version}-${embeddedAssetsHash}`);

    await Promise.all(
        Object.entries(embeddedTextAssets).map(async ([relativePath, content]) => {
            const targetPath = path.join(rootDir, relativePath);
            try {
                const existing = await fs.readFile(targetPath, 'utf8');
                if (existing === content) {
                    return;
                }
            } catch {
                // Asset not extracted yet.
            }
            await fs.mkdir(path.dirname(targetPath), { recursive: true });
            await fs.writeFile(targetPath, content, 'utf8');
        }),
    );

    return {
        rootDir,
        builtinDir: path.join(rootDir, 'xsmp', 'builtins'),
    };
}
