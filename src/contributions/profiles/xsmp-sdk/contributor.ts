import { XsmpSdkGenerator } from './generator.js';
import { scaffoldXsmpSdkProject } from './scaffold.js';
import type { XsmpContributionRegistrationApi } from '../../../contributions/index.js';
import type { XsmpGenerator } from '../../../generator/index.js';

export function registerContribution(api: XsmpContributionRegistrationApi): void {
    api.setWizardMetadata({
        label: 'XSMP SDK',
        description: 'Prepare a project using the XSMP SDK build layout.',
        defaultSelected: true,
    });
    api.setScaffolder(scaffoldXsmpSdkProject);
    api.addGenerator(services => toXsmpGenerator(new XsmpSdkGenerator(services)));
}

function toXsmpGenerator(generator: XsmpGenerator): XsmpGenerator {
    return {
        generate: generator.generate.bind(generator),
        clean: generator.clean.bind(generator),
    };
}
