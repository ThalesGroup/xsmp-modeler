import type { XsmpContributionPackage } from 'xsmp/contributions';
import { registerContribution } from './contributor.js';

export { SmpGenerator } from './generator.js';

export const xsmpContributionPackage: XsmpContributionPackage = {
    name: '@xsmp/tool-smp',
    extensionId: '@xsmp/tool-smp',
    descriptorUrl: new URL('./smp.xsmptool', import.meta.url),
    deprecatedAliases: ['org.eclipse.xsmp.tool.smp'],
    registerContribution,
};
