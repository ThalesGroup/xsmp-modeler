import type { XsmpContributionPackage } from 'xsmp/contributions';
import { registerContribution } from './contributor.js';

export { EsaCdkGenerator } from './generator.js';

export const xsmpContributionPackage: XsmpContributionPackage = {
    name: '@xsmp/profile-esa-cdk',
    extensionId: '@xsmp/profile-esa-cdk',
    descriptorUrl: new URL('./esa-cdk.xsmpprofile', import.meta.url),
    deprecatedAliases: ['org.eclipse.xsmp.profile.esa-cdk'],
    registerContribution,
};
