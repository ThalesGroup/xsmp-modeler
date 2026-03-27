import type { LangiumDocument } from 'langium';
import { xsmpContributionPackage as esaCdkProfile } from '@xsmp/profile-esa-cdk';
import { xsmpContributionPackage as tasMdkProfile } from '@xsmp/profile-tas-mdk';
import { xsmpContributionPackage as xsmpSdkProfile } from '@xsmp/profile-xsmp-sdk';
import { xsmpContributionPackage as adocTool } from '@xsmp/tool-adoc';
import { xsmpContributionPackage as pythonTool } from '@xsmp/tool-python';
import { xsmpContributionPackage as smpTool } from '@xsmp/tool-smp';
import { createXsmpServices, type XsmpServices } from 'xsmp';

const testBuiltinContributionPackages = [
    smpTool,
    adocTool,
    pythonTool,
    xsmpSdkProfile,
    esaCdkProfile,
    tasMdkProfile,
] as const;

export async function registerTestBuiltinPackages(services: { shared: XsmpServices['shared'] }): Promise<void> {
    const report = await services.shared.ContributionRegistry.registerBuiltinPackages(testBuiltinContributionPackages);
    if (report.failures.length > 0) {
        const details = report.failures.map(failure => `[${failure.phase}] ${failure.extensionId}: ${failure.message}`).join('\n');
        throw new Error(`Built-in XSMP contribution initialization failed:\n${details}`);
    }
}

export async function createBuiltinTestXsmpServices<TContext>(context: TContext): Promise<ReturnType<typeof createXsmpServices>> {
    const services = createXsmpServices(context as never);
    await registerTestBuiltinPackages(services);
    return services;
}

export async function rebuildTestDocuments(
    services: { shared: XsmpServices['shared'] },
    documents: LangiumDocument[],
    validation: boolean = true,
): Promise<void> {
    await services.shared.workspace.DocumentBuilder.build(documents, { validation });
}
