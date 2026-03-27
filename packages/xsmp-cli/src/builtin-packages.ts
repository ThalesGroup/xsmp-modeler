import { xsmpContributionPackage as esaCdkProfile } from '@xsmp/profile-esa-cdk';
import { xsmpContributionPackage as tasMdkProfile } from '@xsmp/profile-tas-mdk';
import { xsmpContributionPackage as xsmpSdkProfile } from '@xsmp/profile-xsmp-sdk';
import { xsmpContributionPackage as adocTool } from '@xsmp/tool-adoc';
import { xsmpContributionPackage as pythonTool } from '@xsmp/tool-python';
import { xsmpContributionPackage as smpTool } from '@xsmp/tool-smp';

export const cliBuiltinContributionPackages = [
    smpTool,
    adocTool,
    pythonTool,
    xsmpSdkProfile,
    esaCdkProfile,
    tasMdkProfile,
] as const;
