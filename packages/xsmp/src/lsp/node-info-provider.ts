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
            case ast.Association.$type: return (node as ast.Association).type?.$refText + (this.attrHelper.isByPointer(node as ast.Association) ? '*' : '');
            case ast.Constant.$type: return (node as ast.Constant).type?.$refText;
            case ast.Container.$type: return (node as ast.Container).type?.$refText + this.getMultiplicity(node as ast.NamedElementWithMultiplicity);
            case ast.EventSink.$type: return `EventSink<${(node as ast.EventSink).type?.$refText}>`;
            case ast.EventSource.$type: return `EventSource<${(node as ast.EventSource).type?.$refText}>`;
            case ast.Field.$type: return (node as ast.Field).type?.$refText;
            case ast.AttributeType.$type: return (node as ast.AttributeType).type?.$refText;
            case ast.AssemblyInstance.$type: return (node as ast.AssemblyInstance).assembly?.$refText;
            case ast.EventType.$type: return (node as ast.EventType).eventArgs?.$refText ?? 'void';
            case ast.Integer.$type: return (node as ast.Integer).primitiveType?.$refText ?? 'Smp::Int32';
            case ast.Float.$type: return (node as ast.Float).primitiveType?.$refText ?? 'Smp::Float64';
            case ast.ModelInstance.$type: return (node as ast.ModelInstance).implementation?.$refText ?? (node as ast.ModelInstance).strImplementation;
            case ast.ValueReference.$type: return (node as ast.ValueReference).type?.$refText + '*';
            case ast.ArrayType.$type: {
                const arrayType = node as ast.ArrayType;
                const size = getValueAs(arrayType.size, PTK.Int64)?.getValue();
                const sizeText = size === undefined ? '' : size.toString();
                return `${arrayType.itemType?.$refText}[${sizeText}]`;
            }
            case ast.Operation.$type: return (node as ast.Operation).returnParameter?.type?.$refText ?? 'void';
            case ast.Property.$type: return (node as ast.Property).type?.$refText;
            case ast.Reference.$type: return (node as ast.Reference).interface?.$refText + this.getMultiplicity(node as ast.NamedElementWithMultiplicity);
            case ast.Model.$type:
            case ast.Service.$type:
            case ast.Class.$type:
            case ast.Exception.$type:
            case ast.EntryPoint.$type:
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
        if (ast.reflection.isSubtype(node.$type, ast.NamedElement.$type) && this.docHelper.IsDeprecated(node as ast.NamedElement)) {
            return [SymbolTag.Deprecated];
        }
        return undefined;
    }
}
