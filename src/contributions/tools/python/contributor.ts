import { PythonGenerator } from './generator.js';
import { scaffoldPythonProject } from './scaffold.js';
import type { XsmpContributionRegistrationApi } from '../../../contributions/index.js';
import type { XsmpGenerator } from '../../../generator/index.js';

export function registerContribution(api: XsmpContributionRegistrationApi): void {
    api.setWizardMetadata({
        label: 'Python',
        description: 'Generate Python bindings and test scaffolding.',
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
