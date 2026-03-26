import { AstUtils, type ValidationAcceptor, type ValidationChecks } from 'langium';
import * as ast from '../generated/ast-partial.js';
import type { XsmpasbServices } from '../xsmpasb-module.js';
import { checkNoParentTraversal, checkRelativePath } from './l2-validator-utils.js';
import { checkName } from './name-validator-utils.js';

export function registerXsmpasbValidationChecks(services: XsmpasbServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.XsmpasbValidator;
    const checks: ValidationChecks<ast.XsmpAstType> = {
        Assembly: validator.checkAssembly,
        ModelInstance: validator.checkModelInstance,
        AssemblyInstance: validator.checkAssemblyInstance,
        StringParameter: validator.checkStringParameter,
        Int32Parameter: validator.checkInt32Parameter,
        AssemblyComponentConfiguration: validator.checkComponentConfiguration,
        FieldValue: validator.checkFieldValue,
        EventLink: validator.checkEventLink,
        FieldLink: validator.checkFieldLink,
        InterfaceLink: validator.checkInterfaceLink,
        OperationCall: validator.checkOperationCall,
    };
    registry.register(checks, validator, 'fast');
}

export class XsmpasbValidator {
    constructor(_services: XsmpasbServices) { }

    checkAssembly(assembly: ast.Assembly, accept: ValidationAcceptor): void {
        checkName(accept, assembly, assembly.name, 'name');

        const seen = new Set<string>();
        for (const parameter of assembly.parameters) {
            if (parameter.name) {
                if (seen.has(parameter.name)) {
                    accept('error', 'Duplicated template argument name.', { node: parameter, property: 'name' });
                } else {
                    seen.add(parameter.name);
                }
            }
        }
    }

    checkModelInstance(model: ast.ModelInstance, accept: ValidationAcceptor): void {
        checkName(accept, model, model.name, 'name');

        const seen = new Set<string>();
        for (const subInstance of model.elements.filter(ast.isSubInstance)) {
            const instance = subInstance.instance;
            const instanceName = instance?.name;
            if (!instanceName) {
                continue;
            }
            if (seen.has(instanceName)) {
                accept('error', 'Child Model Instance and Assembly Instance names shall be unique at the same hierarchy level.', {
                    node: instance,
                    property: 'name'
                });
            } else {
                seen.add(instanceName);
            }
        }
    }

    checkAssemblyInstance(instance: ast.AssemblyInstance, accept: ValidationAcceptor): void {
        checkName(accept, instance, instance.name, 'name');
    }

    checkStringParameter(parameter: ast.StringParameter, accept: ValidationAcceptor): void {
        checkName(accept, parameter, parameter.name, 'name');
        if (AstUtils.getContainerOfType(parameter, ast.isAssembly) && parameter.value === undefined) {
            accept('error', 'A Template Argument shall have a Value feature.', { node: parameter, property: 'value' });
        }
    }

    checkInt32Parameter(parameter: ast.Int32Parameter, accept: ValidationAcceptor): void {
        checkName(accept, parameter, parameter.name, 'name');
        if (AstUtils.getContainerOfType(parameter, ast.isAssembly) && parameter.value === undefined) {
            accept('error', 'A Template Argument shall have a Value feature.', { node: parameter, property: 'value' });
        }
    }

    checkComponentConfiguration(configuration: ast.AssemblyComponentConfiguration, accept: ValidationAcceptor): void {
        checkNoParentTraversal(accept, configuration, configuration.name, 'name');
        checkRelativePath(accept, configuration, configuration.name, 'name', 'InstancePath');
    }

    checkFieldValue(fieldValue: ast.FieldValue, accept: ValidationAcceptor): void {
        checkNoParentTraversal(accept, fieldValue, fieldValue.field, 'field');
        if (fieldValue.field?.startsWith('/')) {
            accept('error', 'Field paths in an Assembly shall be relative to the current component instance.', {
                node: fieldValue,
                property: 'field'
            });
        }
    }

    checkEventLink(link: ast.EventLink, accept: ValidationAcceptor): void {
        this.checkLinkPaths(link, accept);
    }

    checkFieldLink(link: ast.FieldLink, accept: ValidationAcceptor): void {
        this.checkLinkPaths(link, accept);
    }

    checkInterfaceLink(link: ast.InterfaceLink, accept: ValidationAcceptor): void {
        this.checkLinkPaths(link, accept);
    }

    checkOperationCall(call: ast.OperationCall, accept: ValidationAcceptor): void {
        const seen = new Set<string>();
        for (let index = 0; index < call.parameters.length; index++) {
            const parameter = call.parameters[index];
            if (!parameter.parameter) {
                continue;
            }
            if (seen.has(parameter.parameter)) {
                accept('error', 'Duplicated parameter name.', { node: call, property: 'parameters', index });
            } else {
                seen.add(parameter.parameter);
            }
        }
    }

    private checkLinkPaths(link: ast.Link, accept: ValidationAcceptor): void {
        checkNoParentTraversal(accept, link, link.ownerPath, 'ownerPath');
        checkNoParentTraversal(accept, link, link.clientPath, 'clientPath');
        if (link.ownerPath?.startsWith('/')) {
            accept('error', 'The Owner Path shall refer to the current Model Instance or one of its children.', {
                node: link,
                property: 'ownerPath'
            });
        }
        if (link.clientPath?.startsWith('/')) {
            accept('error', 'The Client Path shall refer to the current Model Instance or one of its children.', {
                node: link,
                property: 'clientPath'
            });
        }
    }
}
