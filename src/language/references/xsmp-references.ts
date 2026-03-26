import { AstUtils, DefaultReferences, type AstNode, type CstNode } from 'langium';
import * as ast from '../generated/ast.js';
import type { XsmpServices } from '../xsmp-module.js';

export class XsmpReferences extends DefaultReferences {
    protected readonly services: XsmpServices;

    constructor(services: XsmpServices) {
        super(services);
        this.services = services;
    }

    override findDeclaration(sourceCstNode: CstNode): AstNode | undefined {
        const templateDeclaration = this.findTemplateParameterFromCst(sourceCstNode);
        if (templateDeclaration) {
            return templateDeclaration;
        }

        const declaration = super.findDeclaration(sourceCstNode);
        if (declaration) {
            return declaration;
        }

        const patternSegment = AstUtils.getContainerOfType(sourceCstNode.astNode, ast.isPatternPathNamedSegment);
        if (!patternSegment) {
            return undefined;
        }
        return this.services.shared.L2PathResolver.getNamedSegmentTarget(patternSegment);
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
