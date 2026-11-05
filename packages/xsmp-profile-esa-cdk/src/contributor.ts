import { EsaCdkGenerator } from './generator.js';
import { scaffoldEsaCdkProject } from './scaffold.js';
import type { XsmpContributionRegistrationApi } from '@xsmp/core/contributions';

export function registerContribution(api: XsmpContributionRegistrationApi): void {
    api.setWizardMetadata({
        label: 'ESA CDK',
        description: 'Prepare a project targeting the ESA SMP CDK environment.',
    });
    api.setScaffolder(scaffoldEsaCdkProject);
    api.addGenerator(services => new EsaCdkGenerator(services));
}
