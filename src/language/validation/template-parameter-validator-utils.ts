import { AstUtils, type AstNode, type ValidationAcceptor } from 'langium';
import * as ast from '../generated/ast-partial.js';
import type { IdentifierPatternService } from '../references/identifier-pattern-service.js';
import type { XsmpPathService } from '../references/xsmp-path-service.js';
import { isValidExpandedL2Identifier } from './l2-validator-utils.js';

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
            property: ast.TemplateParameter.name,
        });
    }
}

export function createTemplateBindings(parameters: readonly ast.TemplateParameter[]): Map<string, string> {
    const bindings = new Map<string, string>();
    for (const parameter of parameters) {
        if (!parameter.name) {
            continue;
        }
        if (ast.isStringParameter(parameter) && parameter.value !== undefined) {
            bindings.set(parameter.name, parameter.value.startsWith('"') && parameter.value.endsWith('"')
                ? parameter.value.slice(1, -1)
                : parameter.value);
        } else if (ast.isInt32Parameter(parameter) && parameter.value !== undefined) {
            bindings.set(parameter.name, parameter.value.toString());
        }
    }
    return bindings;
}

export function checkTemplatedL2PathSegments(
    path: ast.Path,
    availableTemplateNames: ReadonlySet<string | undefined>,
    bindings: ReadonlyMap<string, string>,
    identifierPatternService: IdentifierPatternService,
    pathService: XsmpPathService,
    accept: ValidationAcceptor,
    missingPlaceholderMessage: (name: string) => string,
): boolean {
    let valid = true;
    for (const segment of pathService.getPathSegments(path)) {
        const namedSegment = ast.isPathMember(segment) ? segment.segment : segment;
        if (!ast.isPathNamedSegment(namedSegment)) {
            continue;
        }
        for (const templateName of identifierPatternService.getSegmentTemplateNames(namedSegment)) {
            if (!availableTemplateNames.has(templateName)) {
                valid = false;
                accept('error', missingPlaceholderMessage(templateName), {
                    node: namedSegment
                });
            }
        }
        const pattern = identifierPatternService.getSegmentPattern(namedSegment);
        const concreteText = identifierPatternService.substitute(pattern, bindings);
        if (identifierPatternService.hasTemplate(pattern) && concreteText !== undefined && !isValidExpandedL2Identifier(concreteText)) {
            valid = false;
            accept('error', `The expanded path segment '${concreteText}' is not valid for SMP Level 2.`, {
                node: namedSegment
            });
        }
    }
    return valid;
}
