import { PythonGenerator } from './generator.js';
import { scaffoldPythonProject } from './scaffold.js';
import type { XsmpContributionRegistrationApi } from '@xsmp/core/contributions';

export function registerContribution(api: XsmpContributionRegistrationApi): void {
    api.setWizardMetadata({
        label: 'Python',
        description: 'Generate Python bindings and test scaffolding for projects using the xsmp-sdk profile.',
    });
    api.setScaffolder(scaffoldPythonProject);
    api.addGenerator(services => new PythonGenerator(services));
}
