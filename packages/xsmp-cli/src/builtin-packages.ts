import { xsmpContributionPackage as esaCdkProfile } from '@xsmp/profile-esa-cdk';
import { xsmpContributionPackage as xsmpSdkProfile } from '@xsmp/profile-xsmp-sdk';
import { xsmpContributionPackage as adocTool } from '@xsmp/tool-adoc';
import { xsmpContributionPackage as pythonTool } from '@xsmp/tool-python';
import { xsmpContributionPackage as smpTool } from '@xsmp/tool-smp';
import { xsmpContributionPackage as tasMdkProfile } from 'xsmp-tas-mdk';
import type { XsmpContributionPackage } from 'xsmp/contributions';

export const cliBuiltinContributionPackages = [
    smpTool,
    adocTool,
    pythonTool,
    xsmpSdkProfile,
    esaCdkProfile,
    tasMdkProfile,
] as const;

export async function getCliBuiltinContributionPackages(): Promise<readonly XsmpContributionPackage[]> {
    return cliBuiltinContributionPackages;
}

export async function getCliBuiltinDirectory(): Promise<string | undefined> {
    return undefined;
}
