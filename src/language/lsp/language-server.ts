import { DefaultLanguageServer } from 'langium/lsp';
import { RequestType, RequestType0 } from 'vscode-languageserver';
import { SmpImportService, type SmpImportResult } from '../../contributions/tools/smp/import/index.js';
import type {
    XsmpContributionKind,
    XsmpContributionRegistrationReport,
    XsmpContributionScaffoldResult,
    XsmpContributionSummary,
    XsmpContributionWizardPrompt,
    XsmpProjectScaffoldRequest,
    XsmpProjectWizardPromptsRequest,
    XsmpResolvedContributionManifestEntry,
} from '../contributions/xsmp-extension-types.js';
import type { XsmpSharedServices } from '../xsmp-module.js';
import * as ast from '../generated/ast-partial.js';
import { AstUtils, Cancellation, URI } from 'langium';
export type { XsmpProjectGenerationFailure, XsmpProjectGenerationReport } from '../workspace/document-generator.js';
import type { XsmpProjectGenerationReport } from '../workspace/document-generator.js';

export const GetServerFileContentRequest = new RequestType<string, string | null, void>('xsmp/getServerFileContent');
export const RegisterContributions = new RequestType<XsmpResolvedContributionManifestEntry[], XsmpContributionRegistrationReport, void>('xsmp/registerContributions');
export const GetContributionSummaries = new RequestType<XsmpContributionKind | undefined, XsmpContributionSummary[], void>('xsmp/getContributionSummaries');
export const GetContributionWizardPrompts = new RequestType<XsmpProjectWizardPromptsRequest, XsmpContributionWizardPrompt[], void>('xsmp/getContributionWizardPrompts');
export const ScaffoldProject = new RequestType<XsmpProjectScaffoldRequest, XsmpContributionScaffoldResult, void>('xsmp/scaffoldProject');
export const GenerateProject = new RequestType<string | null, XsmpProjectGenerationReport, void>('xsmp/generateProject');
export const GenerateAllProjects = new RequestType0<XsmpProjectGenerationReport, void>('xsmp/generateAllProjects');
export const ImportSmpFile = new RequestType<{ uri: string; outputUri?: string | null; force?: boolean }, SmpImportResult, void>('xsmp/importSmpFile');

export class XsmpLanguageServer extends DefaultLanguageServer {

    protected override eagerLoadServices(): void {
        super.eagerLoadServices();
        this.services.lsp.Connection?.onRequest(GetServerFileContentRequest, async (uri) => {
            return this.services.workspace.LangiumDocuments.all.find(d => d.uri.toString() === uri)?.textDocument.getText();
        });

        this.services.lsp.Connection?.onRequest(RegisterContributions, async (entries) => {
            return await (this.services as XsmpSharedServices).ContributionRegistry.registerDiscoveredContributions(entries);
        });

        this.services.lsp.Connection?.onRequest(GetContributionSummaries, async (kind) => {
            const registry = (this.services as XsmpSharedServices).ContributionRegistry;
            await registry.ready;
            return registry.getContributionSummaries(kind);
        });

        this.services.lsp.Connection?.onRequest(GetContributionWizardPrompts, async (request) => {
            const registry = (this.services as XsmpSharedServices).ContributionRegistry;
            await registry.ready;
            return await registry.getWizardPrompts(request);
        });

        this.services.lsp.Connection?.onRequest(ScaffoldProject, async (request) => {
            const registry = (this.services as XsmpSharedServices).ContributionRegistry;
            await registry.ready;
            return await registry.scaffoldProject(request);
        });

        this.services.lsp.Connection?.onRequest(GenerateProject, async (uri) => {
            const sharedServices = this.services as XsmpSharedServices;
            const project = await this.resolveProjectFromUri(sharedServices, uri);
            if (!project) {
                return {
                    generatedProjects: [],
                    skippedProjects: [{ projectName: uri ?? 'current selection', errorCount: 1 }],
                };
            }
            return await sharedServices.DocumentGenerator.generateValidatedProject(project, Cancellation.CancellationToken.None);
        });

        this.services.lsp.Connection?.onRequest(GenerateAllProjects, async () => {
            const sharedServices = this.services as XsmpSharedServices;
            await sharedServices.workspace.WorkspaceManager.ready;
            const projects = sharedServices.workspace.ProjectManager.getProjects().toArray()
                .sort((left, right) => (left.name ?? '').localeCompare(right.name ?? ''));
            return await sharedServices.DocumentGenerator.generateValidatedProjects(projects, Cancellation.CancellationToken.None);
        });

        this.services.lsp.Connection?.onRequest(ImportSmpFile, async (request) => {
            const sharedServices = this.services as XsmpSharedServices;
            const importer = new SmpImportService(sharedServices);
            return await importer.importFile({
                inputPath: URI.parse(request.uri).fsPath,
                outputPath: request.outputUri ? URI.parse(request.outputUri).fsPath : undefined,
                overwrite: request.force ?? false,
            });
        });
    }

    protected async resolveProjectFromUri(services: XsmpSharedServices, uri: string | null): Promise<ast.Project | undefined> {
        if (!uri) {
            return undefined;
        }

        const parsedUri = URI.parse(uri);
        if (!services.ServiceRegistry.hasServices(parsedUri)) {
            return undefined;
        }

        const document = await services.workspace.LangiumDocuments.getOrCreateDocument(parsedUri);
        if (ast.isProject(document.parseResult.value)) {
            return document.parseResult.value;
        }

        const project = services.workspace.ProjectManager.getProject(document);
        if (project) {
            return project;
        }

        const containingProject = services.workspace.ProjectManager.getProjects().find(candidate => {
            const projectUri = AstUtils.getDocument(candidate).uri;
            return projectUri.toString() === uri;
        });
        return containingProject;
    }
}
