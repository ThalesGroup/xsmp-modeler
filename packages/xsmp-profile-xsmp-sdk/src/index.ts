import type { XsmpContributionPackage } from 'xsmp/contributions';
import { registerContribution } from './contributor.js';

export { XsmpSdkGenerator } from './generator.js';

export const xsmpContributionPackage: XsmpContributionPackage = {
    name: '@xsmp/profile-xsmp-sdk',
    extensionId: '@xsmp/profile-xsmp-sdk',
    descriptorUrl: new URL('./xsmp-sdk.xsmpprofile', import.meta.url),
    deprecatedAliases: ['org.eclipse.xsmp.profile.xsmp-sdk'],
    registerContribution,
};
