import { AstUtils, type AstNode, type ValidationAcceptor } from 'langium';
import * as ast from '../generated/ast-partial.js';
import type { IdentifierPatternService } from '../references/identifier-pattern-service.js';

export function collectUsedTemplateParameterNames(
    root: AstNode,
    identifierPatternService: IdentifierPatternService,
): Set<string> {
    const used = new Set<string>();

    for (const node of AstUtils.streamAst(root)) {
        if (ast.isPathNamedSegment(node)) {
            for (const name of identifierPatternService.getSegmentTemplateNames(node)) {
                used.add(name);
            }
            continue;
        }

        if (ast.isModelInstance(node) || ast.isAssemblyInstance(node)) {
            for (const name of identifierPatternService.getTemplateNames(node.name)) {
                used.add(name);
            }
        }
    }

    return used;
}

export function warnUnusedTemplateParameters(
    parameters: readonly ast.TemplateParameter[],
    usedTemplateNames: ReadonlySet<string>,
    accept: ValidationAcceptor,
): void {
    for (const parameter of parameters) {
        if (!parameter.name || usedTemplateNames.has(parameter.name)) {
            continue;
        }
        accept('warning', `The Template Parameter '${parameter.name}' is not used.`, {
            node: parameter,
            property: 'name',
        });
    }
}
