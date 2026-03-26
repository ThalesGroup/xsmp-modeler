import { type AstNode, type IndexManager, MultiMap, type Properties, type Reference, type ValidationAcceptor, type ValidationChecks, UriUtils, WorkspaceCache, type AstNodeDescription, AstUtils } from 'langium';
import type { XsmpprojectServices } from '../xsmpproject-module.js';
import * as fs from 'node:fs';
import * as ast from '../generated/ast-partial.js';
import { DiagnosticTag, Location } from 'vscode-languageserver';
import { type DocumentationHelper } from '../utils/documentation-helper.js';
import { isSameOrContainedPath } from '../utils/path-utils.js';
import { SmpStandards, type ProjectManager } from '../workspace/project-manager.js';

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
    protected readonly docHelper: DocumentationHelper;
    protected readonly projectManager: ProjectManager;

    constructor(services: XsmpprojectServices) {
        this.indexManager = services.shared.workspace.IndexManager;
        this.globalCache = new WorkspaceCache<string, MultiMap<string, AstNodeDescription>>(services.shared);
        this.docHelper = services.shared.DocumentationHelper;
        this.projectManager = services.shared.workspace.ProjectManager;
    }

    private computeNamesForProjects(): MultiMap<string, AstNodeDescription> {
        const map = new MultiMap<string, AstNodeDescription>();
        for (const type of this.indexManager.allElements(ast.Project.$type)) {
            map.add(type.name, type);
        }
        return map;
    }

    checkTypeReference<N extends AstNode>(accept: ValidationAcceptor, node: N, reference: Reference, property: Properties<N>, index?: number): boolean {
        if (!reference.ref) {
            return false;
        }
        const deprecated = this.docHelper.getDeprecated(reference.ref);
        if (deprecated) {
            accept('warning', deprecated.toString().length > 0 ? `Deprecated: ${deprecated.toString()}` : 'Deprecated.', { node, property, index, tags: [DiagnosticTag.Deprecated] });
        }
        return true;
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
        if(project.name)
        {const duplicates = this.globalCache.get('projects', () => this.computeNamesForProjects()).get(project.name);
        if (duplicates.length > 1) {
            accept('error', 'Duplicated project name', {
                node: project,
                property: ast.Project.name,
                relatedInformation: duplicates.filter(d => d.node !== project).map(d => ({ location: Location.create(d.documentUri.toString(), d.nameSegment!.range), message: d.name }))
            });
        }
    }
        // Check only one profile (or zero)
        let profile: ast.Profile | undefined;

        const projectUri = UriUtils.dirname(AstUtils.getDocument(project).uri);
        const tools = new Set<ast.Tool>();
        const dependencies = new Set<ast.Project>();

        project.elements.forEach((element) => {
            switch (element.$type) {
                case ast.ProfileReference.$type: {
                    if (element.profile && this.checkTypeReference(accept, element, element.profile, ast.ProfileReference.profile)) {
                        if (profile) {
                            accept('error', 'A profile is already defined.', { node: element, property: ast.ProfileReference.profile });
                        }
                        else {
                            profile = element.profile.ref;
                        }
                    }
                    break;
                }
                case ast.ToolReference.$type: {
                    if (element.tool && this.checkTypeReference(accept, element, element.tool, ast.ToolReference.tool)) {

                        // Check no duplicated tool
                        if (tools.has(element.tool.ref!))
                            accept('error', `Duplicated tool '${element.tool.ref?.name}'.`, { node: element, property: ast.ToolReference.tool });
                        else
                            tools.add(element.tool.ref!);
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
                        const { path } = UriUtils.joinPath(projectUri, element.path);
                        if (!isSameOrContainedPath(projectUri.path, path)) {
                            accept('error', `Source path '${element.path}' is not contained within the project directory.`, { node: element, property: ast.Source.path });
                        }
                        else if (!fs.existsSync(path)) {
                            accept('error', `Source path '${element.path}' does not exist.`, { node: element, property: ast.Source.path });
                        }
                    }
                    break;
                }
            }
        });
    }
}
