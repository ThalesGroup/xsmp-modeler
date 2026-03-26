import type { AstNode } from 'langium';
import { SymbolTag } from 'vscode-languageserver';
import * as XsmpUtils from '../utils/xsmp-utils.js';
import * as ast from '../generated/ast-partial.js';
import { PTK } from '../utils/primitive-type-kind.js';
import { getValueAs } from '../utils/solver.js';
import { type XsmpSharedServices } from '../xsmp-module.js';
import { type DocumentationHelper } from '../utils/documentation-helper.js';
import { type AttributeHelper } from '../utils/attribute-helper.js';

export class XsmpNodeInfoProvider {

    protected readonly docHelper: DocumentationHelper;
    protected readonly attrHelper: AttributeHelper;
    constructor(services: XsmpSharedServices) {
        this.docHelper = services.DocumentationHelper;
        this.attrHelper = services.AttributeHelper;
    }

    getDetails(node: AstNode): string | undefined {
        switch (node.$type) {
            case ast.Association: return (node as ast.Association).type?.$refText + (this.attrHelper.isByPointer(node as ast.Association) ? '*' : '');
            case ast.Constant: return (node as ast.Constant).type?.$refText;
            case ast.Container: return (node as ast.Container).type?.$refText + this.getMultiplicity(node as ast.NamedElementWithMultiplicity);
            case ast.EventSink: return `EventSink<${(node as ast.EventSink).type?.$refText}>`;
            case ast.EventSource: return `EventSource<${(node as ast.EventSource).type?.$refText}>`;
            case ast.Field: return (node as ast.Field).type?.$refText;
            case ast.AttributeType: return (node as ast.AttributeType).type?.$refText;
            case ast.AssemblyInstance: return (node as ast.AssemblyInstance).assembly?.$refText;
            case ast.EventType: return (node as ast.EventType).eventArgs?.$refText ?? 'void';
            case ast.Integer: return (node as ast.Integer).primitiveType?.$refText ?? 'Smp::Int32';
            case ast.Float: return (node as ast.Float).primitiveType?.$refText ?? 'Smp::Float64';
            case ast.ModelInstance: return (node as ast.ModelInstance).implementation?.$refText ?? (node as ast.ModelInstance).strImplementation;
            case ast.ValueReference: return (node as ast.ValueReference).type?.$refText + '*';
            case ast.ArrayType: return `${(node as ast.ArrayType).itemType?.$refText}[${getValueAs((node as ast.ArrayType).size, PTK.Int64)?.getValue()}]`;
            case ast.Operation: return (node as ast.Operation).returnParameter?.type?.$refText ?? 'void';
            case ast.Property: return (node as ast.Property).type?.$refText;
            case ast.Reference: return (node as ast.Reference).interface?.$refText + this.getMultiplicity(node as ast.NamedElementWithMultiplicity);
            case ast.Model:
            case ast.Service:
            case ast.Class:
            case ast.Exception:
            case ast.EntryPoint:
                return XsmpUtils.getNodeType(node);
            default: return undefined;
        }
    }

    protected getMultiplicity(node: ast.NamedElementWithMultiplicity): string {
        const lower = XsmpUtils.getLower(node) ?? BigInt(1);
        const upper = XsmpUtils.getUpper(node) ?? BigInt(1);
        if (lower === BigInt(0) && upper === BigInt(1)) {
            return '?';
        }
        else if (lower === BigInt(1) && upper === BigInt(1)) {
            return '';
        }
        else if (lower === upper) {
            return `[${lower}]`;
        }
        else if (upper < BigInt(0)) {
            if (lower === BigInt(0)) {
                return '*';
            }
            else if (lower === BigInt(1)) {
                return '+';
            }
            else {
                return `[${lower} ... *]`;
            }
        }
        else {
            return `[${lower} ... ${upper}]`;
        }
    }

    getTags(node: AstNode): SymbolTag[] | undefined {
        if (ast.reflection.isSubtype(node.$type, ast.NamedElement) && this.docHelper.IsDeprecated(node as ast.NamedElement)) {
            return [SymbolTag.Deprecated];
        }
        return undefined;
    }
}
