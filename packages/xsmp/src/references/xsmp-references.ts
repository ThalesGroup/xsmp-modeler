import { AstUtils, DefaultReferences, type AstNode, type CstNode } from 'langium';
import * as ast from '../generated/ast-partial.js';
import type { XsmpServices } from '../xsmp-module.js';
import { findTemplateParameter } from './template-parameter-reference.js';

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
        const parameterName = this.services.shared.IdentifierPatternService.getTemplateParameterName(sourceCstNode.text);
        return parameterName ? findTemplateParameter(this.services, sourceCstNode.astNode, parameterName) : undefined;
    }
}
