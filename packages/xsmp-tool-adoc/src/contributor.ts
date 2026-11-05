import { ADocGenerator } from './generator.js';
import { scaffoldAdocProject } from './scaffold.js';
import type { XsmpContributionRegistrationApi } from '@xsmp/core/contributions';

export function registerContribution(api: XsmpContributionRegistrationApi): void {
    api.setWizardMetadata({
        label: 'AsciiDoc',
        description: 'Generate AsciiDoc documentation outputs for the project.',
    });
    api.setScaffolder(scaffoldAdocProject);
    api.addGenerator(services => new ADocGenerator(services));
}
