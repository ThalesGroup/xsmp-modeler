import { XsmpSdkGenerator } from './generator.js';
import { scaffoldXsmpSdkProject } from './scaffold.js';
import type { XsmpContributionRegistrationApi } from 'xsmp/contributions';
import type { XsmpGenerator } from 'xsmp/generator';

export function registerContribution(api: XsmpContributionRegistrationApi): void {
    api.setWizardMetadata({
        label: 'XSMP SDK',
        description: 'Recommended profile for projects using the XSMP SDK build and test workflow.',
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
