import type { XsmpContributionPackage } from 'xsmp/contributions';
import { registerContribution } from './contributor.js';

export { ADocGenerator } from './generator.js';

export const xsmpContributionPackage: XsmpContributionPackage = {
    name: '@xsmp/tool-adoc',
    extensionId: '@xsmp/tool-adoc',
    descriptorUrl: new URL('./adoc.xsmptool', import.meta.url),
    deprecatedAliases: ['org.eclipse.xsmp.tool.adoc'],
    registerContribution,
};
