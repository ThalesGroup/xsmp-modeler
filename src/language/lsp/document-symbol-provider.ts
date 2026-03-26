import { interruptAndCheck, type AstNode, Cancellation, type LangiumDocument, type MaybePromise, type WorkspaceLock } from 'langium';
import type { DocumentSymbolProvider, NodeKindProvider } from 'langium/lsp';
import type { DocumentSymbol, DocumentSymbolParams } from 'vscode-languageserver';
import * as ast from '../generated/ast.js';
import type { XsmpNodeInfoProvider } from './node-info-provider.js';
import { type AttributeHelper } from '../utils/attribute-helper.js';
import type { XsmpServices } from '../xsmp-module.js';

export class XsmpDocumentSymbolProvider implements DocumentSymbolProvider {

    protected readonly nodeKindProvider: NodeKindProvider;
    protected readonly nodeInfoProvider: XsmpNodeInfoProvider;
    protected readonly workspaceManager: WorkspaceLock;
    protected readonly attrHelper: AttributeHelper;

    constructor(services: XsmpServices) {
        this.nodeKindProvider = services.shared.lsp.NodeKindProvider;
        this.nodeInfoProvider = services.shared.lsp.NodeInfoProvider;
        this.workspaceManager = services.shared.workspace.WorkspaceLock;
        this.attrHelper = services.shared.AttributeHelper;
    }

    getSymbols(document: LangiumDocument, _params: DocumentSymbolParams, cancelToken = Cancellation.CancellationToken.None): MaybePromise<DocumentSymbol[]> {
        return this.workspaceManager.read(() => this.getSymbol(document, document.parseResult.value, cancelToken));
    }

    protected async getSymbol(document: LangiumDocument, astNode: AstNode, cancelToken: Cancellation.CancellationToken): Promise<DocumentSymbol[]> {
        await interruptAndCheck(cancelToken);
        const node = astNode.$cstNode;
        const name = this.getSymbolName(astNode);

        if (node && name) {
            return [{
                kind: this.nodeKindProvider.getSymbolKind(astNode),
                name: name,
                range: node.range,
                selectionRange: node.range,
                children: await this.getChildSymbols(document, astNode, cancelToken),
                tags: this.nodeInfoProvider.getTags(astNode),
                detail: this.nodeInfoProvider.getDetails(astNode),
            }];
        }
        return await this.getChildSymbols(document, astNode, cancelToken);
    }

    protected async getChildSymbols(document: LangiumDocument, astNode: AstNode, cancelToken: Cancellation.CancellationToken): Promise<DocumentSymbol[]> {
        const children = this.getChildren(astNode);
        if (children.length > 0) {
            const symbols = await Promise.all(
                children.map(async (e) => await this.getSymbol(document, e, cancelToken))
            );
            return symbols.flat();
        }
        return [];
    }

    protected getSymbolName(node: AstNode): string | undefined {
        switch (node.$type) {
            case ast.ModelInstance:
            case ast.AssemblyInstance:
                if (ast.isSubInstance(node.$container)) {
                    return `${node.$container.container} += ${(node as ast.ModelInstance | ast.AssemblyInstance).name}`;
                }
                return (node as ast.ModelInstance | ast.AssemblyInstance).name;
            case ast.AssemblyComponentConfiguration:
                return `configure ${(node as ast.AssemblyComponentConfiguration).name}`;
            case ast.ComponentConfiguration: {
                const configuration = node as ast.ComponentConfiguration;
                return configuration.component?.$refText ? `${configuration.name}: ${configuration.component.$refText}` : configuration.name;
            }
            case ast.ComponentLinkBase:
                return (node as ast.ComponentLinkBase).name;
            case ast.ConfigurationUsage: {
                const usage = node as ast.ConfigurationUsage;
                return `include ${this.getReferenceText(usage.configuration)}${usage.path ? ` at ${usage.path}` : ''}`;
            }
            case ast.GlobalEventHandler: {
                const handler = node as ast.GlobalEventHandler;
                return `subscribe ${handler.entryPointName} -> ${this.quote(handler.globalEventName)}`;
            }
            case ast.EventLink: {
                const link = node as ast.EventLink;
                return `event link ${link.ownerPath} -> ${link.clientPath}`;
            }
            case ast.FieldLink: {
                const link = node as ast.FieldLink;
                return `field link ${link.ownerPath} -> ${link.clientPath}`;
            }
            case ast.InterfaceLink: {
                const link = node as ast.InterfaceLink;
                return `interface link ${link.ownerPath}: ${link.reference} -> ${link.clientPath}${link.backReference ? `: ${link.backReference}` : ''}`;
            }
            case ast.OperationCall: {
                const call = node as ast.OperationCall;
                return `call ${call.operation}${this.formatArgumentList(call.parameters.map(parameter => parameter.parameter))}`;
            }
            case ast.CallOperation: {
                const call = node as ast.CallOperation;
                return `call ${call.operationPath}${this.formatArgumentList(call.parameters.map(parameter => parameter.parameter))}`;
            }
            case ast.PropertyValue:
                return `property ${(node as ast.PropertyValue).property}`;
            case ast.SetProperty:
                return `property ${(node as ast.SetProperty).propertyPath}`;
            case ast.FieldValue:
                return (node as ast.FieldValue).field;
            case ast.Trigger:
                return `trig ${(node as ast.Trigger).entryPoint}`;
            case ast.Transfer: {
                const transfer = node as ast.Transfer;
                return `transfer ${transfer.outputFieldPath} -> ${transfer.inputFieldPath}`;
            }
            case ast.ExecuteTask: {
                const execute = node as ast.ExecuteTask;
                return `execute ${this.getReferenceText(execute.task)}${execute.root ? ` at ${execute.root}` : ''}`;
            }
            case ast.EmitGlobalEvent: {
                const emit = node as ast.EmitGlobalEvent;
                return `${emit.asynchronous ? 'async ' : ''}emit ${this.quote(emit.eventName)}`;
            }
            case ast.MissionEvent: {
                const event = node as ast.MissionEvent;
                return `event ${this.getReferenceText(event.task)} mission ${this.quote(event.missionTime)}`;
            }
            case ast.EpochEvent: {
                const event = node as ast.EpochEvent;
                return `event ${this.getReferenceText(event.task)} epoch ${this.quote(event.epochTime)}`;
            }
            case ast.SimulationEvent: {
                const event = node as ast.SimulationEvent;
                return `event ${this.getReferenceText(event.task)} simulation ${this.quote(event.simulationTime)}`;
            }
            case ast.ZuluEvent: {
                const event = node as ast.ZuluEvent;
                return `event ${this.getReferenceText(event.task)} zulu ${this.quote(event.zuluTime)}`;
            }
            case ast.GlobalEventTriggeredEvent: {
                const event = node as ast.GlobalEventTriggeredEvent;
                return `event ${this.getReferenceText(event.task)} on ${this.quote(event.startEvent)}${event.stopEvent ? ` until ${this.quote(event.stopEvent)}` : ''}`;
            }
        }
        if (!ast.reflection.isSubtype(node.$type, ast.NamedElement)) {
            return undefined;
        }
        return this.attrHelper.getSignature(node as ast.NamedElement);
    }

    protected getChildren(astNode: AstNode): AstNode[] {
        switch (astNode.$type) {
            case ast.Assembly:
                return this.sortChildren([...(astNode as ast.Assembly).configurations, (astNode as ast.Assembly).model]);
            case ast.SubInstance:
                return this.sortChildren([(astNode as ast.SubInstance).instance]);
            default:
                if ('elements' in astNode) {
                    return this.sortChildren(astNode.elements as AstNode[]);
                }
                return [];
        }
    }

    protected sortChildren(children: Array<AstNode | undefined>): AstNode[] {
        return children
            .filter((child): child is AstNode => child !== undefined)
            .sort((left, right) => (left.$cstNode?.offset ?? Number.MAX_SAFE_INTEGER) - (right.$cstNode?.offset ?? Number.MAX_SAFE_INTEGER));
    }

    protected getReferenceText(reference: { $refText?: string, ref?: { name?: string } }): string {
        return reference.ref?.name ?? reference.$refText ?? '<unknown>';
    }

    protected formatArgumentList(parameters: Array<string | undefined>): string {
        return `(${parameters.filter((parameter): parameter is string => parameter !== undefined).join(', ')})`;
    }

    protected quote(value: string): string {
        return `"${value}"`;
    }
}
