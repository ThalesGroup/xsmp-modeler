import { AstUtils, type AstNode } from 'langium';
import * as ast from '../generated/ast-partial.js';
import type { XsmpServices } from '../xsmp-module.js';
import type { AssemblyPathContext } from './xsmp-instance-path-resolver.js';

export function findTemplateParameter(
    services: XsmpServices,
    node: AstNode,
    parameterName: string,
): ast.TemplateParameter | undefined {
    const task = AstUtils.getContainerOfType(node, ast.isTask);
    const taskAssembly = ast.isAssembly(task?.context?.ref) ? task.context.ref : undefined;
    if (taskAssembly) {
        const assemblyParameter = taskAssembly.parameters.find(parameter => parameter.name === parameterName);
        if (assemblyParameter) {
            return assemblyParameter;
        }
    }

    const configuration = AstUtils.getContainerOfType(node, ast.isComponentConfiguration);
    if (configuration) {
        const assemblyParameter = findConfigurationTemplateParameter(services, node, configuration, parameterName);
        if (assemblyParameter) {
            return assemblyParameter;
        }
    }

    const assembly = AstUtils.getContainerOfType(node, ast.isAssembly);
    if (assembly) {
        return assembly.parameters.find(parameter => parameter.name === parameterName);
    }

    const schedule = AstUtils.getContainerOfType(node, ast.isSchedule);
    if (schedule) {
        return schedule.parameters.find(parameter => parameter.name === parameterName);
    }

    const linkBase = AstUtils.getContainerOfType(node, ast.isLinkBase);
    const linkedAssembly = ast.isAssembly(linkBase?.assembly?.ref) ? linkBase.assembly.ref : undefined;
    return linkedAssembly?.parameters.find(parameter => parameter.name === parameterName);
}

function findConfigurationTemplateParameter(
    services: XsmpServices,
    node: AstNode,
    configuration: ast.ComponentConfiguration,
    parameterName: string,
): ast.TemplateParameter | undefined {
    const context = getConfigurationTemplateAssemblyContext(services, node, configuration);
    const assembly = getAssemblyFromContext(context);
    return assembly?.parameters.find(parameter => parameter.name === parameterName);
}

function getConfigurationTemplateAssemblyContext(
    services: XsmpServices,
    node: AstNode,
    configuration: ast.ComponentConfiguration,
): AssemblyPathContext | undefined {
    const path = AstUtils.getContainerOfType(node, ast.isPath);
    if (path?.$container === configuration) {
        const explicitAssembly = ast.isAssembly(configuration.context?.ref) ? configuration.context.ref : undefined;
        if (explicitAssembly) {
            return services.shared.InstancePathResolver.getAssemblyPathContextForAssembly(explicitAssembly);
        }
        const parent = ast.isComponentConfiguration(configuration.$container) ? configuration.$container : undefined;
        return parent
            ? services.shared.CfgPathResolver.getConfigurationComponentContext(parent).assemblyContext
            : undefined;
    }
    return services.shared.CfgPathResolver.getConfigurationComponentContext(configuration).assemblyContext;
}

function getAssemblyFromContext(context: AssemblyPathContext | undefined): ast.Assembly | undefined {
    return context?.assembly
        ?? (ast.isAssemblyInstance(context?.instance) && ast.isAssembly(context.instance.assembly?.ref)
            ? context.instance.assembly.ref
            : undefined);
}
