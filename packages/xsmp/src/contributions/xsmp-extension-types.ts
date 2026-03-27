import type { LangiumDocument } from 'langium';
import type * as ast from '../generated/ast-partial.js';
import type { XsmpGenerator } from '../generator/generator.js';
import type { XsmpSharedServices } from '../xsmp-module.js';
import type { XsmpasbServices } from '../xsmpasb-module.js';
import type { XsmpcatServices } from '../xsmpcat-module.js';
import type { XsmpcfgServices } from '../xsmpcfg-module.js';
import type { XsmplnkServices } from '../xsmplnk-module.js';
import type { XsmpprojectServices } from '../xsmpproject-module.js';
import type { XsmpsedServices } from '../xsmpsed-module.js';

export type XsmpContributionKind = 'profile' | 'tool';

export type XsmpContributionLanguageId =
    | 'xsmpcat'
    | 'xsmpproject'
    | 'xsmpasb'
    | 'xsmpcfg'
    | 'xsmplnk'
    | 'xsmpsed';

export interface XsmpContributionLanguageServicesMap {
    readonly xsmpcat: XsmpcatServices;
    readonly xsmpproject: XsmpprojectServices;
    readonly xsmpasb: XsmpasbServices;
    readonly xsmpcfg: XsmpcfgServices;
    readonly xsmplnk: XsmplnkServices;
    readonly xsmpsed: XsmpsedServices;
}

export type XsmpContributionGeneratorFactory = (services: XsmpSharedServices) => XsmpGenerator;

export type XsmpContributionValidationRegistrar<L extends XsmpContributionLanguageId = XsmpContributionLanguageId> =
    (services: XsmpContributionLanguageServicesMap[L], category: string) => void;

export interface XsmpContributionWizardMetadata {
    readonly label?: string;
    readonly description?: string;
    readonly defaultSelected?: boolean;
}

export type XsmpContributionWizardPromptType = 'string' | 'boolean' | 'choice';

export interface XsmpContributionWizardPromptChoice {
    readonly value: string;
    readonly label?: string;
    readonly description?: string;
}

export interface XsmpContributionWizardPromptDefinition {
    readonly id: string;
    readonly label: string;
    readonly type: XsmpContributionWizardPromptType;
    readonly description?: string;
    readonly placeholder?: string;
    readonly defaultValue?: string | boolean;
    readonly choices?: readonly XsmpContributionWizardPromptChoice[];
}

export interface XsmpNormalizedContributionWizardMetadata {
    readonly label: string;
    readonly description?: string;
    readonly defaultSelected: boolean;
}

export interface XsmpContributionWizardPrompt extends XsmpContributionWizardPromptDefinition {
    readonly contributionId: string;
    readonly key: string;
}

export interface XsmpExtensionContributionManifestEntry {
    readonly descriptor: string;
    readonly handler: string;
    readonly apiVersion: string;
    readonly aliases?: readonly string[];
    readonly deprecatedAliases?: readonly string[];
    readonly builtins?: readonly string[];
    readonly wizard?: XsmpContributionWizardMetadata;
}

export interface XsmpResolvedContributionManifestEntry {
    readonly extensionId: string;
    readonly extensionRoot: string;
    readonly descriptorPath: string;
    readonly handlerPath: string;
    readonly apiVersion: string;
    readonly aliases: readonly string[];
    readonly deprecatedAliases: readonly string[];
    readonly builtins: readonly string[];
    readonly wizard?: XsmpContributionWizardMetadata;
}

export interface XsmpBuiltinContributionRegistration {
    readonly extensionId: string;
    readonly descriptorUrl: URL;
    readonly aliases?: readonly string[];
    readonly deprecatedAliases?: readonly string[];
    readonly builtins?: readonly URL[];
    readonly registerContribution: (api: XsmpContributionRegistrationApi) => void | Promise<void>;
}

export interface XsmpContributionPackage extends XsmpBuiltinContributionRegistration {
    readonly name: string;
}

export interface XsmpContributionRegistrationFailure {
    readonly extensionId: string;
    readonly descriptorPath: string;
    readonly handlerPath: string;
    readonly contributionId?: string;
    readonly phase: 'descriptor' | 'handler' | 'builtins' | 'validation' | 'activation';
    readonly message: string;
    readonly stack?: string;
}

export interface XsmpContributionRegistrationReport {
    readonly registered: ReadonlyArray<{
        id: string;
        kind: XsmpContributionKind;
        extensionId: string;
    }>;
    readonly failures: readonly XsmpContributionRegistrationFailure[];
}

export interface XsmpContributionScaffoldContext {
    readonly projectName: string;
    readonly projectDir: string;
    readonly projectIdentifier: string;
    readonly contributionId: string;
    readonly kind: XsmpContributionKind;
    readonly selectedProfileId?: string;
    readonly selectedToolIds: readonly string[];
    readonly promptValues: Readonly<Record<string, string | boolean>>;
    ensureDir(path: string): Promise<void>;
    writeFile(path: string, content: string): Promise<void>;
    fileExists(path: string): boolean;
    addDependency(projectName: string): void;
    getPromptValue(id: string): string | boolean | undefined;
}

export interface XsmpContributionScaffoldResult {
    readonly dependencies: readonly string[];
    readonly failures: ReadonlyArray<{
        readonly contributionId: string;
        readonly message: string;
        readonly stack?: string;
    }>;
}

export interface XsmpContributionSummary {
    readonly kind: XsmpContributionKind;
    readonly id: string;
    readonly label: string;
    readonly description?: string;
    readonly defaultSelected: boolean;
    readonly extensionId: string;
    readonly hasScaffolder: boolean;
}

export interface XsmpProjectScaffoldRequest {
    readonly projectName: string;
    readonly projectDir: string;
    readonly selectedProfileId?: string;
    readonly selectedToolIds: readonly string[];
    readonly promptValues?: Readonly<Record<string, string | boolean>>;
}

export interface XsmpProjectWizardPromptsRequest {
    readonly selectedProfileId?: string;
    readonly selectedToolIds: readonly string[];
}

export type XsmpContributionScaffolder = (context: XsmpContributionScaffoldContext) => void | Promise<void>;

export interface XsmpContributionRegistrationApi {
    readonly id: string;
    readonly kind: XsmpContributionKind;
    readonly extensionId: string;
    addGenerator(factory: XsmpContributionGeneratorFactory): void;
    addValidation<L extends XsmpContributionLanguageId>(
        languageId: L,
        register: XsmpContributionValidationRegistrar<L>,
    ): void;
    setWizardMetadata(metadata: XsmpContributionWizardMetadata): void;
    setWizardPrompts(prompts: readonly XsmpContributionWizardPromptDefinition[]): void;
    setScaffolder(scaffolder: XsmpContributionScaffolder): void;
}

export interface XsmpContributionHandlerModule {
    registerContribution?(api: XsmpContributionRegistrationApi): void | Promise<void>;
    register?(api: XsmpContributionRegistrationApi): void | Promise<void>;
}

export type XsmpContributionResolutionKind = 'canonical' | 'alias' | 'deprecatedAlias';

export interface XsmpContributionResolution {
    readonly contribution: XsmpRegisteredContribution;
    readonly kind: XsmpContributionResolutionKind;
    readonly input: string;
}

export interface XsmpRegisteredContribution {
    readonly kind: XsmpContributionKind;
    readonly id: string;
    readonly aliases: readonly string[];
    readonly deprecatedAliases: readonly string[];
    readonly validationCategory: string;
    readonly generators: readonly XsmpGenerator[];
    readonly descriptorDocument: LangiumDocument<ast.ProjectRoot>;
    readonly descriptorNode: ast.Profile | ast.Tool;
    readonly builtinDocuments: readonly LangiumDocument[];
    readonly descriptorUri: string;
    readonly builtinDocumentUris: readonly string[];
    readonly extensionId: string;
    readonly manifest: XsmpResolvedContributionManifestEntry;
    readonly wizard: XsmpNormalizedContributionWizardMetadata;
    readonly wizardPrompts: readonly XsmpContributionWizardPrompt[];
    readonly scaffolder?: XsmpContributionScaffolder;
}
