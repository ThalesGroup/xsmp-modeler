import type { AstNode, AstNodeDescription, AstNodeDescriptionProvider, LangiumDocument, PrecomputedScopes, ScopeComputation } from 'langium';
import type * as ast from '../generated/ast-partial.js';
import { Cancellation, MultiMap } from 'langium';
import type { XsmpServices } from '../xsmp-module.js';

export class XsmplnkScopeComputation implements ScopeComputation {

    protected readonly descriptions: AstNodeDescriptionProvider;

    constructor(services: XsmpServices) {
        this.descriptions = services.workspace.AstNodeDescriptionProvider;
    }

    async computeExports(document: LangiumDocument, _cancelToken = Cancellation.CancellationToken.None): Promise<AstNodeDescription[]> {
        const linkBase = document.parseResult.value as ast.LinkBase;
        const exportedDescriptions: AstNodeDescription[] = [];

        //Export the Link
        if (linkBase.name) {
            exportedDescriptions.push(this.descriptions.createDescription(linkBase, linkBase.name, document));
        }

        return exportedDescriptions;
    }

    async computeLocalScopes(document: LangiumDocument, _cancelToken = Cancellation.CancellationToken.None): Promise<PrecomputedScopes> {
        const scopes = new MultiMap<AstNode, AstNodeDescription>();

        return scopes;
    }

}
