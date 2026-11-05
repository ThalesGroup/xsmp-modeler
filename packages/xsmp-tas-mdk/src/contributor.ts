import { TasMdkGenerator } from './generator.js';
import { TasMdkPythonGenerator } from './python-generator.js';
import { scaffoldTasMdkProject } from './scaffold.js';
import { registerTasMdkValidationChecks } from './validator.js';
import type { XsmpContributionRegistrationApi } from '@xsmp/core/contributions';

export function registerContribution(api: XsmpContributionRegistrationApi): void {
    api.setWizardMetadata({
        label: 'TAS MDK',
        description: 'Prepare a project targeting the TAS MDK environment.',
    });
    api.setScaffolder(scaffoldTasMdkProject);
    api.addGenerator(services => new TasMdkGenerator(services));
    api.addGenerator(services => new TasMdkPythonGenerator(services));
    api.addValidation('xsmpcat', (services, category) => registerTasMdkValidationChecks(services, category));
}
