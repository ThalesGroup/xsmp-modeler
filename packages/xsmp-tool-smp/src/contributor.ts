import { SmpGenerator } from './generator.js';
import type { XsmpContributionRegistrationApi } from 'xsmp/contributions';
import type { XsmpGenerator } from 'xsmp/generator';

export function registerContribution(api: XsmpContributionRegistrationApi): void {
    api.setWizardMetadata({
        label: 'SMP',
        description: 'Generate SMP XML artifacts from XSMP models.',
    });
    api.addGenerator(services => toXsmpGenerator(new SmpGenerator(services)));
}

function toXsmpGenerator(generator: XsmpGenerator): XsmpGenerator {
    return {
        generate: generator.generate.bind(generator),
        clean: generator.clean.bind(generator),
    };
}
