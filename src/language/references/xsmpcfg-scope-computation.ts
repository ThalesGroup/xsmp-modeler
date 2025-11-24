import type { AstNode, AstNodeDescription, AstNodeDescriptionProvider, LangiumDocument, PrecomputedScopes, ScopeComputation } from 'langium';
import * as ast from '../generated/ast.js';
import { Cancellation, MultiMap } from 'langium';
import { XsmpServices } from '../xsmp-module.js';

export class XsmpcfgScopeComputation implements ScopeComputation {

    protected readonly descriptions: AstNodeDescriptionProvider;

    constructor(services: XsmpServices) {
        this.descriptions = services.workspace.AstNodeDescriptionProvider;
    }

    async computeExports(document: LangiumDocument, cancelToken = Cancellation.CancellationToken.None): Promise<AstNodeDescription[]> {
        const configuration = document.parseResult.value as ast.Configuration;
        const exportedDescriptions: AstNodeDescription[] = [];

        //Export the Configuration
        if (configuration.name) {
            exportedDescriptions.push(this.descriptions.createDescription(configuration, configuration.name, document));
        }
        return exportedDescriptions;
    }

    async computeLocalScopes(document: LangiumDocument, cancelToken = Cancellation.CancellationToken.None): Promise<PrecomputedScopes> {
        const scopes = new MultiMap<AstNode, AstNodeDescription>();

        return scopes;
    }

}