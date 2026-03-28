import { AstUtils, DefaultReferences, type AstNode, type CstNode } from 'langium';
import * as ast from '../generated/ast-partial.js';
import type { XsmpServices } from '../xsmp-module.js';

export class XsmpReferences extends DefaultReferences {
    protected readonly services: XsmpServices;

    constructor(services: XsmpServices) {
        super(services);
        this.services = services;
    }

    override findDeclarations(sourceCstNode: CstNode): AstNode[] {
        const templateDeclaration = this.findTemplateParameterFromCst(sourceCstNode);
        if (templateDeclaration) {
            return [templateDeclaration];
        }

        const declarations = super.findDeclarations(sourceCstNode);
        if (declarations.length > 0) {
            return declarations;
        }

        const patternSegment = AstUtils.getContainerOfType(sourceCstNode.astNode, ast.isPatternPathNamedSegment);
        if (!patternSegment) {
            return [];
        }
        const path = AstUtils.getContainerOfType(patternSegment, ast.isPath);
        if (path && (
            ast.isComponentConfiguration(path.$container)
            || ast.isConfigurationUsage(path.$container)
            || ast.isFieldValue(path.$container)
        )) {
            const { candidates, bindings } = this.services.shared.CfgPathResolver.getNamedSegmentContext(patternSegment);
            const matches = this.services.shared.IdentifierPatternService.matchCandidates(
                patternSegment,
                candidates,
                candidate => candidate.name ?? '',
                bindings
            ).matches;
            return matches.length === 1 ? [matches[0]] : [];
        }
        const target = this.services.shared.InstancePathResolver.getNamedSegmentTarget(patternSegment);
        return target ? [target] : [];
    }

    protected findTemplateParameterFromCst(sourceCstNode: CstNode): ast.TemplateParameter | undefined {
        if (ast.isIdentifierTemplatePart(sourceCstNode.astNode)) {
            return this.findTemplateParameter(sourceCstNode.astNode);
        }

        const parameterName = this.services.shared.IdentifierPatternService.getTemplateParameterName(sourceCstNode.text);
        if (!parameterName) {
            return undefined;
        }

        const astNode = sourceCstNode.astNode;
        if (ast.isModelInstance(astNode) || ast.isAssemblyInstance(astNode)) {
            const assembly = AstUtils.getContainerOfType(astNode, ast.isAssembly);
            return assembly?.parameters.find(parameter => parameter.name === parameterName);
        }

        return undefined;
    }

    protected findTemplateParameter(part: ast.IdentifierTemplatePart): ast.TemplateParameter | undefined {
        const parameterName = this.services.shared.IdentifierPatternService.getTemplateParameterName(part.text);
        if (!parameterName) {
            return undefined;
        }

        const task = AstUtils.getContainerOfType(part, ast.isTask);
        const taskAssembly = ast.isAssembly(task?.context?.ref) ? task.context.ref : undefined;
        if (taskAssembly) {
            const assemblyParameter = taskAssembly.parameters.find(parameter => parameter.name === parameterName);
            if (assemblyParameter) {
                return assemblyParameter;
            }
        }

        const configuration = AstUtils.getContainerOfType(part, ast.isComponentConfiguration);
        if (configuration) {
            const context = this.services.shared.CfgPathResolver.getConfigurationComponentContext(configuration).assemblyContext;
            const configurationAssembly = context?.assembly
                ?? (ast.isAssemblyInstance(context?.instance) && ast.isAssembly(context.instance.assembly?.ref) ? context.instance.assembly.ref : undefined);
            const assemblyParameter = configurationAssembly?.parameters.find(parameter => parameter.name === parameterName);
            if (assemblyParameter) {
                return assemblyParameter;
            }
        }

        const assembly = AstUtils.getContainerOfType(part, ast.isAssembly);
        if (assembly) {
            return assembly.parameters.find(parameter => parameter.name === parameterName);
        }

        const schedule = AstUtils.getContainerOfType(part, ast.isSchedule);
        if (schedule) {
            return schedule.parameters.find(parameter => parameter.name === parameterName);
        }

        const linkBase = AstUtils.getContainerOfType(part, ast.isLinkBase);
        const linkedAssembly = ast.isAssembly(linkBase?.assembly?.ref) ? linkBase.assembly.ref : undefined;
        return linkedAssembly?.parameters.find(parameter => parameter.name === parameterName);
    }
}
