import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { XsmpContributionPackage } from 'xsmp/contributions';

const vscodeBuiltinContributionPackageNames = [
    '@xsmp/tool-smp',
    '@xsmp/tool-adoc',
    '@xsmp/tool-python',
    '@xsmp/profile-xsmp-sdk',
    '@xsmp/profile-esa-cdk',
] as const;

interface XsmpContributionPackageModule {
    readonly xsmpContributionPackage?: XsmpContributionPackage;
}

export async function loadVscodeBuiltinContributionPackages(vendorRoot: string): Promise<XsmpContributionPackage[]> {
    const packages: XsmpContributionPackage[] = [];

    for (const packageName of vscodeBuiltinContributionPackageNames) {
        const [, shortName] = packageName.split('/');
        const modulePath = path.join(vendorRoot, shortName, 'lib', 'index.js');
        const moduleUrl = pathToFileURL(modulePath).href;
        const contributionModule = await import(moduleUrl) as XsmpContributionPackageModule;
        if (!contributionModule.xsmpContributionPackage) {
            throw new Error(`Missing xsmpContributionPackage export in vendorized built-in '${packageName}'.`);
        }
        packages.push(contributionModule.xsmpContributionPackage);
    }

    return packages;
}
