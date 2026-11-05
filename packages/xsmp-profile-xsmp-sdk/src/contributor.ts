import { XsmpSdkGenerator } from './generator.js';
import { scaffoldXsmpSdkProject } from './scaffold.js';
import type { XsmpContributionRegistrationApi } from '@xsmp/core/contributions';

export function registerContribution(api: XsmpContributionRegistrationApi): void {
    api.setWizardMetadata({
        label: 'XSMP SDK',
        description: 'Recommended profile for projects using the XSMP SDK build and test workflow.',
        defaultSelected: true,
    });
    api.setScaffolder(scaffoldXsmpSdkProject);
    api.addGenerator(services => new XsmpSdkGenerator(services));
}
