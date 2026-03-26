import { DefaultLanguageServer } from 'langium/lsp';
import { RequestType } from 'vscode-languageserver';
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

export const GetServerFileContentRequest = new RequestType<string, string | null, void>('xsmp/getServerFileContent');
export const RegisterContributions = new RequestType<XsmpResolvedContributionManifestEntry[], XsmpContributionRegistrationReport, void>('xsmp/registerContributions');
export const GetContributionSummaries = new RequestType<XsmpContributionKind | undefined, XsmpContributionSummary[], void>('xsmp/getContributionSummaries');
export const GetContributionWizardPrompts = new RequestType<XsmpProjectWizardPromptsRequest, XsmpContributionWizardPrompt[], void>('xsmp/getContributionWizardPrompts');
export const ScaffoldProject = new RequestType<XsmpProjectScaffoldRequest, XsmpContributionScaffoldResult, void>('xsmp/scaffoldProject');

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
    }
}
