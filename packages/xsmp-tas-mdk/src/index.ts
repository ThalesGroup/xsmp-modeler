import type { XsmpContributionPackage } from 'xsmp/contributions';
import { registerContribution } from './contributor.js';

export { TasMdkGenerator } from './generator.js';
export { TasMdkPythonGenerator } from './python-generator.js';

export const xsmpContributionPackage: XsmpContributionPackage = {
    name: 'xsmp-tas-mdk',
    extensionId: 'xsmp-tas-mdk',
    descriptorUrl: new URL('./tas-mdk.xsmpprofile', import.meta.url),
    deprecatedAliases: ['org.eclipse.xsmp.profile.tas-mdk'],
    registerContribution,
};
