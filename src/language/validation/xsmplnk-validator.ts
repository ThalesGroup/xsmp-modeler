import { type AstNode, type ValidationAcceptor, type ValidationChecks } from 'langium';
import * as ast from '../generated/ast.js';
import type { XsmplnkServices } from '../xsmplnk-module.js';
import { checkName } from './name-validator-utils.js';
import type { Xsmpl2PathResolver } from '../references/xsmpl2-path-resolver.js';

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

    constructor(services: XsmplnkServices) {
        this.pathResolver = services.shared.L2PathResolver;
    }

    checkLinkBase(linkBase: ast.LinkBase, accept: ValidationAcceptor): void {
        checkName(accept, linkBase, linkBase.name, 'name');
        if (linkBase.elements.length === 0) {
            accept('error', 'A Link Base shall contain at least one Component Link Base.', {
                node: linkBase,
                property: 'elements'
            });
        }
    }

    checkComponentLinkBase(linkBase: ast.ComponentLinkBase, accept: ValidationAcceptor): void {
        if (!linkBase.name.unsafe) {
            const resolution = this.pathResolver.getLinkBaseComponentPathResolution(linkBase.name);
            this.acceptPathError(resolution.invalidMessage, resolution.invalidNode, accept);
            if (resolution.active && !resolution.invalidMessage && !resolution.finalComponent && !this.pathResolver.getEffectiveComponentLinkBaseComponent(linkBase)) {
                accept('error', 'The Component Link Base path shall resolve to a typed Component.', {
                    node: linkBase,
                    property: 'name'
                });
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
        const resolution = this.pathResolver.getLinkBaseEndpointPathResolution(path);
        this.acceptPathError(resolution.invalidMessage, resolution.invalidNode, accept);
    }

    private acceptPathError(message: string | undefined, node: AstNode | undefined, accept: ValidationAcceptor): void {
        if (message && node) {
            accept('error', message, { node });
        }
    }
}
