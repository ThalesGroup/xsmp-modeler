import type { AstNode, AstNodeDescription, AstNodeDescriptionProvider, LangiumDocument, PrecomputedScopes, ScopeComputation } from 'langium';
import * as ast from '../generated/ast.js';
import { Cancellation, MultiMap } from 'langium';
import { XsmpServices } from '../xsmp-module.js';

export class XsmpsedScopeComputation implements ScopeComputation {

    protected readonly descriptions: AstNodeDescriptionProvider;

    constructor(services: XsmpServices) {
        this.descriptions = services.workspace.AstNodeDescriptionProvider;
    }

    async computeExports(document: LangiumDocument, cancelToken = Cancellation.CancellationToken.None): Promise<AstNodeDescription[]> {
        const schedule = document.parseResult.value as ast.Schedule;
        const exportedDescriptions: AstNodeDescription[] = [];

        //Export the Schedule
        if (schedule.name) {
            exportedDescriptions.push(this.descriptions.createDescription(schedule, schedule.name, document));
            schedule.elements.filter(ast.isTask).forEach(element => exportedDescriptions.push(this.descriptions.createDescription(element, `${schedule.name}.${element.name}`, document)));
        }
        return exportedDescriptions;
    }

    async computeLocalScopes(document: LangiumDocument, cancelToken = Cancellation.CancellationToken.None): Promise<PrecomputedScopes> {
        const scopes = new MultiMap<AstNode, AstNodeDescription>();
        const schedule = document.parseResult.value as ast.Schedule;
        schedule.elements.filter(ast.isTask).forEach(element => scopes.add(schedule, this.descriptions.createDescription(element, element.name, document)));
        schedule.parameters.forEach(element => scopes.add(schedule, this.descriptions.createDescription(element, element.name, document)));
        return scopes;
    }

}