import { Cancellation, DefaultIndexManager, DocumentState, type LangiumDocument, type URI } from 'langium';
import type { XsmpSharedServices } from '../xsmp-module.js';
import * as ast from '../generated/ast-partial.js';
import { isBuiltinLibrary } from '../builtins.js';
import type { DocumentationHelper } from '../utils/documentation-helper.js';

/**
 * Customized IndexManager to correctly handle the rebuild of a document when one of its dependency changed
 */
export class XsmpIndexManager extends DefaultIndexManager {
    protected readonly documentation: () => DocumentationHelper;
    // Keep primitive summaries across removeContent: changed documents are deindexed before parsing.
    protected readonly previousExports = new Map<string, string>();
    protected affected?: { changed: Set<string>; uris: Set<string> };
    requiresFullRebuild = false;
    requiresBuiltinRebuild = false;

    constructor(services: XsmpSharedServices) {
        super(services);
        this.documentation = () => services.DocumentationHelper;
    }

    changesWorkspaceStructure(changed: readonly URI[], deleted: readonly URI[]): boolean {
        return deleted.length > 0 || changed.some(uri => {
            const document = this.documents.getDocument(uri);
            return !this.symbolIndex.has(uri.toString()) || document !== undefined && document.state <= DocumentState.Parsed
                && (isBuiltinLibrary(uri) || !ast.isCatalogue(document.parseResult.value));
        });
    }

    override async updateContent(document: LangiumDocument, token = Cancellation.CancellationToken.None): Promise<void> {
        await super.updateContent(document, token);
        this.requiresBuiltinRebuild ||= isBuiltinLibrary(document.uri);
        const uri = document.uri.toString();
        const previous = this.previousExports.get(uri);
        if (previous === undefined || previous !== this.exportSummary(uri)) {
            this.requiresFullRebuild = true;
        }
        this.previousExports.delete(uri);
    }

    protected exportSummary(uri: string): string {
        return JSON.stringify((this.symbolIndex.get(uri) ?? []).map(description => [
            description.name, description.type, description.path,
            ast.isType(description.node) ? this.documentation().getUuid(description.node)?.toString().trim() : undefined,
        ]));
    }

    override remove(uri: URI): void {
        super.remove(uri);
        this.symbolIndex.delete(uri.toString());
        this.previousExports.delete(uri.toString());
        this.requiresFullRebuild = true;
        this.requiresBuiltinRebuild ||= isBuiltinLibrary(uri);
    }

    override removeContent(uri: URI): void {
        const key = uri.toString();
        // Preserve export precedence while the old AST is absent. Deleting/reinserting a key
        // would reorder global scopes and could change shadowing after a comment-only edit.
        if (this.symbolIndex.has(key)) {
            if (!this.previousExports.has(key)) this.previousExports.set(key, this.exportSummary(key));
            this.symbolIndex.set(key, []);
        }
        this.symbolByTypeIndex.clear(key);
    }

    getReferencedDocumentUris(document: LangiumDocument, visibleUris?: ReadonlySet<string>): Set<string> {
        const referencedUris = new Set<string>();
        for (const reference of this.referenceIndex.get(document.uri.toString()) ?? []) {
            if (reference.local) {
                continue;
            }
            const targetUri = reference.targetUri.toString();
            if (!visibleUris || visibleUris.has(targetUri)) {
                referencedUris.add(targetUri);
            }
        }
        return referencedUris;
    }

    /** Include transitive semantic dependencies and diagnostics pointing into changed documents. */
    override isAffected(document: LangiumDocument, changedUris: Set<string>): boolean {
        if (this.affected?.changed !== changedUris) {
            const dependents = new Map<string, Set<string>>();
            const add = (target: string, source: string) => {
                let sources = dependents.get(target);
                if (!sources) dependents.set(target, sources = new Set());
                sources.add(source);
            };
            for (const [source, references] of this.referenceIndex) {
                for (const reference of references) {
                    if (!reference.local) add(reference.targetUri.toString(), source);
                }
            }
            for (const candidate of this.documents.all) {
                for (const diagnostic of candidate.diagnostics ?? []) {
                    for (const related of diagnostic.relatedInformation ?? []) {
                        add(related.location.uri, candidate.uri.toString());
                    }
                }
            }
            const uris = new Set(changedUris);
            for (const uri of uris) {
                for (const dependent of dependents.get(uri) ?? []) uris.add(dependent);
            }
            this.affected = { changed: changedUris, uris };
        }
        return this.affected.uris.has(document.uri.toString());
    }
}
