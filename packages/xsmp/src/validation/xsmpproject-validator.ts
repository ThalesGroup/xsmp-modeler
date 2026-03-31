import { type AstNode, type IndexManager, MultiMap, type Properties, type Reference, type ValidationAcceptor, type ValidationChecks, UriUtils, WorkspaceCache, type AstNodeDescription, AstUtils } from 'langium';
import type { XsmpprojectServices } from '../xsmpproject-module.js';
import * as fs from 'node:fs';
import * as ast from '../generated/ast-partial.js';
import { DiagnosticTag, Location } from 'vscode-languageserver';
import { isSameOrContainedPath, normalizePath } from '../utils/path-utils.js';
import { SmpStandards, type ProjectManager } from '../workspace/project-manager.js';
import type { XsmpContributionKind, XsmpContributionResolution } from '../contributions/xsmp-extension-types.js';
import type { XsmpContributionRegistry } from '../contributions/xsmp-contribution-registry.js';

/**
 * Register custom validation checks.
 */
export function registerXsmpprojectValidationChecks(services: XsmpprojectServices) {
    const registry = services.validation.ValidationRegistry,
        validator = services.validation.XsmpprojectValidator,
        checks: ValidationChecks<ast.XsmpAstType> = {
            Project: validator.checkProject,
            Profile: validator.checkProfile,
            Tool: validator.checkTool
        };
    registry.register(checks, validator);
}

/**
 * Implementation of custom validations.
 */
export class XsmpprojectValidator {
    protected readonly indexManager: IndexManager;
    protected readonly globalCache: WorkspaceCache<string, MultiMap<string, AstNodeDescription>>;
    protected readonly projectManager: ProjectManager;
    protected readonly contributionRegistry: XsmpContributionRegistry;

    constructor(services: XsmpprojectServices) {
        this.indexManager = services.shared.workspace.IndexManager;
        this.globalCache = new WorkspaceCache<string, MultiMap<string, AstNodeDescription>>(services.shared);
        this.projectManager = services.shared.workspace.ProjectManager;
        this.contributionRegistry = services.shared.ContributionRegistry;
    }

    private computeNamesForProjects(): MultiMap<string, AstNodeDescription> {
        const map = new MultiMap<string, AstNodeDescription>();
        for (const type of this.indexManager.allElements(ast.Project.$type)) {
            map.add(type.name, type);
        }
        return map;
    }

    checkTypeReference<N extends AstNode>(accept: ValidationAcceptor, node: N, reference: Reference, _property: Properties<N>, _index?: number): boolean {
        if (!reference.ref) {
            return false;
        }
        return true;
    }

    protected resolveContributionReference(
        kind: XsmpContributionKind,
        reference: Reference | undefined,
    ): XsmpContributionResolution | undefined {
        return this.contributionRegistry.resolveContribution(kind, reference?.$refText);
    }

    checkProfile(profile: ast.Profile, accept: ValidationAcceptor): void {
        if (UriUtils.extname(AstUtils.getDocument(profile).uri) !== '.xsmpprofile') {
            accept('error', 'A profile file shall have \'.xsmpprofile\' file extension.', {
                node: profile,
                keyword: 'profile',
            });
        }
    }
    checkTool(tool: ast.Tool, accept: ValidationAcceptor): void {
        if (UriUtils.extname(AstUtils.getDocument(tool).uri) !== '.xsmptool') {
            accept('error', 'A tool file shall have \'.xsmptool\' file extension.', {
                node: tool,
                keyword: 'tool',
            });
        }
    }
    checkProject(project: ast.Project, accept: ValidationAcceptor): void {
        if (UriUtils.basename(AstUtils.getDocument(project).uri) !== 'xsmp.project') {
            accept('error', 'A project file name shall be \'xsmp.project\'.', {
                node: project,
                keyword: 'project',
            });
        }
        if (project.standard && !SmpStandards.includes(project.standard)) {
            accept('error', `Unknown version. Only the following versions are supported: ${SmpStandards.join(', ')}.`, {
                node: project,
                property: ast.Project.standard
            });
        }
        if (project.name) {
            const duplicates = this.globalCache.get('projects', () => this.computeNamesForProjects()).get(project.name);
            if (duplicates.length > 1) {
                accept('error', 'Duplicated project name', {
                    node: project,
                    property: ast.Project.name,
                    relatedInformation: duplicates
                        .filter(description => description.node !== project && description.nameSegment)
                        .map(description => ({
                            location: Location.create(description.documentUri.toString(), description.nameSegment!.range),
                            message: description.name
                        }))
                });
            }
        }
        // Check only one profile (or zero)
        let profile: string | undefined;

        const projectUri = UriUtils.dirname(AstUtils.getDocument(project).uri);
        const tools = new Set<string>();
        const dependencies = new Set<ast.Project>();

        project.elements.forEach((element) => {
            switch (element.$type) {
                case ast.ProfileReference.$type: {
                    if (element.profile && this.checkTypeReference(accept, element, element.profile, ast.ProfileReference.profile)) {
                        const resolved = this.resolveContributionReference('profile', element.profile);
                        if (resolved?.kind === 'deprecatedAlias') {
                            accept('warning', `Deprecated: Use the "${resolved.contribution.id}" profile instead.`, {
                                node: element,
                                property: ast.ProfileReference.profile,
                                tags: [DiagnosticTag.Deprecated],
                            });
                        }
                        const canonicalName = resolved?.contribution.id ?? element.profile.ref?.name;
                        if (profile && canonicalName) {
                            accept('error', 'A profile is already defined.', { node: element, property: ast.ProfileReference.profile });
                        }
                        else if (canonicalName) {
                            profile = canonicalName;
                        }
                    }
                    break;
                }
                case ast.ToolReference.$type: {
                    if (element.tool && this.checkTypeReference(accept, element, element.tool, ast.ToolReference.tool)) {
                        const resolved = this.resolveContributionReference('tool', element.tool);
                        if (resolved?.kind === 'deprecatedAlias') {
                            accept('warning', `Deprecated: Use the "${resolved.contribution.id}" tool instead.`, {
                                node: element,
                                property: ast.ToolReference.tool,
                                tags: [DiagnosticTag.Deprecated],
                            });
                        }
                        const canonicalName = resolved?.contribution.id ?? element.tool.ref?.name;

                        // Check no duplicated tool
                        if (canonicalName) {
                            if (tools.has(canonicalName))
                                accept('error', `Duplicated tool '${canonicalName}'.`, { node: element, property: ast.ToolReference.tool });
                            else
                                tools.add(canonicalName);
                        }
                    }
                    break;
                }
                case ast.Dependency.$type: {
                    if (element.project && this.checkTypeReference(accept, element, element.project, ast.Dependency.project)) {
                        if (this.projectManager.getDependencies(element.project.ref!).has(project))
                            accept('error', `Cyclic dependency detected '${element.project.ref?.name}'.`, { node: element, property: ast.Dependency.project });

                        // Check no duplicated dependency
                        if (dependencies.has(element.project.ref!))
                            accept('error', `Duplicated dependency '${element.project.ref?.name}'.`, { node: element, property: ast.Dependency.project });
                        else
                            dependencies.add(element.project.ref!);

                        if (project.standard !== element.project.ref?.standard) {
                            accept('error', `SMP version does not match '${project.standard}'.`, { node: element, property: ast.Dependency.project });
                        }
                    }
                    break;
                }
                case ast.Source.$type: {
                    if (element.path) {
                        const sourcePath = UriUtils.joinPath(projectUri, normalizePath(element.path));
                        
                        if (!isSameOrContainedPath(projectUri.path, sourcePath.path)) {
                            accept('error', `Source path '${element.path}' is not contained within the project directory.`, { node: element, property: ast.Source.path });
                        }
                        else if (!fs.existsSync(sourcePath.fsPath)) {
                            accept('error', `Source path '${element.path}' does not exist.`, { node: element, property: ast.Source.path });
                        }
                    }
                    break;
                }
            }
        });
    }
}
