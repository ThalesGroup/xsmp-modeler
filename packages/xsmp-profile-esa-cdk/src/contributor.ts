import { EsaCdkGenerator } from './generator.js';
import { scaffoldEsaCdkProject } from './scaffold.js';
import type { XsmpContributionRegistrationApi } from 'xsmp/contributions';
import type { XsmpGenerator } from 'xsmp/generator';

export function registerContribution(api: XsmpContributionRegistrationApi): void {
    api.setWizardMetadata({
        label: 'ESA CDK',
        description: 'Prepare a project targeting the ESA SMP CDK environment.',
    });
    api.setScaffolder(scaffoldEsaCdkProject);
    api.addGenerator(services => toXsmpGenerator(new EsaCdkGenerator(services)));
}

function toXsmpGenerator(generator: XsmpGenerator): XsmpGenerator {
    return {
        generate: generator.generate.bind(generator),
        clean: generator.clean.bind(generator),
    };
}
