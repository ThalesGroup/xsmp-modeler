import { AstUtils, type AstNode, type ValidationAcceptor, type ValidationChecks } from 'langium';
import * as ast from '../generated/ast.js';
import type { XsmplnkServices } from '../xsmplnk-module.js';
import { checkName } from './name-validator-utils.js';
import type { Xsmpl2PathResolver } from '../references/xsmpl2-path-resolver.js';
import type { IdentifierPatternService } from '../references/identifier-pattern-service.js';
import type { XsmpPathService } from '../references/xsmp-path-service.js';
import { isValidExpandedL2Identifier } from './l2-validator-utils.js';

export function registerXsmplnkValidationChecks(services: XsmplnkServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.XsmplnkValidator;
    const checks: ValidationChecks<ast.XsmpAstType> = {
        LinkBase: validator.checkLinkBase,
        ComponentLinkBase: validator.checkComponentLinkBase,
        EventLink: validator.checkEventLink,
        FieldLink: validator.checkFieldLink,
        InterfaceLink: validator.checkInterfaceLink,
    };
    registry.register(checks, validator, 'fast');
}

export class XsmplnkValidator {
    protected readonly pathResolver: Xsmpl2PathResolver;
    protected readonly identifierPatternService: IdentifierPatternService;
    protected readonly pathService: XsmpPathService;

    constructor(services: XsmplnkServices) {
        this.pathResolver = services.shared.L2PathResolver;
        this.identifierPatternService = services.shared.IdentifierPatternService;
        this.pathService = services.shared.PathService;
    }

    checkLinkBase(linkBase: ast.LinkBase, accept: ValidationAcceptor): void {
        checkName(accept, linkBase, linkBase.name, 'name');
        if (linkBase.elements.length === 0) {
            accept('error', 'A Link Base shall contain at least one Component Link Base.', {
                node: linkBase,
                property: 'elements'
            });
        }
        if (!linkBase.assembly?.ref && this.hasTemplatedPaths(linkBase)) {
            accept('error', 'A Link Base using templated paths shall declare an Assembly anchor with \'for <Assembly>\'.', {
                node: linkBase,
                property: 'assembly'
            });
        }
    }

    checkComponentLinkBase(linkBase: ast.ComponentLinkBase, accept: ValidationAcceptor): void {
        if (!linkBase.name.unsafe) {
            if (this.checkPathTemplateParameters(linkBase.name, accept)) {
                const resolution = this.pathResolver.getLinkBaseComponentPathResolution(linkBase.name);
                this.acceptPathError(resolution.invalidMessage, resolution.invalidNode, accept);
                if (resolution.active && !resolution.invalidMessage && !resolution.finalComponent && !this.pathResolver.getEffectiveComponentLinkBaseComponent(linkBase)) {
                    accept('error', 'The Component Link Base path shall resolve to a typed Component.', {
                        node: linkBase,
                        property: 'name'
                    });
                }
            }
        }
        if (!linkBase.elements.some(ast.isLink)) {
            accept('error', 'A Component Link Base shall contain at least one Link.', {
                node: linkBase,
                property: 'elements'
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

    private checkLinkPaths(link: ast.Link, accept: ValidationAcceptor): void {
        this.checkLinkPath(link.ownerPath, accept);
        this.checkLinkPath(link.clientPath, accept);
    }

    private checkLinkPath(path: ast.Path, accept: ValidationAcceptor): void {
        if (path.unsafe) {
            return;
        }
        if (!this.checkPathTemplateParameters(path, accept)) {
            return;
        }
        const resolution = this.pathResolver.getLinkBaseEndpointPathResolution(path);
        this.acceptPathError(resolution.invalidMessage, resolution.invalidNode, accept);
    }

    private hasTemplatedPaths(linkBase: ast.LinkBase): boolean {
        return AstUtils.streamAst(linkBase)
            .filter(ast.isPath)
            .some(path => !path.unsafe && this.pathHasTemplate(path));
    }

    private pathHasTemplate(path: ast.Path): boolean {
        return this.pathService.getPathSegments(path).some(segment => {
            const namedSegment = ast.isPathMember(segment) ? segment.segment : segment;
            return ast.isPathNamedSegment(namedSegment) && this.identifierPatternService.hasTemplate(this.identifierPatternService.getSegmentPattern(namedSegment));
        });
    }

    private checkPathTemplateParameters(path: ast.Path, accept: ValidationAcceptor): boolean {
        const linkBase = AstUtils.getContainerOfType(path, ast.isLinkBase);
        const assembly = ast.isAssembly(linkBase?.assembly?.ref) ? linkBase.assembly.ref : undefined;
        if (!assembly) {
            return !this.pathHasTemplate(path);
        }
        const available = new Set(assembly.parameters.map(parameter => parameter.name));
        const bindings = this.getAssemblyTemplateBindings(assembly);
        let valid = true;
        for (const segment of this.pathService.getPathSegments(path)) {
            const namedSegment = ast.isPathMember(segment) ? segment.segment : segment;
            if (!ast.isPathNamedSegment(namedSegment)) {
                continue;
            }
            for (const templateName of this.identifierPatternService.getSegmentTemplateNames(namedSegment)) {
                if (!available.has(templateName)) {
                    valid = false;
                    accept('error', `The placeholder '{${templateName}}' shall resolve to a Template Argument of the anchored Assembly.`, {
                        node: namedSegment
                    });
                }
            }
            const pattern = this.identifierPatternService.getSegmentPattern(namedSegment);
            const concreteText = this.identifierPatternService.substitute(pattern, bindings);
            if (this.identifierPatternService.hasTemplate(pattern) && concreteText !== undefined && !isValidExpandedL2Identifier(concreteText)) {
                valid = false;
                accept('error', `The expanded path segment '${concreteText}' is not valid for SMP Level 2.`, {
                    node: namedSegment
                });
            }
        }
        return valid;
    }

    private getAssemblyTemplateBindings(assembly: ast.Assembly): Map<string, string> {
        const bindings = new Map<string, string>();
        for (const parameter of assembly.parameters) {
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

    private acceptPathError(message: string | undefined, node: AstNode | undefined, accept: ValidationAcceptor): void {
        if (message && node) {
            accept('error', message, { node });
        }
    }
}
