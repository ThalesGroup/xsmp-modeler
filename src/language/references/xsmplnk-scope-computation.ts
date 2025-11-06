import type { AstNode, AstNodeDescription, AstNodeDescriptionProvider, LangiumDocument, PrecomputedScopes, ScopeComputation } from 'langium';
import * as ast from '../generated/ast.js';
import { Cancellation, MultiMap } from 'langium';
import { XsmpServices } from '../xsmp-module.js';
import path from "path";

export class XsmplnkScopeComputation implements ScopeComputation {

    protected readonly descriptions: AstNodeDescriptionProvider;

    constructor(services: XsmpServices) {
        this.descriptions = services.workspace.AstNodeDescriptionProvider;
    }

    async computeExports(document: LangiumDocument, cancelToken = Cancellation.CancellationToken.None): Promise<AstNodeDescription[]> {
        const linkBase = document.parseResult.value as ast.LinkBase;
        const exportedDescriptions: AstNodeDescription[] = [];

        exportedDescriptions.push(this.descriptions.createDescription(linkBase, path.basename(document.uri.fsPath), document));

        return exportedDescriptions;
    }

    async computeLocalScopes(document: LangiumDocument, cancelToken = Cancellation.CancellationToken.None): Promise<PrecomputedScopes> {
        const scopes = new MultiMap<AstNode, AstNodeDescription>();

        return scopes;
    }

}