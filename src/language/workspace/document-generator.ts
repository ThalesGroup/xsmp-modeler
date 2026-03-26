import { DocumentState, interruptAndCheck, UriUtils } from 'langium';
import type { Cancellation, LangiumDocument, LangiumDocuments, ServiceRegistry, URI } from 'langium';
import * as ast from '../generated/ast-partial.js';
import { DiagnosticSeverity } from 'vscode-languageserver';
import pLimit from 'p-limit';
import type { Task, TaskAcceptor } from '../generator/generator.js';
import type { XsmpSharedServices } from '../xsmp-module.js';
import type { ProjectManager } from './project-manager.js';
import type { XsmpContributionRegistry } from '../contributions/xsmp-contribution-registry.js';
import type { XsmpRegisteredContribution } from '../contributions/xsmp-extension-types.js';

const limit = pLimit(8);

export class XsmpDocumentGenerator {
    protected readonly langiumDocuments: LangiumDocuments;
    protected readonly serviceRegistry: ServiceRegistry;
    protected readonly projectManager: ProjectManager;
    protected readonly contributionRegistry: XsmpContributionRegistry;

    constructor(services: XsmpSharedServices) {
        this.langiumDocuments = services.workspace.LangiumDocuments;
        this.serviceRegistry = services.ServiceRegistry;
        this.projectManager = services.workspace.ProjectManager;
        this.contributionRegistry = services.ContributionRegistry;
    }

    private isValid(document: LangiumDocument): boolean {
        return document.state === DocumentState.Validated && document.parseResult.parserErrors.length === 0 && !document.diagnostics?.some(d => d.severity === DiagnosticSeverity.Error);
    }

    async generate(uri: URI, cancelToken: Cancellation.CancellationToken): Promise<void> {
        const document = this.langiumDocuments.getDocument(uri);
        if (!document) {
            return;
        }

        if (ast.isProject(document.parseResult.value)) {
            return await this.generateProject(document.parseResult.value, cancelToken);
        }

        const project = this.projectManager.getProject(document);
        if (project && this.isValid(document))
            return await this.generateProject(project, cancelToken);

    }

    async generateProject(project: ast.Project, cancelToken: Cancellation.CancellationToken): Promise<void> {
        const projectUri = UriUtils.dirname(project.$document?.uri as URI);
        const contributions = this.getActiveContributions(project);

        // clean up previous generated files
        for (const contribution of contributions) {
            contribution.generators.forEach(generator => generator.clean(projectUri));
        }

        // generate files

        const documents = this.langiumDocuments.all.filter(doc => this.isValid(doc) && project === this.projectManager.getProject(doc)).toArray();
        const tasks: Array<Promise<void>> = [];

        const taskAcceptor: TaskAcceptor = (task: Task) => { tasks.push(limit(task)); };

        for (const contribution of contributions) {
            for (const generator of contribution.generators) {
                documents.forEach(doc => generator.generate(doc.parseResult.value, projectUri, taskAcceptor));
            }
        }

        await interruptAndCheck(cancelToken);

        if (tasks.length > 0) {
            await Promise.all(tasks);
        }
    }

    protected getActiveContributions(project: ast.Project): XsmpRegisteredContribution[] {
        const contributions: XsmpRegisteredContribution[] = [];
        const seen = new Set<string>();

        for (const element of project.elements) {
            if (ast.isProfileReference(element)) {
                const rawName = element.profile?.$refText ?? element.profile?.ref?.name;
                const contribution = this.contributionRegistry.resolveContribution('profile', rawName)?.contribution;
                if (contribution && !seen.has(contribution.id)) {
                    seen.add(contribution.id);
                    contributions.push(contribution);
                }
            } else if (ast.isToolReference(element)) {
                const rawName = element.tool?.$refText ?? element.tool?.ref?.name;
                const contribution = this.contributionRegistry.resolveContribution('tool', rawName)?.contribution;
                if (contribution && !seen.has(contribution.id)) {
                    seen.add(contribution.id);
                    contributions.push(contribution);
                }
            }
        }

        return contributions;
    }
}
