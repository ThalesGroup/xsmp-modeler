import { DefaultLanguageServer } from 'langium/lsp';
import { LSPErrorCodes, RequestType, RequestType0, ResponseError } from 'vscode-languageserver';
import { SmpImportService, type SmpImportResult } from '../smp/index.js';
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
import { AstUtils, type Cancellation, interruptAndCheck, isOperationCancelled, URI } from 'langium';
export type { XsmpProjectGenerationFailure, XsmpProjectGenerationReport } from '../workspace/document-generator.js';
import type { XsmpProjectGenerationReport } from '../workspace/document-generator.js';

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
        const sharedServices = this.services as XsmpSharedServices;
        this.registerWorkspaceFolderChangeHandler();
        this.services.lsp.Connection?.onRequest(RegisterContributions, async (entries) => {
            return await sharedServices.ContributionRegistry.registerExtensionManifestEntries(entries);
        });

        this.services.lsp.Connection?.onRequest(GetContributionSummaries, async (kind) => {
            return await sharedServices.workspace.WorkspaceLock.read(() =>
                sharedServices.ContributionRegistry.getContributionSummaries(kind)
            );
        });

        this.services.lsp.Connection?.onRequest(GetContributionWizardPrompts, async (request) => {
            return await sharedServices.workspace.WorkspaceLock.read(() =>
                sharedServices.ContributionRegistry.getWizardPrompts(request)
            );
        });

        this.services.lsp.Connection?.onRequest(ScaffoldProject, async (request) => {
            return await sharedServices.workspace.WorkspaceLock.read(() =>
                sharedServices.ContributionRegistry.scaffoldProject(request)
            );
        });

        this.services.lsp.Connection?.onRequest(GenerateProject, (uri, cancelToken) => this.runGeneration(cancelToken, async () => {
            const project = await sharedServices.workspace.WorkspaceLock.read(() =>
                this.resolveProjectFromUri(sharedServices, uri)
            );
            if (!project) {
                return {
                    generatedProjects: [],
                    skippedProjects: [{ projectName: uri ?? 'current selection', errorCount: 1 }],
                };
            }
            return await sharedServices.DocumentGenerator.generateValidatedProject(project, cancelToken);
        }));

        this.services.lsp.Connection?.onRequest(GenerateAllProjects, (cancelToken) => this.runGeneration(cancelToken, async () => {
            const projects = await sharedServices.workspace.WorkspaceLock.read(() =>
                sharedServices.workspace.ProjectManager.getProjects().toArray()
                    .sort((left, right) => (left.name ?? '').localeCompare(right.name ?? ''))
            );
            return await sharedServices.DocumentGenerator.generateValidatedProjects(projects, cancelToken);
        }));

        this.services.lsp.Connection?.onRequest(ImportSmpFile, async (request) => {
            const importer = new SmpImportService(sharedServices);
            return await importer.importFile({
                inputPath: URI.parse(request.uri).fsPath,
                outputPath: request.outputUri ? URI.parse(request.outputUri).fsPath : undefined,
                overwrite: request.force ?? false,
            });
        });
    }

    protected async runGeneration(cancelToken: Cancellation.CancellationToken, generate: () => Promise<XsmpProjectGenerationReport>): Promise<XsmpProjectGenerationReport> {
        try {
            await (this.services as XsmpSharedServices).workspace.WorkspaceManager.ready;
            await interruptAndCheck(cancelToken);
            const report = await generate();
            await interruptAndCheck(cancelToken);
            return report;
        } catch (error) {
            if (isOperationCancelled(error)) {
                throw new ResponseError(LSPErrorCodes.RequestCancelled, 'Generation cancelled.');
            }
            throw error;
        }
    }

    protected registerWorkspaceFolderChangeHandler(): void {
        const sharedServices = this.services as XsmpSharedServices;
        this.onInitialized(() => {
            // Accessing this event may dynamically register the capability with the client.
            // Wait for initialization so the client can handle that registration request.
            this.services.lsp.Connection?.workspace.onDidChangeWorkspaceFolders(event => {
                void sharedServices.workspace.WorkspaceManager.updateWorkspaceFolders(event).catch(error => {
                    console.error('Could not update XSMP workspace folders.', error);
                });
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

        const document = services.workspace.LangiumDocuments.getDocument(parsedUri);
        if (!document) {
            return undefined;
        }
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
