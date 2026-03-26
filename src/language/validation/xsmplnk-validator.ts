import { type ValidationAcceptor, type ValidationChecks } from 'langium';
import * as ast from '../generated/ast-partial.js';
import type { XsmplnkServices } from '../xsmplnk-module.js';
import { checkNoParentTraversal } from './l2-validator-utils.js';
import { checkName } from './name-validator-utils.js';

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
    constructor(_services: XsmplnkServices) { }

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
        checkNoParentTraversal(accept, linkBase, linkBase.name, 'name');
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
        checkNoParentTraversal(accept, link, link.ownerPath, 'ownerPath');
        checkNoParentTraversal(accept, link, link.clientPath, 'clientPath');
    }
}
