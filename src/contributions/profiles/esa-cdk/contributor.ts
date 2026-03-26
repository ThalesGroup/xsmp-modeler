import { EsaCdkGenerator } from './generator.js';
import { scaffoldEsaCdkProject } from './scaffold.js';
import type { XsmpContributionRegistrationApi } from '../../../language/contributions/xsmp-extension-types.js';
import type { XsmpGenerator } from '../../../language/generator/generator.js';

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
