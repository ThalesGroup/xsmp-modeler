import type { AstNode, AstNodeDescription } from 'langium';
import { isAstNodeDescription } from 'langium';
import type { NodeKindProvider } from 'langium/lsp';
import { CompletionItemKind, SymbolKind } from 'vscode-languageserver';
import * as ast from '../generated/ast-partial.js';

export class XsmpNodeKindProvider implements NodeKindProvider {
    getCompletionItemKind(node: AstNode | AstNodeDescription): CompletionItemKind {

        const type = isAstNodeDescription(node) ? node.type : node.$type;
        switch (type) {
            case ast.ArrayType.$type: return CompletionItemKind.Operator;
            case ast.Assembly.$type:
            case ast.Configuration.$type:
            case ast.LinkBase.$type:
            case ast.Schedule.$type:
                return CompletionItemKind.File;
            case ast.Constant.$type: return CompletionItemKind.Constant;
            case ast.Enumeration.$type: return CompletionItemKind.Enum;
            case ast.EnumerationLiteral.$type: return CompletionItemKind.EnumMember;
            case ast.EmitGlobalEvent.$type:
            case ast.EpochEvent.$type:
            case ast.EventLink.$type:
            case ast.EventSink.$type:
            case ast.EventSource.$type:
            case ast.EventType.$type:
            case ast.GlobalEventHandler.$type:
            case ast.GlobalEventTriggeredEvent.$type:
            case ast.MissionEvent.$type:
            case ast.SimulationEvent.$type:
            case ast.Trigger.$type:
            case ast.ZuluEvent.$type:
                return CompletionItemKind.Event;
            case ast.CallOperation.$type:
            case ast.ExecuteTask.$type:
            case ast.Operation.$type:
            case ast.OperationCall.$type:
            case ast.Task.$type:
                return CompletionItemKind.Method;
            case ast.Interface.$type: return CompletionItemKind.Interface;
            case ast.Integer.$type:
            case ast.PrimitiveType.$type:
            case ast.Float.$type:
                return CompletionItemKind.TypeParameter;
            case ast.Project.$type:
            case ast.Tool.$type:
            case ast.Profile.$type:
            case ast.Catalogue.$type:
                return CompletionItemKind.File;
            case ast.StringType.$type: return CompletionItemKind.Text;
            case ast.Structure.$type: return CompletionItemKind.Struct;
            case ast.AssemblyComponentConfiguration.$type:
            case ast.AssemblyInstance.$type:
            case ast.Class.$type:
            case ast.ComponentConfiguration.$type:
            case ast.ComponentLinkBase.$type:
            case ast.Exception.$type:
            case ast.Model.$type:
            case ast.ModelInstance.$type:
            case ast.Service.$type:
                return CompletionItemKind.Class;
            case ast.ConfigurationUsage.$type:
                return CompletionItemKind.Module;
            case ast.PropertyValue.$type:
            case ast.SetProperty.$type:
                return CompletionItemKind.Property;
            case ast.Field.$type:
            case ast.FieldLink.$type:
            case ast.FieldValue.$type:
            case ast.InterfaceLink.$type:
            case ast.Transfer.$type:
            case ast.Property.$type:
            default: return CompletionItemKind.Field;
        }
    }

    getSymbolKind(node: AstNode | AstNodeDescription): SymbolKind {

        const type = isAstNodeDescription(node) ? node.type : node.$type;
        switch (type) {
            case ast.Assembly.$type:
            case ast.Configuration.$type:
            case ast.LinkBase.$type:
            case ast.Schedule.$type:
                return SymbolKind.Package;
            case ast.ArrayType.$type: return SymbolKind.Array;
            case ast.CallOperation.$type:
            case ast.ExecuteTask.$type:
                return SymbolKind.Method;
            case ast.Constant.$type: return SymbolKind.Constant;
            case ast.Enumeration.$type: return SymbolKind.Enum;
            case ast.EnumerationLiteral.$type: return SymbolKind.EnumMember;
            case ast.EmitGlobalEvent.$type:
            case ast.EpochEvent.$type:
            case ast.EventLink.$type:
            case ast.GlobalEventHandler.$type:
            case ast.GlobalEventTriggeredEvent.$type:
            case ast.MissionEvent.$type:
            case ast.SimulationEvent.$type:
            case ast.Trigger.$type:
            case ast.EventSink.$type:
            case ast.EventSource.$type:
            case ast.EventType.$type:
            case ast.ZuluEvent.$type:
                return SymbolKind.Event;
            case ast.AssemblyInstance.$type:
            case ast.ComponentConfiguration.$type:
            case ast.ComponentLinkBase.$type:
            case ast.EntryPoint.$type:
            case ast.ModelInstance.$type:
            case ast.AssemblyComponentConfiguration.$type:
                return SymbolKind.Object;
            case ast.OperationCall.$type:
            case ast.Task.$type:
                return SymbolKind.Method;
            case ast.Operation.$type: return SymbolKind.Method;
            case ast.Interface.$type: return SymbolKind.Interface;
            case ast.Integer.$type:
            case ast.PrimitiveType.$type:
            case ast.Float.$type: return SymbolKind.Number;
            case ast.Project.$type:
            case ast.Tool.$type:
            case ast.Profile.$type:
            case ast.Catalogue.$type:
                return SymbolKind.Package;
            case ast.PropertyValue.$type:
            case ast.SetProperty.$type:
                return SymbolKind.Property;
            case ast.ConfigurationUsage.$type:
                return SymbolKind.Module;
            case ast.Property.$type: return SymbolKind.Property;
            case ast.Parameter.$type: return SymbolKind.Variable;
            case ast.StringType.$type: return SymbolKind.String;
            case ast.Structure.$type: return SymbolKind.Struct;
            case ast.Namespace.$type: return SymbolKind.Namespace;
            case ast.Class.$type:
            case ast.Exception.$type:
            case ast.Model.$type:
            case ast.Service.$type:
                return SymbolKind.Class;
            case ast.Association.$type:
            case ast.FieldLink.$type:
            case ast.Field.$type:
            case ast.FieldValue.$type:
            case ast.InterfaceLink.$type:
            case ast.Transfer.$type:
            default: return SymbolKind.Field;
        }

    }

}
