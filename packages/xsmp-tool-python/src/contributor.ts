import { PythonGenerator } from './generator.js';
import { scaffoldPythonProject } from './scaffold.js';
import type { XsmpContributionRegistrationApi } from 'xsmp/contributions';
import type { XsmpGenerator } from 'xsmp/generator';

export function registerContribution(api: XsmpContributionRegistrationApi): void {
    api.setWizardMetadata({
        label: 'Python',
        description: 'Generate Python bindings and test scaffolding for projects using the xsmp-sdk profile.',
    });
    api.setScaffolder(scaffoldPythonProject);
    api.addGenerator(services => toXsmpGenerator(new PythonGenerator(services)));
}

function toXsmpGenerator(generator: XsmpGenerator): XsmpGenerator {
    return {
        generate: generator.generate.bind(generator),
        clean: generator.clean.bind(generator),
    };
}
