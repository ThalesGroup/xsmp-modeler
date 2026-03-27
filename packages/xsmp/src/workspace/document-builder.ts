import type { Cancellation, LangiumDocument, ValidationOptions } from 'langium';
import { DefaultDocumentBuilder, ValidationCategory } from 'langium';
import type { XsmpSharedServices } from '../xsmp-module.js';
import type { ProjectManager } from './project-manager.js';
import * as ast from '../generated/ast-partial.js';
import type { XsmpContributionRegistry } from '../contributions/xsmp-contribution-registry.js';

export class XsmpDocumentBuilder extends DefaultDocumentBuilder {

    protected readonly projectManager: () => ProjectManager;
    protected readonly contributionRegistry: () => XsmpContributionRegistry;
    constructor(services: XsmpSharedServices) {
        super(services);
        this.projectManager = () => services.workspace.ProjectManager;
        this.contributionRegistry = () => services.ContributionRegistry;
    }

    protected override async validate(document: LangiumDocument, cancelToken: Cancellation.CancellationToken): Promise<void> {
        const validator = this.serviceRegistry.getServices(document.uri).validation.DocumentValidator;
        const options = this.getValidationOptions(document);
        const diagnostics = await validator.validateDocument(document, options, cancelToken);
        if (document.diagnostics) {
            document.diagnostics.push(...diagnostics);
        } else {
            document.diagnostics = diagnostics;
        }

        // Store information about the executed validation in the build state
        const state = this.buildState.get(document.uri.toString());
        if (state) {
            state.result ??= {};
            const newCategories = options.categories ?? ValidationCategory.all;
            if (state.result.validationChecks) {
                state.result.validationChecks.push(...newCategories);
            } else {
                state.result.validationChecks = [...newCategories];
            }
        }
    }
    protected getValidationOptions(document: LangiumDocument): ValidationOptions {
        const project = this.projectManager().getProject(document);
        const categories = ['fast', 'built-in'];
        if (project) {
            for (const profile of project.elements.filter(ast.isProfileReference)) {
                const rawName = profile.profile?.$refText ?? profile.profile?.ref?.name;
                const contribution = this.contributionRegistry().resolveContribution('profile', rawName)?.contribution;
                if (contribution) {
                    categories.push(contribution.validationCategory);
                }
            }
            for (const tool of project.elements.filter(ast.isToolReference)) {
                const rawName = tool.tool?.$refText ?? tool.tool?.ref?.name;
                const contribution = this.contributionRegistry().resolveContribution('tool', rawName)?.contribution;
                if (contribution) {
                    categories.push(contribution.validationCategory);
                }
            }
        }
        return { categories };
    }
}
