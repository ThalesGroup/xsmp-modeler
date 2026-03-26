import { ADocGenerator } from './generator.js';
import { scaffoldAdocProject } from './scaffold.js';
import type { XsmpContributionRegistrationApi } from '../../../language/contributions/xsmp-extension-types.js';
import type { XsmpGenerator } from '../../../language/generator/generator.js';

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
