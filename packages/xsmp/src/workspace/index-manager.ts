import { DefaultIndexManager } from 'langium';
import type { LangiumDocument } from 'langium';
import type { XsmpSharedServices } from '../xsmp-module.js';
import type { ProjectManager } from './project-manager.js';

/**
 * Customized IndexManager to correctly handle the rebuild of a document when one of its dependency changed
 */
export class XsmpIndexManager extends DefaultIndexManager {
    protected readonly projectManager: () => ProjectManager;
    constructor(services: XsmpSharedServices) {
        super(services);
        this.projectManager = () => services.workspace.ProjectManager;
    }

    /**
     * Overrides the isAffected method from the parent class. This method checks if a document needs to be rebuilt based on changes in its project's dependencies.
     * @param {LangiumDocument} document - The document that is being checked for affected status.
     * @param {Set<string>} changedUris - A set of URIs that have been modified.
     * @returns {boolean} - True if the document is affected by changes in its dependencies, false otherwise.
     */
    override isAffected(document: LangiumDocument, changedUris: Set<string>): boolean {
        const visibleUris = this.projectManager().getVisibleUris(document);
        if (!visibleUris)
            return super.isAffected(document, changedUris);

        return [...changedUris].some(item => visibleUris.has(item));
    }
}
