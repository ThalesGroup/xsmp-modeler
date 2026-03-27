import { ADocGenerator } from './generator.js';
import { scaffoldAdocProject } from './scaffold.js';
import type { XsmpContributionRegistrationApi } from 'xsmp/contributions';
import type { XsmpGenerator } from 'xsmp/generator';

export function registerContribution(api: XsmpContributionRegistrationApi): void {
    api.setWizardMetadata({
        label: 'AsciiDoc',
        description: 'Generate AsciiDoc documentation outputs for the project.',
    });
    api.setScaffolder(scaffoldAdocProject);
    api.addGenerator(services => toXsmpGenerator(new ADocGenerator(services)));
}

function toXsmpGenerator(generator: XsmpGenerator): XsmpGenerator {
    return {
        generate: generator.generate.bind(generator),
        clean: generator.clean.bind(generator),
    };
}
