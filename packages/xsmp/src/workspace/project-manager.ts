import { AstUtils, DocumentState, UriUtils, WorkspaceCache } from 'langium';
import type { LangiumDocument, LangiumDocuments, LangiumSharedCoreServices, Stream, URI } from 'langium';
import * as ast from '../generated/ast-partial.js';
import { isBuiltinLibrary } from '../builtins.js';
import { isSource } from '../generated/ast-partial.js';
import { isSameOrContainedPath } from '../utils/path-utils.js';
import type { XsmpContributionRegistry } from '../contributions/xsmp-contribution-registry.js';
import type { XsmpSharedServices } from '../xsmp-module.js';

export const SmpStandards: string[] = ['ECSS_SMP_2020', 'ECSS_SMP_2025'];

export class ProjectManager {
    protected readonly projectCache: WorkspaceCache<URI, ast.Project | undefined>;
    protected readonly dependenciesCache: WorkspaceCache<URI, Set<ast.Project>>;
    protected readonly visibleUrisCache: WorkspaceCache<URI, Set<string>>;
    protected readonly documents: LangiumDocuments;
    protected readonly services: LangiumSharedCoreServices;
    protected readonly contributionRegistry: XsmpContributionRegistry;

    constructor(services: XsmpSharedServices) {

        this.documents = services.workspace.LangiumDocuments;
        this.services = services;
        this.contributionRegistry = services.ContributionRegistry;
        this.projectCache = new WorkspaceCache<URI, ast.Project | undefined>(services);
        this.dependenciesCache = new WorkspaceCache<URI, Set<ast.Project>>(services);
        this.visibleUrisCache = new WorkspaceCache<URI, Set<string>>(services);
    }

    getProjects(): Stream<ast.Project> {
        return this.documents.all.map(doc => doc.parseResult.value).filter(ast.isProject);
    }
    getProjectByName(name: string): ast.Project | undefined {
        return this.getProjects().find(p => p.name === name);
    }

    getProject(document: LangiumDocument): ast.Project | undefined {
        return this.projectCache.get(document.uri, () => this.doGetProject(document));
    }

    protected doGetProject(document: LangiumDocument): ast.Project | undefined {
        for (const doc of this.documents.all) {
            const project = this.getProjectForDocument(doc, document);
            if (project) {
                return project;
            }
        }
        return undefined;
    }

    protected getProjectForDocument(doc: LangiumDocument, document: LangiumDocument): ast.Project | undefined {
        const project = doc.parseResult.value;
        if (!ast.isProject(project)) {
            return undefined;
        }
        const projectUri = UriUtils.dirname(doc.uri);
        if (!isSameOrContainedPath(projectUri.path, document.uri.path)) {
            return undefined;
        }
        return this.projectContainsDocument(project, projectUri, document.uri) ? project : undefined;
    }

    protected projectContainsDocument(project: ast.Project, projectUri: URI, documentUri: URI): boolean {
        for (const source of project.elements.filter(isSource)) {
            if (source.path && isSameOrContainedPath(UriUtils.joinPath(projectUri, source.path).path, documentUri.path)) {
                return true;
            }
        }
        return false;
    }
    getDependencies(project: ast.Project): Set<ast.Project> {
        return this.dependenciesCache.get(
            AstUtils.getDocument(project).uri,
            () => {
                const dependencies = new Set<ast.Project>([project]);
                this.collectDependencies(project, dependencies);
                return dependencies;
            }
        );
    }

    protected collectDependencies(project: ast.Project, dependencies: Set<ast.Project>): void {
        project.elements.filter(ast.isDependency).forEach(dependency => {
            const depProject =
                project.$document && project.$document.state >= DocumentState.Linked
                    ? dependency.project?.ref
                    : this.getProjectByName(dependency.project?.$refText??'');

            if (depProject && !dependencies.has(depProject)) {
                dependencies.add(depProject);
                this.collectDependencies(depProject, dependencies);
            }
        });
    }

    getVisibleUris(document: LangiumDocument): Set<string> | undefined {

        const project = this.getProject(document);
        if (!project) {
            return this.visibleUrisCache.get(document.uri, () => {
                if (isBuiltinLibrary(document.uri)) {
                    return this.computeBuiltinVisibleUris(document);
                }
                return this.computeStandaloneVisibleUris(document);
            });
        }

        return this.visibleUrisCache.get(document.uri, () => this.computeVisibleUris(project));
    }

    protected computeBuiltinVisibleUris(document: LangiumDocument): Set<string> {
        const uris = this.collectCoreBuiltinUris(this.getBuiltinStandard(document.uri));
        uris.add(document.uri.toString());
        return uris;
    }

    protected computeStandaloneVisibleUris(document: LangiumDocument): Set<string> {
        const standard = this.getBuiltinStandard(document.uri) ?? 'ECSS_SMP_2020';
        const uris = this.collectCoreBuiltinUris(standard);
        uris.add(document.uri.toString());
        return uris;
    }

    protected computeVisibleUris(project: ast.Project): Set<string> {
        const uris = new Set<string>();
        uris.add(AstUtils.getDocument(project).uri.toString());

        const standard = project.standard;
        const dependencies = this.getDependencies(project);
        dependencies.forEach(dep => uris.add(AstUtils.getDocument(dep).uri.toString()));
        // Contribution payload documents are only visible inside the project that activates the
        // corresponding profile/tool. They are not inherited through project dependencies.
        const activeContributionIds = this.getActiveContributionIds(new Set([project]));
        this.contributionRegistry.getPayloadBuiltinUrisForContributions(activeContributionIds).forEach(uri => uris.add(uri));

        const folders = this.getSourceFolders(dependencies);
        this.documents.all.forEach(doc => {
            if (this.isUriInFolders(doc.uri, folders) ||
                (isBuiltinLibrary(doc.uri)
                    && !this.contributionRegistry.isContributionDocument(doc.uri)
                    && (!doc.uri.path.includes('@') || doc.uri.path.includes('@' + standard)))) {
                uris.add(doc.uri.toString());
            }
        });

        return uris;
    }

    protected getActiveContributionIds(projects: Set<ast.Project>): Set<string> {
        const ids = new Set<string>();
        for (const project of projects) {
            for (const element of project.elements) {
                if (ast.isToolReference(element)) {
                    const rawName = element.tool?.$refText ?? element.tool?.ref?.name;
                    const resolved = this.contributionRegistry.resolveContribution('tool', rawName);
                    if (resolved) {
                        ids.add(resolved.contribution.id);
                    }
                } else if (ast.isProfileReference(element)) {
                    const rawName = element.profile?.$refText ?? element.profile?.ref?.name;
                    const resolved = this.contributionRegistry.resolveContribution('profile', rawName);
                    if (resolved) {
                        ids.add(resolved.contribution.id);
                    }
                }
            }
        }
        return ids;
    }
    protected getSourceFolders(projects: Set<ast.Project>): Set<string> {
        const uris = new Set<string>();
        for (const project of projects) {
            if (project.$document) {
                const projectUri = UriUtils.dirname(project.$document.uri);
                for (const source of project.elements.filter(isSource)) {
                    if (source.path)
                        uris.add(UriUtils.joinPath(projectUri, source.path).path);
                }
            }
        }
        return uris;
    }

    protected isUriInFolders(uri: URI, folders: Set<string>): boolean {
        for (const folder of folders) {
            if (isSameOrContainedPath(folder, uri.path)) {
                return true;
            }
        }
        return false;
    }

    protected getBuiltinStandard(uri: URI): string | undefined {
        for (const standard of SmpStandards) {
            if (uri.path.includes(`@${standard}`)) {
                return standard;
            }
        }
        return undefined;
    }

    protected collectCoreBuiltinUris(standard: string | undefined): Set<string> {
        const uris = new Set<string>();
        this.documents.all.forEach(candidate => {
            if (!isBuiltinLibrary(candidate.uri) || this.contributionRegistry.isContributionDocument(candidate.uri)) {
                return;
            }
            const candidateStandard = this.getBuiltinStandard(candidate.uri);
            if (!standard) {
                if (!candidateStandard) {
                    uris.add(candidate.uri.toString());
                }
                return;
            }
            if (!candidateStandard || candidateStandard === standard) {
                uris.add(candidate.uri.toString());
            }
        });
        return uris;
    }
}
