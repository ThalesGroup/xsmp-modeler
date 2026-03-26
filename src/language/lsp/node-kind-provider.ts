import type { AstNode, AstNodeDescription } from 'langium';
import { isAstNodeDescription } from 'langium';
import type { NodeKindProvider } from 'langium/lsp';
import { CompletionItemKind, SymbolKind } from 'vscode-languageserver';
import * as ast from '../generated/ast.js';

export class XsmpNodeKindProvider implements NodeKindProvider {
    getCompletionItemKind(node: AstNode | AstNodeDescription): CompletionItemKind {

        const type = isAstNodeDescription(node) ? node.type : node.$type;
        switch (type) {
            case ast.ArrayType: return CompletionItemKind.Operator;
            case ast.Assembly:
            case ast.Configuration:
            case ast.LinkBase:
            case ast.Schedule:
                return CompletionItemKind.File;
            case ast.Constant: return CompletionItemKind.Constant;
            case ast.Enumeration: return CompletionItemKind.Enum;
            case ast.EnumerationLiteral: return CompletionItemKind.EnumMember;
            case ast.EmitGlobalEvent:
            case ast.EpochEvent:
            case ast.EventLink:
            case ast.EventSink:
            case ast.EventSource:
            case ast.EventType:
            case ast.GlobalEventHandler:
            case ast.GlobalEventTriggeredEvent:
            case ast.MissionEvent:
            case ast.SimulationEvent:
            case ast.Trigger:
            case ast.ZuluEvent:
                return CompletionItemKind.Event;
            case ast.CallOperation:
            case ast.ExecuteTask:
            case ast.Operation:
            case ast.OperationCall:
            case ast.Task:
                return CompletionItemKind.Method;
            case ast.Interface: return CompletionItemKind.Interface;
            case ast.Integer:
            case ast.PrimitiveType:
            case ast.Float:
                return CompletionItemKind.TypeParameter;
            case ast.Project:
            case ast.Tool:
            case ast.Profile:
            case ast.Catalogue:
                return CompletionItemKind.File;
            case ast.StringType: return CompletionItemKind.Text;
            case ast.Structure: return CompletionItemKind.Struct;
            case ast.AssemblyComponentConfiguration:
            case ast.AssemblyInstance:
            case ast.Class:
            case ast.ComponentConfiguration:
            case ast.ComponentLinkBase:
            case ast.Exception:
            case ast.Model:
            case ast.ModelInstance:
            case ast.Service:
                return CompletionItemKind.Class;
            case ast.ConfigurationUsage:
                return CompletionItemKind.Module;
            case ast.PropertyValue:
            case ast.SetProperty:
                return CompletionItemKind.Property;
            case ast.Field:
            case ast.FieldLink:
            case ast.FieldValue:
            case ast.InterfaceLink:
            case ast.Transfer:
            case ast.Property:
            default: return CompletionItemKind.Field;
        }
    }

    getSymbolKind(node: AstNode | AstNodeDescription): SymbolKind {

        const type = isAstNodeDescription(node) ? node.type : node.$type;
        switch (type) {
            case ast.Assembly:
            case ast.Configuration:
            case ast.LinkBase:
            case ast.Schedule:
                return SymbolKind.Package;
            case ast.ArrayType: return SymbolKind.Array;
            case ast.CallOperation:
            case ast.ExecuteTask:
                return SymbolKind.Method;
            case ast.Constant: return SymbolKind.Constant;
            case ast.Enumeration: return SymbolKind.Enum;
            case ast.EnumerationLiteral: return SymbolKind.EnumMember;
            case ast.EmitGlobalEvent:
            case ast.EpochEvent:
            case ast.EventLink:
            case ast.GlobalEventHandler:
            case ast.GlobalEventTriggeredEvent:
            case ast.MissionEvent:
            case ast.SimulationEvent:
            case ast.Trigger:
            case ast.EventSink:
            case ast.EventSource:
            case ast.EventType:
            case ast.ZuluEvent:
                return SymbolKind.Event;
            case ast.AssemblyInstance:
            case ast.ComponentConfiguration:
            case ast.ComponentLinkBase:
            case ast.EntryPoint:
            case ast.ModelInstance:
            case ast.AssemblyComponentConfiguration:
                return SymbolKind.Object;
            case ast.OperationCall:
            case ast.Task:
                return SymbolKind.Method;
            case ast.Operation: return SymbolKind.Method;
            case ast.Interface: return SymbolKind.Interface;
            case ast.Integer:
            case ast.PrimitiveType:
            case ast.Float: return SymbolKind.Number;
            case ast.Project:
            case ast.Tool:
            case ast.Profile:
            case ast.Catalogue:
                return SymbolKind.Package;
            case ast.PropertyValue:
            case ast.SetProperty:
                return SymbolKind.Property;
            case ast.ConfigurationUsage:
                return SymbolKind.Module;
            case ast.Property: return SymbolKind.Property;
            case ast.Parameter: return SymbolKind.Variable;
            case ast.StringType: return SymbolKind.String;
            case ast.Structure: return SymbolKind.Struct;
            case ast.Namespace: return SymbolKind.Namespace;
            case ast.Class:
            case ast.Exception:
            case ast.Model:
            case ast.Service:
                return SymbolKind.Class;
            case ast.Association:
            case ast.FieldLink:
            case ast.Field:
            case ast.FieldValue:
            case ast.InterfaceLink:
            case ast.Transfer:
            default: return SymbolKind.Field;
        }

    }

}
