import type { AstNode, AstNodeDescription, AstNodeDescriptionProvider, LangiumDocument, LocalSymbols, ScopeComputation } from 'langium';
import type * as ast from '../generated/ast-partial.js';
import { Cancellation, MultiMap } from 'langium';
import type { XsmpServices } from '../xsmp-module.js';

export class XsmpasbScopeComputation implements ScopeComputation {

    protected readonly descriptions: AstNodeDescriptionProvider;

    constructor(services: XsmpServices) {
        this.descriptions = services.workspace.AstNodeDescriptionProvider;
    }

    async collectExportedSymbols(document: LangiumDocument, _cancelToken = Cancellation.CancellationToken.None): Promise<AstNodeDescription[]> {
        const assembly = document.parseResult.value as ast.Assembly,
            exportedDescriptions: AstNodeDescription[] = [];

        //Export the Assembly
        if (assembly.name) {
            exportedDescriptions.push(this.descriptions.createDescription(assembly, assembly.name, document));
        }

        return exportedDescriptions;
    }

    async collectLocalSymbols(document: LangiumDocument, _cancelToken = Cancellation.CancellationToken.None): Promise<LocalSymbols> {
        const scopes = new MultiMap<AstNode, AstNodeDescription>();
        const assembly = document.parseResult.value as ast.Assembly;

        for (const parameter of assembly.parameters) {
            if (parameter.name) {
                scopes.add(assembly, this.descriptions.createDescription(parameter, parameter.name, document));
            }
        }
        return scopes;
    }

}
