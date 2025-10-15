import type { AstNode, AstNodeDescription, AstNodeDescriptionProvider, LangiumDocument, PrecomputedScopes, ScopeComputation } from 'langium';
import * as ast from '../generated/ast.js';
import { Cancellation, MultiMap } from 'langium';
import { XsmpServices } from '../xsmp-module.js';
import path from "path";

export class XsmpasbScopeComputation implements ScopeComputation {

    protected readonly descriptions: AstNodeDescriptionProvider;

    constructor(services: XsmpServices) {
        this.descriptions = services.workspace.AstNodeDescriptionProvider;
    }

    async computeExports(document: LangiumDocument, cancelToken = Cancellation.CancellationToken.None): Promise<AstNodeDescription[]> {
        const assembly = document.parseResult.value as ast.Assembly,
            exportedDescriptions: AstNodeDescription[] = [];

        exportedDescriptions.push(this.descriptions.createDescription(assembly, path.basename(document.uri.fsPath), document));

        return exportedDescriptions;
    }

    async computeLocalScopes(document: LangiumDocument, cancelToken = Cancellation.CancellationToken.None): Promise<PrecomputedScopes> {
        const scopes = new MultiMap<AstNode, AstNodeDescription>();
        const assembly = document.parseResult.value as ast.Assembly;

        for(const parameter of assembly.parameters) {
            if(parameter.name) {
                scopes.add(assembly, this.descriptions.createDescription(parameter, parameter.name, document));
            }
        }
        return scopes;
    }

}