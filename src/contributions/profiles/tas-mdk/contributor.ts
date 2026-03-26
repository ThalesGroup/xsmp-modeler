import { TasMdkGenerator } from './generator.js';
import { TasMdkPythonGenerator } from './python-generator.js';
import { scaffoldTasMdkProject } from './scaffold.js';
import { registerTasMdkValidationChecks } from './validator.js';
import type { XsmpContributionRegistrationApi } from '../../../contributions/index.js';
import type { XsmpGenerator } from '../../../generator/index.js';

export function registerContribution(api: XsmpContributionRegistrationApi): void {
    api.setWizardMetadata({
        label: 'TAS MDK',
        description: 'Prepare a project targeting the TAS MDK environment.',
    });
    api.setScaffolder(scaffoldTasMdkProject);
    api.addGenerator(services => toXsmpGenerator(new TasMdkGenerator(services)));
    api.addGenerator(services => toXsmpGenerator(new TasMdkPythonGenerator(services)));
    api.addValidation('xsmpcat', (services, category) => registerTasMdkValidationChecks(services, category));
}

function toXsmpGenerator(generator: XsmpGenerator): XsmpGenerator {
    return {
        generate: generator.generate.bind(generator),
        clean: generator.clean.bind(generator),
    };
}
