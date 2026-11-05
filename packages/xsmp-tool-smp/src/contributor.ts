import { SmpGenerator } from './generator.js';
import type { XsmpContributionRegistrationApi } from '@xsmp/core/contributions';

export function registerContribution(api: XsmpContributionRegistrationApi): void {
    api.setWizardMetadata({
        label: 'SMP',
        description: 'Generate SMP XML artifacts from XSMP models.',
    });
    api.addGenerator(services => new SmpGenerator(services));
}
