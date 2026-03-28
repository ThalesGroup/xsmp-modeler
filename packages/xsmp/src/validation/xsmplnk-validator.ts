import { AstUtils, type AstNode, type ValidationAcceptor, type ValidationChecks } from 'langium';
import * as ast from '../generated/ast-partial.js';
import type { XsmplnkServices } from '../xsmplnk-module.js';
import { checkName } from './name-validator-utils.js';
import type { XsmpInstancePathResolver } from '../references/xsmp-instance-path-resolver.js';
import type { IdentifierPatternService, TemplateBindings } from '../references/identifier-pattern-service.js';
import type { XsmpPathService } from '../references/xsmp-path-service.js';
import { checkTemplatedPathSegments, createTemplateBindings } from './template-parameter-validator-utils.js';
import * as XsmpUtils from '../utils/xsmp-utils.js';
import { checkNoParentTraversal } from './instance-validator-utils.js';

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
    protected readonly pathResolver: XsmpInstancePathResolver;
    protected readonly identifierPatternService: IdentifierPatternService;
    protected readonly pathService: XsmpPathService;
    protected readonly componentLinkBasePathCache: WeakMap<ast.ComponentLinkBase, string[] | undefined> = new WeakMap();

    constructor(services: XsmplnkServices) {
        this.pathResolver = services.shared.InstancePathResolver;
        this.identifierPatternService = services.shared.IdentifierPatternService;
        this.pathService = services.shared.PathService;
    }

    checkLinkBase(linkBase: ast.LinkBase, accept: ValidationAcceptor): void {
        checkName(accept, linkBase, linkBase.name, ast.LinkBase.name);
        if (linkBase.elements.length === 0) {
            accept('error', 'A Link Base shall contain at least one Component Link Base.', {
                node: linkBase,
                property: ast.LinkBase.elements
            });
        }
        if (!linkBase.assembly?.ref && this.hasTemplatedPaths(linkBase)) {
            accept('error', 'A Link Base using templated paths shall declare an Assembly anchor with \'for <Assembly>\'.', {
                node: linkBase,
                property: ast.LinkBase.assembly
            });
        }
        this.checkReferenceUpperBounds(linkBase, accept);
    }

    checkComponentLinkBase(linkBase: ast.ComponentLinkBase, accept: ValidationAcceptor): void {
        const path = linkBase.name;
        if (path && !path.unsafe) {
            if (this.checkPathTemplateParameters(path, accept)) {
                checkNoParentTraversal(accept, linkBase, path, ast.ComponentLinkBase.name);
                const resolution = this.pathResolver.getLinkBaseComponentPathResolution(path);
                this.acceptPathError(resolution.invalidMessage, resolution.invalidNode, accept);
                if (resolution.active && !resolution.invalidMessage && !resolution.finalComponent) {
                    accept('error', 'The Component Link Base path shall resolve to a typed Component.', {
                        node: linkBase,
                        property: ast.ComponentLinkBase.name
                    });
                }
            }
        }
        if (!linkBase.elements.some(ast.isLink)) {
            accept('error', 'A Component Link Base shall contain at least one Link.', {
                node: linkBase,
                property: ast.ComponentLinkBase.elements
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
        this.checkLinkPath(link, link.sourcePath, ast.InterfaceLink.sourcePath, accept);
        this.checkLinkPath(link, link.clientPath, ast.InterfaceLink.clientPath, accept);
        this.checkInterfaceSource(link, accept);
        if (link.backReference) {
            this.checkInterfaceReference(link, link.backReference, ast.InterfaceLink.backReference, 'Client', 'Owner', accept);
        }
    }

    private checkLinkPaths(link: ast.Link, accept: ValidationAcceptor): void {
        this.checkLinkPath(link.ownerPath, accept);
        this.checkLinkPath(link.clientPath, accept);
    }

    private checkLinkPath(path: ast.Path | undefined, accept: ValidationAcceptor): void;
    private checkLinkPath(link: ast.InterfaceLink, path: ast.Path | undefined, property: typeof ast.InterfaceLink.sourcePath | typeof ast.InterfaceLink.clientPath, accept: ValidationAcceptor): void;
    private checkLinkPath(
        linkOrPath: ast.InterfaceLink | ast.Path | undefined,
        pathOrAccept: ast.Path | ValidationAcceptor | undefined,
        propertyOrAccept?: typeof ast.InterfaceLink.sourcePath | typeof ast.InterfaceLink.clientPath | ValidationAcceptor,
        acceptMaybe?: ValidationAcceptor,
    ): void {
        const link = ast.isInterfaceLink(linkOrPath) ? linkOrPath : undefined;
        const path = ast.isInterfaceLink(linkOrPath) ? pathOrAccept as ast.Path | undefined : linkOrPath;
        const accept = (ast.isInterfaceLink(linkOrPath) ? acceptMaybe : pathOrAccept) as ValidationAcceptor;
        if (!path) {
            return;
        }
        if (path.unsafe) {
            return;
        }
        if (!this.checkPathTemplateParameters(path, accept)) {
            return;
        }
        if (link) {
            checkNoParentTraversal(accept, link, path, propertyOrAccept === ast.InterfaceLink.sourcePath ? ast.InterfaceLink.sourcePath : ast.InterfaceLink.clientPath);
        } else {
            checkNoParentTraversal(accept, path, path, ast.Path.elements);
        }
        const resolution = link && propertyOrAccept === ast.InterfaceLink.sourcePath
            ? this.pathResolver.getInterfaceLinkSourceResolution(link)
            : this.pathResolver.getLinkBaseEndpointPathResolution(path);
        this.acceptPathError(resolution.invalidMessage, resolution.invalidNode, accept);
    }

    private checkInterfaceReference(
        link: ast.InterfaceLink,
        reference: ast.LocalNamedReference,
        property: typeof ast.InterfaceLink.backReference,
        sourceSide: 'Owner' | 'Client',
        targetSide: 'Owner' | 'Client',
        accept: ValidationAcceptor,
    ): void {
        if (reference.unsafe) {
            return;
        }
        const target = this.pathResolver.getLocalNamedReferenceTarget(reference);
        if (!ast.isReference(target)) {
            accept('error', `The selected reference shall resolve to a Reference of the ${sourceSide} Component.`, {
                node: link,
                property
            });
            return;
        }
        const expectedType = ast.isReferenceType(target.interface?.ref) ? target.interface.ref : undefined;
        const oppositeContext = this.pathResolver.getInterfaceLinkEndpointContext(link, 'owner');
        if (expectedType && oppositeContext.component && !this.isCompatibleReferenceTarget(expectedType, oppositeContext.component)) {
            accept('error', `The selected reference shall be compatible with the ${targetSide} Component.`, {
                node: link,
                property
            });
        }
    }

    private checkInterfaceSource(link: ast.InterfaceLink, accept: ValidationAcceptor): void {
        const sourcePath = link.sourcePath;
        if (!sourcePath || sourcePath.unsafe) {
            return;
        }
        const resolution = this.pathResolver.getInterfaceLinkSourceResolution(link);
        if (!resolution.active || resolution.invalidMessage || !ast.isReference(resolution.finalElement)) {
            return;
        }
        const expectedType = ast.isReferenceType(resolution.finalElement.interface?.ref) ? resolution.finalElement.interface.ref : undefined;
        const oppositeContext = this.pathResolver.getInterfaceLinkEndpointContext(link, 'client');
        if (expectedType && oppositeContext.component && !this.isCompatibleReferenceTarget(expectedType, oppositeContext.component)) {
            accept('error', 'The selected source reference shall be compatible with the Client Component.', {
                node: link,
                property: ast.InterfaceLink.sourcePath
            });
        }
    }

    private checkReferenceUpperBounds(linkBase: ast.LinkBase, accept: ValidationAcceptor): void {
        const usages = new Map<string, LinkBaseReferenceUsageBucket>();
        for (const link of AstUtils.streamAst(linkBase).filter(ast.isInterfaceLink)) {
            this.collectSourceReferenceUsage(link, usages);
            this.collectReferenceUsage(link, ast.InterfaceLink.backReference, link.clientPath, link.backReference, usages);
        }
        for (const usage of usages.values()) {
            if (usage.upper < BigInt(0) || BigInt(usage.usages.length) <= usage.upper) {
                continue;
            }
            for (const item of usage.usages) {
                accept('error', `The Reference '${usage.referenceName}' of component path '${usage.componentPath}' shall not be connected more than ${usage.upper} time(s).`, {
                    node: item.link,
                    property: item.property
                });
            }
        }
    }

    private collectReferenceUsage(
        link: ast.InterfaceLink,
        property: typeof ast.InterfaceLink.backReference,
        path: ast.Path | undefined,
        reference: ast.LocalNamedReference | undefined,
        usages: Map<string, LinkBaseReferenceUsageBucket>,
    ): void {
        if (!path || !reference || path.unsafe || reference.unsafe) {
            return;
        }
        const pathResolution = this.pathResolver.getLinkBaseEndpointPathResolution(path);
        if (!pathResolution.active || pathResolution.invalidMessage || !pathResolution.finalComponent) {
            return;
        }
        const targetReference = this.pathResolver.getLocalNamedReferenceTarget(reference);
        if (!ast.isReference(targetReference)) {
            return;
        }
        const upper = XsmpUtils.getUpper(targetReference);
        if (upper === undefined || upper < BigInt(0)) {
            return;
        }
        const componentPath = this.getAbsoluteComponentPath(link, path);
        if (!componentPath) {
            return;
        }
        const key = `${componentPath}::${targetReference.name ?? '<unknown>'}`;
        const usage = usages.get(key) ?? {
            upper,
            referenceName: targetReference.name ?? '<unknown>',
            componentPath,
            usages: [],
        };
        usage.usages.push({ link, property });
        usages.set(key, usage);
    }

    private collectSourceReferenceUsage(
        link: ast.InterfaceLink,
        usages: Map<string, LinkBaseReferenceUsageBucket>,
    ): void {
        if (!link.sourcePath || link.sourcePath.unsafe) {
            return;
        }
        const source = this.pathService.splitInterfaceLinkSourcePath(link.sourcePath);
        if (!source?.referenceSegment) {
            return;
        }
        const ownerContext: {
            active: boolean;
            finalComponent?: ast.Component;
            finalBindings?: TemplateBindings;
            invalidMessage?: string;
        } = source.ownerPath
            ? this.pathResolver.getLinkBaseEndpointPathResolution(source.ownerPath)
            : {
                active: true,
                finalComponent: this.pathResolver.getInterfaceLinkEndpointContext(link, 'owner').component,
                finalBindings: this.pathResolver.getInterfaceLinkEndpointContext(link, 'owner').bindings,
            };
        if (!ownerContext.active || ownerContext.invalidMessage || !ownerContext.finalComponent) {
            return;
        }
        const targetReference = this.pathResolver.resolveReferenceSegmentTarget(source.referenceSegment, ownerContext.finalComponent, ownerContext.finalBindings);
        if (!targetReference) {
            return;
        }
        const upper = XsmpUtils.getUpper(targetReference);
        if (upper === undefined || upper < BigInt(0)) {
            return;
        }
        const componentPath = source.ownerPath
            ? this.getAbsoluteComponentPath(link, source.ownerPath)
            : this.getAbsoluteComponentPath(link);
        if (!componentPath) {
            return;
        }
        const key = `${componentPath}::${targetReference.name ?? '<unknown>'}`;
        const usage = usages.get(key) ?? {
            upper,
            referenceName: targetReference.name ?? '<unknown>',
            componentPath,
            usages: [],
        };
        usage.usages.push({ link, property: ast.InterfaceLink.sourcePath });
        usages.set(key, usage);
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
        return checkTemplatedPathSegments(
            path,
            available,
            this.getAssemblyTemplateBindings(assembly),
            this.identifierPatternService,
            this.pathService,
            accept,
            templateName => `The placeholder '{${templateName}}' shall resolve to a Template Argument of the anchored Assembly.`,
        );
    }

    private getAssemblyTemplateBindings(assembly: ast.Assembly): Map<string, string> {
        return createTemplateBindings(assembly.parameters);
    }

    private acceptPathError(message: string | undefined, node: AstNode | undefined, accept: ValidationAcceptor): void {
        if (message && node) {
            accept('error', message, { node });
        }
    }

    private isCompatibleReferenceTarget(expectedType: ast.ReferenceType, component: ast.Component): boolean {
        return XsmpUtils.isBaseOfReferenceType(expectedType, component);
    }

    private getAbsoluteComponentPath(link: ast.InterfaceLink, path?: ast.Path): string | undefined {
        const componentLinkBase = AstUtils.getContainerOfType(link, ast.isComponentLinkBase);
        if (!componentLinkBase) {
            return undefined;
        }
        const baseSegments = this.getAbsoluteComponentLinkBaseSegments(componentLinkBase);
        if (!baseSegments) {
            return undefined;
        }
        const targetSegments = path ? this.applyPathToSegments(baseSegments, path) : [...baseSegments];
        if (!targetSegments) {
            return undefined;
        }
        return targetSegments.length === 0 ? '/' : `/${targetSegments.join('/')}`;
    }

    private getAbsoluteComponentLinkBaseSegments(linkBase: ast.ComponentLinkBase): string[] | undefined {
        const cached = this.componentLinkBasePathCache.get(linkBase);
        if (cached !== undefined) {
            return cached;
        }
        const parent = ast.isComponentLinkBase(linkBase.$container) ? linkBase.$container : undefined;
        const baseSegments = parent ? this.getAbsoluteComponentLinkBaseSegments(parent) : [];
        const segments = baseSegments ? this.applyPathToSegments(baseSegments, linkBase.name) : undefined;
        this.componentLinkBasePathCache.set(linkBase, segments);
        return segments;
    }

    private applyPathToSegments(baseSegments: string[], path: ast.Path | undefined): string[] | undefined {
        if (!path) {
            return undefined;
        }
        const segments = path.absolute ? [] : [...baseSegments];
        for (const segment of this.pathService.getPathSegments(path)) {
            if (ast.isPathIndex(segment)) {
                return undefined;
            }
            const actualSegment = ast.isPathMember(segment) ? segment.segment : segment;
            if (ast.isPathSelfSegment(actualSegment)) {
                continue;
            }
            if (ast.isPathParentSegment(actualSegment)) {
                if (segments.length === 0) {
                    return undefined;
                }
                segments.pop();
                continue;
            }
            if (!ast.isPathNamedSegment(actualSegment)) {
                return undefined;
            }
            const text = this.pathService.getSegmentText(actualSegment);
            if (!text) {
                return undefined;
            }
            segments.push(text);
        }
        return segments;
    }
}

interface LinkBaseReferenceUsageBucket {
    upper: bigint;
    referenceName: string;
    componentPath: string;
    usages: Array<{
        link: ast.InterfaceLink;
        property: typeof ast.InterfaceLink.sourcePath | typeof ast.InterfaceLink.backReference;
    }>;
}
