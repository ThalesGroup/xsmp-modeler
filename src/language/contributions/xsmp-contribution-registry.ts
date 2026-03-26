import { Cancellation, DocumentState, URI, UriUtils } from 'langium';
import type { AstNodeDescription, LangiumDocument, LangiumDocumentFactory, LangiumDocuments, ServiceRegistry } from 'langium';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import satisfies from 'semver/functions/satisfies.js';
import * as ast from '../generated/ast-partial.js';
import type { XsmpSharedServices } from '../xsmp-module.js';
import { builtInScheme } from '../builtins.js';
import { toXsmpIdentifier } from '../utils/path-utils.js';
import { xsmpExtensionApiVersion } from '../version.js';
import type {
    XsmpContributionHandlerModule,
    XsmpContributionKind,
    XsmpContributionLanguageId,
    XsmpContributionLanguageServicesMap,
    XsmpContributionRegistrationApi,
    XsmpContributionRegistrationReport,
    XsmpContributionResolution,
    XsmpContributionScaffoldContext,
    XsmpContributionScaffoldResult,
    XsmpContributionWizardPrompt,
    XsmpContributionWizardPromptDefinition,
    XsmpContributionSummary,
    XsmpProjectWizardPromptsRequest,
    XsmpProjectScaffoldRequest,
    XsmpExtensionContributionManifestEntry,
    XsmpRegisteredContribution,
    XsmpResolvedContributionManifestEntry,
} from './xsmp-extension-types.js';

export interface XsmpContributionBootstrapServices {
    readonly shared: XsmpSharedServices;
    readonly xsmpcat: XsmpContributionLanguageServicesMap['xsmpcat'];
    readonly xsmpproject: XsmpContributionLanguageServicesMap['xsmpproject'];
    readonly xsmpasb: XsmpContributionLanguageServicesMap['xsmpasb'];
    readonly xsmpcfg: XsmpContributionLanguageServicesMap['xsmpcfg'];
    readonly xsmplnk: XsmpContributionLanguageServicesMap['xsmplnk'];
    readonly xsmpsed: XsmpContributionLanguageServicesMap['xsmpsed'];
}

interface PendingContributionRegistration {
    readonly kind: XsmpContributionKind;
    readonly id: string;
    readonly extensionId: string;
    readonly generators: Array<XsmpRegisteredContribution['generators'][number]>;
    readonly validations: Array<{
        readonly languageId: XsmpContributionLanguageId;
        readonly register: (services: XsmpContributionLanguageServicesMap[XsmpContributionLanguageId], category: string) => void;
    }>;
    wizardMetadata?: XsmpRegisteredContribution['wizard'];
    wizardPrompts: XsmpContributionWizardPrompt[];
    scaffolder?: XsmpRegisteredContribution['scaffolder'];
}

class ContributionRegistrationError extends Error {
    readonly phase: 'descriptor' | 'handler' | 'builtins' | 'validation' | 'activation';
    readonly entry: XsmpResolvedContributionManifestEntry;
    readonly contributionId?: string;

    constructor(
        phase: ContributionRegistrationError['phase'],
        entry: XsmpResolvedContributionManifestEntry,
        error: unknown,
        contributionId?: string,
    ) {
        super(error instanceof Error ? error.message : String(error));
        this.name = 'ContributionRegistrationError';
        this.phase = phase;
        this.entry = entry;
        this.contributionId = contributionId;
        if (error instanceof Error && error.stack) {
            this.stack = error.stack;
        }
    }
}

function normalizeBuiltinPath(value: string): string {
    return value.replace(/\\/g, '/').replace(/^\/+/, '');
}

function contributionUri(extensionId: string, relativePath: string): URI {
    return URI.parse(`${builtInScheme}:///extensions/${encodeURIComponent(extensionId)}/${normalizeBuiltinPath(relativePath)}`);
}

function shouldUseSourceContributionFallback(): boolean {
    return Boolean(process.env.VITEST || process.env.VITEST_WORKER_ID);
}

export function resolveContributionPackagePath(extensionRoot: string, relativePath: string): string {
    const normalized = normalizeBuiltinPath(relativePath);
    const directPath = path.resolve(extensionRoot, normalized);
    const sourceCandidates: string[] = [];
    if (normalized.startsWith('out/lib/')) {
        sourceCandidates.push(path.resolve(extensionRoot, normalized.replace(/^out\/lib\//, 'src/lib/')));
    }
    if (normalized.startsWith('out/language/')) {
        sourceCandidates.push(path.resolve(extensionRoot, normalized.replace(/^out\/language\//, 'src/language/').replace(/\.cjs$/, '.ts')));
    }
    if (normalized.startsWith('out/')) {
        sourceCandidates.push(path.resolve(extensionRoot, normalized.replace(/^out\//, 'src/').replace(/\.cjs$/, '.ts')));
    }

    if (shouldUseSourceContributionFallback()) {
        const fallback = sourceCandidates.find(candidate => fs.existsSync(candidate));
        if (fallback) {
            return fallback;
        }
    }

    if (fs.existsSync(directPath)) {
        return directPath;
    }

    if (!shouldUseSourceContributionFallback()) {
        throw new Error(`Unable to resolve contribution path '${relativePath}' from '${extensionRoot}'.`);
    }

    const fallback = sourceCandidates.find(candidate => fs.existsSync(candidate));
    if (fallback) {
        return fallback;
    }

    throw new Error(`Unable to resolve contribution path '${relativePath}' from '${extensionRoot}'.`);
}

export class XsmpContributionRegistry {
    protected readonly documentFactory: LangiumDocumentFactory;
    protected readonly langiumDocuments: LangiumDocuments;
    protected readonly serviceRegistry: ServiceRegistry;
    protected readonly contributionOrder: XsmpRegisteredContribution[] = [];
    protected readonly toolContributions = new Map<string, XsmpRegisteredContribution>();
    protected readonly profileContributions = new Map<string, XsmpRegisteredContribution>();
    protected readonly descriptorDocuments = new Map<string, LangiumDocument>();
    protected readonly builtinDocuments = new Map<string, LangiumDocument>();
    protected readonly payloadBuiltinDocumentUris = new Map<string, string>();
    protected readonly readyState: Promise<void>;
    protected readonly resolveReady: () => void;
    protected readonly rejectReady: (reason?: unknown) => void;
    protected bootstrapServices?: XsmpContributionBootstrapServices;
    protected builtinsInitializationFailed = false;

    constructor(services: XsmpSharedServices) {
        this.documentFactory = services.workspace.LangiumDocumentFactory;
        this.langiumDocuments = services.workspace.LangiumDocuments;
        this.serviceRegistry = services.ServiceRegistry;

        let resolveReady!: () => void;
        let rejectReady!: (reason?: unknown) => void;
        this.readyState = new Promise<void>((resolve, reject) => {
            resolveReady = resolve;
            rejectReady = reject;
        });
        this.resolveReady = resolveReady;
        this.rejectReady = rejectReady;
        void this.readyState.catch(() => undefined);
    }

    get ready(): Promise<void> {
        return this.readyState;
    }

    setBootstrapServices(services: XsmpContributionBootstrapServices): void {
        this.bootstrapServices = services;
    }

    async initializeBuiltins(entries: readonly XsmpResolvedContributionManifestEntry[]): Promise<void> {
        try {
            const report = await this.registerEntries(entries, false);
            if (report.failures.length > 0) {
                this.builtinsInitializationFailed = true;
                const messages = report.failures.map(failure => `[${failure.phase}] ${failure.message}`);
                const error = new AggregateError([], `Built-in XSMP contribution initialization failed:\n${messages.join('\n')}`);
                this.rejectReady(error);
                throw error;
            }
        } finally {
            if (!this.builtinsInitializationFailed) {
                this.resolveReady();
            }
        }
    }

    async registerDiscoveredContributions(entries: readonly XsmpResolvedContributionManifestEntry[]) {
        await this.ready;
        return await this.registerEntries(entries, true);
    }

    getContributions(kind?: XsmpContributionKind): readonly XsmpRegisteredContribution[] {
        if (!kind) {
            return this.contributionOrder;
        }
        return this.contributionOrder.filter(contribution => contribution.kind === kind);
    }

    getCanonicalNames(kind: XsmpContributionKind): string[] {
        return this.getContributions(kind).map(contribution => contribution.id);
    }

    getPreferredContributionId(kind: XsmpContributionKind): string | undefined {
        const contributions = this.getContributions(kind);
        return contributions.find(contribution => contribution.wizard.defaultSelected)?.id
            ?? contributions[0]?.id;
    }

    getContributionSummaries(kind?: XsmpContributionKind): XsmpContributionSummary[] {
        return this.getContributions(kind).map(contribution => ({
            kind: contribution.kind,
            id: contribution.id,
            label: contribution.wizard.label,
            description: contribution.wizard.description,
            defaultSelected: contribution.wizard.defaultSelected,
            extensionId: contribution.extensionId,
            hasScaffolder: Boolean(contribution.scaffolder),
        }));
    }

    async getWizardPrompts(request: XsmpProjectWizardPromptsRequest): Promise<XsmpContributionWizardPrompt[]> {
        await this.ready;
        return this.getSelectedContributions(request.selectedProfileId, request.selectedToolIds)
            .flatMap(contribution => contribution.wizardPrompts);
    }

    async scaffoldProject(request: XsmpProjectScaffoldRequest): Promise<XsmpContributionScaffoldResult> {
        await this.ready;

        const dependencies = new Set<string>();
        const failures: Array<XsmpContributionScaffoldResult['failures'][number]> = [];
        const selectedContributions = this.getSelectedContributions(request.selectedProfileId, request.selectedToolIds);
        const promptValues = request.promptValues ?? {};

        for (const contribution of selectedContributions) {
            if (!contribution.scaffolder) {
                continue;
            }

            const context: XsmpContributionScaffoldContext = {
                projectName: request.projectName,
                projectDir: request.projectDir,
                projectIdentifier: toXsmpIdentifier(request.projectName),
                contributionId: contribution.id,
                kind: contribution.kind,
                selectedProfileId: request.selectedProfileId,
                selectedToolIds: request.selectedToolIds,
                promptValues,
                ensureDir: async targetPath => {
                    await fs.promises.mkdir(targetPath, { recursive: true });
                },
                writeFile: async (targetPath, content) => {
                    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
                    await fs.promises.writeFile(targetPath, content);
                },
                fileExists: targetPath => fs.existsSync(targetPath),
                addDependency: projectName => dependencies.add(projectName),
                getPromptValue: id => promptValues[this.toContributionPromptKey(contribution.id, id)] as string | boolean | undefined,
            };

            try {
                await contribution.scaffolder(context);
            } catch (error) {
                failures.push({
                    contributionId: contribution.id,
                    message: error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                });
            }
        }

        return {
            dependencies: [...dependencies],
            failures,
        };
    }

    resolveContribution(kind: XsmpContributionKind, name: string | undefined): XsmpContributionResolution | undefined {
        if (!name) {
            return undefined;
        }

        const map = kind === 'tool' ? this.toolContributions : this.profileContributions;
        const canonical = map.get(name);
        if (canonical) {
            return { contribution: canonical, kind: 'canonical', input: name };
        }

        for (const contribution of map.values()) {
            if (contribution.aliases.includes(name)) {
                return { contribution, kind: 'alias', input: name };
            }
            if (contribution.deprecatedAliases.includes(name)) {
                return { contribution, kind: 'deprecatedAlias', input: name };
            }
        }
        return undefined;
    }

    getContributionDescriptions(kind: XsmpContributionKind, includeAliases: boolean): AstNodeDescription[] {
        const contributions = this.getContributions(kind);
        const descriptions: AstNodeDescription[] = [];
        for (const contribution of contributions) {
            descriptions.push(this.createDescription(contribution, contribution.id));
            if (includeAliases) {
                for (const alias of contribution.aliases) {
                    descriptions.push(this.createDescription(contribution, alias));
                }
                for (const alias of contribution.deprecatedAliases) {
                    descriptions.push(this.createDescription(contribution, alias));
                }
            }
        }
        return descriptions;
    }

    getDescriptorDocuments(): readonly LangiumDocument[] {
        return [...this.descriptorDocuments.values()];
    }

    getPayloadBuiltinDocuments(): readonly LangiumDocument[] {
        return [...this.builtinDocuments.values()];
    }

    getPayloadBuiltinUrisForContributions(ids: Iterable<string>): Set<string> {
        const uris = new Set<string>();
        for (const id of ids) {
            const contribution = this.toolContributions.get(id) ?? this.profileContributions.get(id);
            if (contribution) {
                contribution.builtinDocumentUris.forEach(uri => uris.add(uri));
            }
        }
        return uris;
    }

    isPayloadBuiltinDocument(uri: URI): boolean {
        return this.payloadBuiltinDocumentUris.has(uri.toString());
    }

    isContributionDocument(uri: URI): boolean {
        const uriString = uri.toString();
        return this.descriptorDocuments.has(uriString) || this.builtinDocuments.has(uriString);
    }

    protected async registerEntries(entries: readonly XsmpResolvedContributionManifestEntry[], activateDocuments: boolean): Promise<XsmpContributionRegistrationReport> {
        const report: {
            registered: Array<XsmpContributionRegistrationReport['registered'][number]>;
            failures: Array<XsmpContributionRegistrationReport['failures'][number]>;
        } = {
            registered: [],
            failures: [],
        };
        const registeredDocuments: LangiumDocument[] = [];
        const activatedEntries: XsmpResolvedContributionManifestEntry[] = [];
        for (const entry of entries) {
            if (!satisfies(xsmpExtensionApiVersion, entry.apiVersion)) {
                continue;
            }
            try {
                const contribution = await this.registerEntry(entry);
                if (contribution) {
                    registeredDocuments.push(contribution.descriptorDocument, ...contribution.builtinDocuments);
                    activatedEntries.push(entry);
                    report.registered.push({
                        id: contribution.id,
                        kind: contribution.kind,
                        extensionId: contribution.extensionId,
                    });
                }
            } catch (error) {
                report.failures.push(this.toRegistrationFailure(entry, error));
            }
        }
        if (activateDocuments && registeredDocuments.length > 0) {
            try {
                await this.activateDocuments(registeredDocuments);
            } catch (error) {
                for (const entry of activatedEntries) {
                    report.failures.push(this.toRegistrationFailure(
                        entry,
                        error instanceof ContributionRegistrationError ? error : new ContributionRegistrationError('activation', entry, error),
                    ));
                }
            }
        }
        return report;
    }

    protected async registerEntry(entry: XsmpResolvedContributionManifestEntry): Promise<XsmpRegisteredContribution | undefined> {
        const descriptorDocument = await this.runRegistrationPhase('descriptor', entry, () => this.loadDescriptorDocument(entry));
        const descriptorRoot = descriptorDocument.parseResult.value;
        const kind = this.getContributionKind(descriptorRoot);
        const descriptorNode = this.getContributionNode(descriptorRoot);
        const id = descriptorNode.name;
        if (!id) {
            throw new Error(`Contribution descriptor '${entry.descriptorPath}' does not declare a valid identifier.`);
        }

        const contributionMap = kind === 'tool' ? this.toolContributions : this.profileContributions;
        const existing = contributionMap.get(id);
        if (existing) {
            if (existing.extensionId === entry.extensionId) {
                return existing;
            }
            throw new Error(`Contribution '${id}' is already registered by '${existing.extensionId}'.`);
        }

        this.assertUniqueContributionNames(kind, id, entry.aliases, entry.deprecatedAliases);

        const registration = this.createPendingRegistration(kind, id, entry.extensionId);
        await this.runRegistrationPhase('handler', entry, () => this.invokeHandler(entry.handlerPath, registration), id);
        const builtinDocuments = await this.runRegistrationPhase('builtins', entry, () => this.loadBuiltinDocuments(entry), id);
        const contribution: XsmpRegisteredContribution = {
            kind,
            id,
            aliases: [...entry.aliases],
            deprecatedAliases: [...entry.deprecatedAliases],
            validationCategory: id,
            generators: registration.generators,
            descriptorDocument,
            descriptorNode,
            builtinDocuments,
            descriptorUri: descriptorDocument.uri.toString(),
            builtinDocumentUris: builtinDocuments.map(document => document.uri.toString()),
            extensionId: entry.extensionId,
            manifest: entry,
            wizard: registration.wizardMetadata ?? {
                label: entry.wizard?.label ?? id,
                description: entry.wizard?.description,
                defaultSelected: entry.wizard?.defaultSelected ?? false,
            },
            wizardPrompts: registration.wizardPrompts,
            scaffolder: registration.scaffolder,
        };

        for (const validation of registration.validations) {
            await this.runRegistrationPhase('validation', entry, async () => {
                validation.register(this.getLanguageServices(validation.languageId), contribution.validationCategory);
            }, id);
        }

        contributionMap.set(id, contribution);
        this.contributionOrder.push(contribution);
        this.descriptorDocuments.set(contribution.descriptorUri, descriptorDocument);
        for (const document of builtinDocuments) {
            this.builtinDocuments.set(document.uri.toString(), document);
            this.payloadBuiltinDocumentUris.set(document.uri.toString(), id);
        }

        return contribution;
    }

    protected createPendingRegistration(
        kind: XsmpContributionKind,
        id: string,
        extensionId: string,
    ): PendingContributionRegistration {
        return {
            kind,
            id,
            extensionId,
            generators: [],
            validations: [],
            wizardMetadata: undefined,
            wizardPrompts: [],
            scaffolder: undefined,
        };
    }

    protected async invokeHandler(handlerPath: string, registration: PendingContributionRegistration): Promise<void> {
        if (!this.bootstrapServices) {
            throw new Error('XSMP contribution bootstrap services are not initialized.');
        }

        const module = await import(pathToFileURL(handlerPath).href) as XsmpContributionHandlerModule;
        const registerContribution = module.registerContribution ?? module.register;
        if (typeof registerContribution !== 'function') {
            throw new Error(`Contribution handler '${handlerPath}' does not export 'registerContribution'.`);
        }

        const api: XsmpContributionRegistrationApi = {
            id: registration.id,
            kind: registration.kind,
            extensionId: registration.extensionId,
            addGenerator: factory => {
                registration.generators.push(factory(this.bootstrapServices!.shared));
            },
            addValidation: (languageId, register) => {
                registration.validations.push({
                    languageId,
                    register: register as (services: XsmpContributionLanguageServicesMap[XsmpContributionLanguageId], category: string) => void,
                });
            },
            setWizardMetadata: metadata => {
                registration.wizardMetadata = {
                    label: metadata.label ?? registration.id,
                    description: metadata.description,
                    defaultSelected: metadata.defaultSelected ?? false,
                };
            },
            setWizardPrompts: prompts => {
                registration.wizardPrompts = this.normalizeWizardPrompts(registration.id, prompts);
            },
            setScaffolder: scaffolder => {
                registration.scaffolder = scaffolder;
            },
        };

        await registerContribution(api);
    }

    protected async loadDescriptorDocument(entry: XsmpResolvedContributionManifestEntry): Promise<LangiumDocument<ast.ProjectRoot>> {
        const content = await fs.promises.readFile(entry.descriptorPath, 'utf-8');
        const relativePath = path.relative(entry.extensionRoot, entry.descriptorPath);
        return this.documentFactory.fromString<ast.ProjectRoot>(content, contributionUri(entry.extensionId, relativePath));
    }

    protected async loadBuiltinDocuments(entry: XsmpResolvedContributionManifestEntry): Promise<LangiumDocument[]> {
        const documents: LangiumDocument[] = [];
        for (const builtinPath of entry.builtins) {
            await this.collectBuiltinDocuments(entry.extensionId, entry.extensionRoot, builtinPath, documents);
        }
        return documents;
    }

    protected async collectBuiltinDocuments(
        extensionId: string,
        extensionRoot: string,
        currentPath: string,
        collector: LangiumDocument[],
    ): Promise<void> {
        const stat = await fs.promises.stat(currentPath);
        if (stat.isDirectory()) {
            const entries = await fs.promises.readdir(currentPath);
            await Promise.all(entries.map(entry => this.collectBuiltinDocuments(extensionId, extensionRoot, path.join(currentPath, entry), collector)));
            return;
        }

        if (!stat.isFile() || !this.validFileExtensions.has(path.extname(currentPath))) {
            return;
        }

        const relativePath = path.relative(extensionRoot, currentPath);
        const content = await fs.promises.readFile(currentPath, 'utf-8');
        collector.push(this.documentFactory.fromString(content, contributionUri(extensionId, relativePath)));
    }

    protected getContributionKind(node: ast.ProjectRoot): XsmpContributionKind {
        if (ast.isProfile(node)) {
            return 'profile';
        }
        if (ast.isTool(node)) {
            return 'tool';
        }
        throw new Error(`Unsupported contribution descriptor root '${node.$type}'.`);
    }

    protected getContributionNode(node: ast.ProjectRoot): ast.Profile | ast.Tool {
        if (ast.isProfile(node)) {
            return node;
        }
        if (ast.isTool(node)) {
            return node;
        }
        throw new Error(`Unsupported contribution descriptor root '${node.$type}'.`);
    }

    protected assertUniqueContributionNames(
        kind: XsmpContributionKind,
        canonicalId: string,
        aliases: readonly string[],
        deprecatedAliases: readonly string[],
    ): void {
        const map = kind === 'tool' ? this.toolContributions : this.profileContributions;
        const allNames = new Set<string>([canonicalId, ...aliases, ...deprecatedAliases]);
        for (const name of allNames) {
            const resolution = this.resolveContribution(kind, name);
            if (resolution) {
                throw new Error(`Contribution name '${name}' for '${canonicalId}' conflicts with '${resolution.contribution.id}'.`);
            }
            if (map.has(name)) {
                throw new Error(`Contribution '${canonicalId}' conflicts with canonical id '${name}'.`);
            }
        }
    }

    protected createDescription(contribution: XsmpRegisteredContribution, name: string): AstNodeDescription {
        return {
            node: contribution.descriptorNode,
            name,
            type: contribution.descriptorNode.$type,
            documentUri: URI.parse(contribution.descriptorUri),
            path: '',
            nameSegment: contribution.descriptorNode.$cstNode ? {
                range: contribution.descriptorNode.$cstNode.range,
                offset: contribution.descriptorNode.$cstNode.offset,
                length: contribution.descriptorNode.$cstNode.length,
                end: contribution.descriptorNode.$cstNode.end,
            } : undefined,
            selectionSegment: contribution.descriptorNode.$cstNode ? {
                range: contribution.descriptorNode.$cstNode.range,
                offset: contribution.descriptorNode.$cstNode.offset,
                length: contribution.descriptorNode.$cstNode.length,
                end: contribution.descriptorNode.$cstNode.end,
            } : undefined,
        };
    }

    protected toRegistrationFailure(entry: XsmpResolvedContributionManifestEntry, error: unknown) {
        const registrationError = error instanceof ContributionRegistrationError
            ? error
            : new ContributionRegistrationError('handler', entry, error);
        return {
            extensionId: entry.extensionId,
            descriptorPath: entry.descriptorPath,
            handlerPath: entry.handlerPath,
            contributionId: registrationError.contributionId,
            phase: registrationError.phase,
            message: registrationError.message,
            stack: registrationError.stack,
        };
    }

    protected async runRegistrationPhase<T>(
        phase: ContributionRegistrationError['phase'],
        entry: XsmpResolvedContributionManifestEntry,
        action: () => Promise<T> | T,
        contributionId?: string,
    ): Promise<T> {
        try {
            return await action();
        } catch (error) {
            throw new ContributionRegistrationError(phase, entry, error, contributionId);
        }
    }

    protected getLanguageServices<L extends XsmpContributionLanguageId>(languageId: L): XsmpContributionLanguageServicesMap[L] {
        if (!this.bootstrapServices) {
            throw new Error('XSMP contribution bootstrap services are not initialized.');
        }
        return this.bootstrapServices[languageId];
    }

    protected get validFileExtensions(): ReadonlySet<string> {
        return new Set(this.serviceRegistry.all.flatMap(service => service.LanguageMetaData.fileExtensions));
    }

    protected getSelectedContributions(
        selectedProfileId: string | undefined,
        selectedToolIds: readonly string[],
    ): XsmpRegisteredContribution[] {
        return [
            ...(selectedProfileId ? [this.resolveContribution('profile', selectedProfileId)?.contribution] : []),
            ...selectedToolIds.map(id => this.resolveContribution('tool', id)?.contribution),
        ].filter((contribution): contribution is XsmpRegisteredContribution => Boolean(contribution));
    }

    protected normalizeWizardPrompts(
        contributionId: string,
        prompts: readonly XsmpContributionWizardPromptDefinition[],
    ): XsmpContributionWizardPrompt[] {
        return prompts.map(prompt => ({
            ...prompt,
            contributionId,
            key: this.toContributionPromptKey(contributionId, prompt.id),
        }));
    }

    protected toContributionPromptKey(contributionId: string, promptId: string): string {
        return `${contributionId}.${promptId}`;
    }

    protected async activateDocuments(documents: readonly LangiumDocument[]): Promise<void> {
        const newDocuments = documents.filter(document => !this.langiumDocuments.hasDocument(document.uri));
        if (newDocuments.length === 0 || !this.bootstrapServices) {
            return;
        }

        for (const document of newDocuments) {
            this.langiumDocuments.addDocument(document);
        }

        const existingDocuments = this.langiumDocuments.all
            .filter(document => !newDocuments.some(newDocument => newDocument.uri.toString() === document.uri.toString()))
            .filter(document => !UriUtils.basename(document.uri).startsWith('__INVALID__'))
            .toArray();

        for (const document of existingDocuments) {
            this.bootstrapServices.shared.workspace.DocumentBuilder.resetToState(document, DocumentState.ComputedScopes);
        }

        await this.bootstrapServices.shared.workspace.DocumentBuilder.build(
            [...newDocuments, ...existingDocuments],
            this.bootstrapServices.shared.workspace.DocumentBuilder.updateBuildOptions,
            Cancellation.CancellationToken.None,
        );
    }
}

export function resolveContributionManifestEntries(
    extensionId: string,
    extensionRoot: string,
    entries: readonly XsmpExtensionContributionManifestEntry[] | undefined,
): XsmpResolvedContributionManifestEntry[] {
    if (!entries) {
        return [];
    }

    return entries.map(entry => ({
        extensionId,
        extensionRoot,
        descriptorPath: resolveContributionPackagePath(extensionRoot, entry.descriptor),
        handlerPath: resolveContributionPackagePath(extensionRoot, entry.handler),
        apiVersion: entry.apiVersion,
        aliases: [...(entry.aliases ?? [])],
        deprecatedAliases: [...(entry.deprecatedAliases ?? [])],
        builtins: [...(entry.builtins ?? [])].map(builtin => resolveContributionPackagePath(extensionRoot, builtin)),
        wizard: entry.wizard,
    }));
}
