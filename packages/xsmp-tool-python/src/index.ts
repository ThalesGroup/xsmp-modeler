import type { XsmpContributionPackage } from 'xsmp/contributions';
import { registerContribution } from './contributor.js';

export { PythonGenerator } from './generator.js';

export const xsmpContributionPackage: XsmpContributionPackage = {
    name: '@xsmp/tool-python',
    extensionId: '@xsmp/tool-python',
    descriptorUrl: new URL('./python.xsmptool', import.meta.url),
    aliases: ['org.eclipse.xsmp.tool.python'],
    registerContribution,
};
