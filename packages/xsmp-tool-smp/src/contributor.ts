import { SmpGenerator } from './generator.js';
import type { XsmpContributionRegistrationApi } from '@xsmp/core/contributions';
import * as ast from '@xsmp/core/ast-partial';
import type { ValidationChecks } from 'langium';

export function registerContribution(api: XsmpContributionRegistrationApi): void {
    api.setWizardMetadata({
        label: 'SMP',
        description: 'Generate SMP XML artifacts from XSMP models.',
    });
    api.addGenerator(services => new SmpGenerator(services));
    api.addValidation('xsmpcat', (services, category) => {
        const checks: ValidationChecks<ast.XsmpAstType> = {
            AttributeType: (attributeType, accept) => {
                if (attributeType.default === undefined) {
                    accept('error', 'SMP export requires a default value for attribute types.', {
                        node: attributeType,
                        property: ast.AttributeType.name,
                    });
                }
            },
        };
        services.validation.ValidationRegistry.register(checks, undefined, category);
    });
}
