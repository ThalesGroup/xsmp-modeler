import { type AstNode } from 'langium';
import type { NodeFormatter } from 'langium/lsp';
import { AbstractFormatter, Formatting } from 'langium/lsp';
import * as ast from '../generated/ast-partial.js';

export class XsmpcatFormatter extends AbstractFormatter {

    protected override format(node: AstNode): void {
        switch (node.$type) {
            case ast.Attribute: return this.formatAttribute(node as ast.Attribute, this.getNodeFormatter(node));
            case ast.Parameter: return this.formatParameter(node as ast.Parameter, this.getNodeFormatter(node));
            case ast.ReturnParameter: return this.formatReturnParameter(node as ast.ReturnParameter, this.getNodeFormatter(node));
            case ast.Container: return this.formatContainer(node as ast.Container, this.getNodeFormatter(node));
            case ast.Reference: return this.formatReference(node as ast.Reference, this.getNodeFormatter(node));
            case ast.Multiplicity: return this.formatMultiplicity(node as ast.Multiplicity, this.getNodeFormatter(node));
            case ast.EntryPoint: return this.formatEntryPoint(node as ast.EntryPoint, this.getNodeFormatter(node));
            case ast.EventSource: return this.formatEventSource(node as ast.EventSource, this.getNodeFormatter(node));
            case ast.EventSink: return this.formatEventSink(node as ast.EventSink, this.getNodeFormatter(node));
            case ast.EnumerationLiteral: return this.formatEnumerationLiteral(node as ast.EnumerationLiteral, this.getNodeFormatter(node));
            case ast.Catalogue: return this.formatCatalogue(node as ast.Catalogue, this.getNodeFormatter(node));
            case ast.Namespace: return this.formatNamespace(node as ast.Namespace, this.getNodeFormatter(node));
            case ast.AttributeType: return this.formatAttributeType(node as ast.AttributeType, this.getNodeFormatter(node));
            case ast.Field: return this.formatField(node as ast.Field, this.getNodeFormatter(node));
            case ast.Constant: return this.formatConstant(node as ast.Constant, this.getNodeFormatter(node));
            case ast.Association: return this.formatAssociation(node as ast.Association, this.getNodeFormatter(node));
            case ast.Property: return this.formatProperty(node as ast.Property, this.getNodeFormatter(node));
            case ast.Operation: return this.formatOperation(node as ast.Operation, this.getNodeFormatter(node));
            case ast.Class: return this.formatClass(node as ast.Class, this.getNodeFormatter(node));
            case ast.Exception: return this.formatException(node as ast.Exception, this.getNodeFormatter(node));
            case ast.Structure: return this.formatStructure(node as ast.Structure, this.getNodeFormatter(node));
            case ast.Integer: return this.formatInteger(node as ast.Integer, this.getNodeFormatter(node));
            case ast.Float: return this.formatFloat(node as ast.Float, this.getNodeFormatter(node));
            case ast.Model: return this.formatModel(node as ast.Model, this.getNodeFormatter(node));
            case ast.Service: return this.formatService(node as ast.Service, this.getNodeFormatter(node));
            case ast.Interface: return this.formatInterface(node as ast.Interface, this.getNodeFormatter(node));
            case ast.ArrayType: return this.formatArray(node as ast.ArrayType, this.getNodeFormatter(node));
            case ast.Enumeration: return this.formatEnumeration(node as ast.Enumeration, this.getNodeFormatter(node));
            case ast.EventType: return this.formatEventType(node as ast.EventType, this.getNodeFormatter(node));
            case ast.StringType: return this.formatString(node as ast.StringType, this.getNodeFormatter(node));
            case ast.ValueReference: return this.formatValueReference(node as ast.ValueReference, this.getNodeFormatter(node));
            case ast.NativeType: return this.formatNativeType(node as ast.NativeType, this.getNodeFormatter(node));
            case ast.PrimitiveType: return this.formatPrimitiveType(node as ast.PrimitiveType, this.getNodeFormatter(node));
            case ast.CollectionLiteral: return this.formatCollectionLiteral(node as ast.CollectionLiteral, this.getNodeFormatter(node));
            case ast.DesignatedInitializer: return this.formatDesignatedInitializer(node as ast.DesignatedInitializer, this.getNodeFormatter(node));
            case ast.UnaryOperation: return this.formatUnaryOperation(node as ast.UnaryOperation, this.getNodeFormatter(node));
            case ast.BinaryOperation: return this.formatBinaryOperation(node as ast.BinaryOperation, this.getNodeFormatter(node));
            case ast.ParenthesizedExpression: return this.formatParenthesizedExpression(node as ast.ParenthesizedExpression, this.getNodeFormatter(node));
        }
    }

    formatAttribute(node: ast.Attribute, formatter: NodeFormatter<ast.Attribute>) {
        formatter.property('type').prepend(Formatting.noSpace());
        const bracesOpen = formatter.keyword('(');
        const bracesClose = formatter.keyword(')');
        bracesOpen.surround(Formatting.noSpace());
        bracesClose.prepend(Formatting.noSpace());
    }

    formatParameter(node: ast.Parameter, formatter: NodeFormatter<ast.Parameter>) {
        formatter.property('direction').append(Formatting.oneSpace());
        formatter.property('name').prepend(Formatting.oneSpace());
        formatter.keyword('=').surround(Formatting.oneSpace());
    }
    formatReturnParameter(node: ast.ReturnParameter, formatter: NodeFormatter<ast.ReturnParameter>) {
        formatter.property('name').surround(Formatting.oneSpace());
    }
    formatContainer(node: ast.Container, formatter: NodeFormatter<ast.Container>) {
        formatter.property('type').prepend(Formatting.oneSpace());
        formatter.property('name').prepend(Formatting.oneSpace());
        formatter.property('optional').prepend(Formatting.noSpace());
        formatter.property('multiplicity').prepend(Formatting.noSpace());
        formatter.keyword('=').surround(Formatting.oneSpace());
    }

    formatReference(node: ast.Reference, formatter: NodeFormatter<ast.Reference>) {
        formatter.property('interface').prepend(Formatting.oneSpace());
        formatter.property('name').prepend(Formatting.oneSpace());
        formatter.property('optional').prepend(Formatting.noSpace());
        formatter.property('multiplicity').prepend(Formatting.noSpace());
    }

    formatMultiplicity(node: ast.Multiplicity, formatter: NodeFormatter<ast.Multiplicity>) {
        formatter.keyword('[').append(Formatting.noSpace());
        formatter.keyword(']').prepend(Formatting.noSpace());
        formatter.keyword('...').surround(Formatting.oneSpace());
    }

    formatEntryPoint(node: ast.EntryPoint, formatter: NodeFormatter<ast.EntryPoint>) {
        formatter.property('name').prepend(Formatting.oneSpace());
    }

    formatEventSource(node: ast.EventSource, formatter: NodeFormatter<ast.EventSource>) {
        formatter.property('type').surround(Formatting.oneSpace());
    }

    formatEventSink(node: ast.EventSink, formatter: NodeFormatter<ast.EventSink>) {
        formatter.property('type').surround(Formatting.oneSpace());
    }

    formatEnumerationLiteral(node: ast.EnumerationLiteral, formatter: NodeFormatter<ast.EnumerationLiteral>) {
        formatter.keyword('=').surround(Formatting.oneSpace());
    }

    formatCatalogue(node: ast.Catalogue, formatter: NodeFormatter<ast.Catalogue>) {
        formatter.keyword('catalogue').prepend(Formatting.noIndent());
        formatter.property('name').prepend(Formatting.oneSpace()).append(Formatting.newLine({ allowMore: true }));
        formatter.nodes(...node.elements).prepend(Formatting.noIndent());
    }

    formatNamespace(node: ast.Namespace, formatter: NodeFormatter<ast.Namespace>) {
        formatter.keyword('namespace').append(Formatting.oneSpace());
        formatter.keyword('::').surround(Formatting.noSpace());
        this.formatBody(node, formatter);
    }

    formatConstantOrFieldOrAssociationOrAttributeType(node: ast.Constant | ast.Field | ast.Association | ast.AttributeType,
        formatter: NodeFormatter<ast.Constant | ast.Field | ast.Association | ast.AttributeType>) {
        this.formatMofifiers(formatter);
        formatter.property('type').surround(Formatting.oneSpace());
        formatter.keyword('=').surround(Formatting.oneSpace());
    }

    formatAttributeType(node: ast.AttributeType, formatter: NodeFormatter<ast.AttributeType>) {
        this.formatConstantOrFieldOrAssociationOrAttributeType(node, formatter);
    }

    formatField(node: ast.Field, formatter: NodeFormatter<ast.Field>) {
        this.formatConstantOrFieldOrAssociationOrAttributeType(node, formatter);
    }

    formatConstant(node: ast.Constant, formatter: NodeFormatter<ast.Constant>) {
        this.formatConstantOrFieldOrAssociationOrAttributeType(node, formatter);
    }

    formatAssociation(node: ast.Association, formatter: NodeFormatter<ast.Association>) {
        this.formatConstantOrFieldOrAssociationOrAttributeType(node, formatter);
    }

    formatProperty(node: ast.Property, formatter: NodeFormatter<ast.Property>) {
        this.formatMofifiers(formatter);
        formatter.property('type').surround(Formatting.oneSpace());
        formatter.keyword('get').surround(Formatting.oneSpace());
        formatter.keyword('set').surround(Formatting.oneSpace());
        formatter.keywords('throws').append(Formatting.oneSpace());
        this.formatCommaList(formatter);
        formatter.keyword('->').surround(Formatting.oneSpace());
    }

    formatOperation(node: ast.Operation, formatter: NodeFormatter<ast.Operation>) {
        this.formatMofifiers(formatter);
        formatter.keyword('void').surround(Formatting.oneSpace());
        formatter.property('returnParameter').surround(Formatting.oneSpace());
        formatter.property('name').prepend(Formatting.oneSpace()).append(Formatting.noSpace());
        formatter.keyword('(').append(Formatting.noSpace());
        this.formatCommaList(formatter);
        formatter.keyword(')').prepend(Formatting.noSpace());
        formatter.keyword('throws').surround(Formatting.oneSpace());
    }

    formatClass(node: ast.Class, formatter: NodeFormatter<ast.Class>) {
        this.formatMofifiers(formatter);
        formatter.property('name').prepend(Formatting.oneSpace());
        formatter.keyword('extends').surround(Formatting.oneSpace());
        this.formatBody(node, formatter);
    }

    formatException(node: ast.Exception, formatter: NodeFormatter<ast.Exception>) {
        this.formatClass(node, formatter);
    }

    formatStructure(node: ast.Structure, formatter: NodeFormatter<ast.Structure>) {
        this.formatMofifiers(formatter);
        formatter.property('name').prepend(Formatting.oneSpace());
        this.formatBody(node, formatter);
    }

    formatInteger(node: ast.Integer, formatter: NodeFormatter<ast.Integer>) {
        this.formatMofifiers(formatter);
        formatter.property('name').prepend(Formatting.oneSpace());
        formatter.keyword('extends').surround(Formatting.oneSpace());
        formatter.keyword('in').surround(Formatting.oneSpace());
        formatter.keyword('...').surround(Formatting.oneSpace());
    }

    formatFloat(node: ast.Float, formatter: NodeFormatter<ast.Float>) {
        this.formatMofifiers(formatter);
        formatter.property('name').prepend(Formatting.oneSpace());
        formatter.keyword('extends').surround(Formatting.oneSpace());
        formatter.keyword('in').surround(Formatting.oneSpace());
        formatter.property('range').surround(Formatting.oneSpace());
    }

    formatComponent(node: ast.Component, formatter: NodeFormatter<ast.Component>) {
        this.formatMofifiers(formatter);
        formatter.property('name').prepend(Formatting.oneSpace());
        formatter.keyword('extends').surround(Formatting.oneSpace());
        formatter.keyword('implements').surround(Formatting.oneSpace());
        this.formatCommaList(formatter);
        this.formatBody(node, formatter);
    }

    formatModel(node: ast.Model, formatter: NodeFormatter<ast.Model>) {
        this.formatComponent(node, formatter);
    }

    formatService(node: ast.Service, formatter: NodeFormatter<ast.Service>) {
        this.formatComponent(node, formatter);
    }

    formatInterface(node: ast.Interface, formatter: NodeFormatter<ast.Interface>) {
        this.formatMofifiers(formatter);
        formatter.property('name').prepend(Formatting.oneSpace());
        formatter.keyword('extends').surround(Formatting.oneSpace());
        this.formatCommaList(formatter);
        this.formatBody(node, formatter);
    }

    formatArray(node: ast.ArrayType, formatter: NodeFormatter<ast.ArrayType>) {
        this.formatMofifiers(formatter);
        formatter.property('name').prepend(Formatting.oneSpace());
        formatter.keyword('=').surround(Formatting.oneSpace());
        formatter.keyword('[').surround(Formatting.noSpace());
        formatter.keyword(']').prepend(Formatting.noSpace());
    }

    formatEnumeration(node: ast.Enumeration, formatter: NodeFormatter<ast.Enumeration>) {
        this.formatMofifiers(formatter);
        formatter.property('name').prepend(Formatting.oneSpace());
        const bracesOpen = formatter.keyword('{');
        const bracesClose = formatter.keyword('}');
        bracesOpen.prepend(Formatting.newLine()).append(Formatting.newLine({ allowMore: true }));
        formatter.interior(bracesOpen, bracesClose).prepend(Formatting.indent());
        formatter.keywords(',').prepend(Formatting.noSpace()).append(Formatting.newLine());
        bracesClose.prepend(Formatting.newLine()).append(Formatting.newLine({ allowMore: true }));
    }

    formatEventType(node: ast.EventType, formatter: NodeFormatter<ast.EventType>) {
        this.formatMofifiers(formatter);
        formatter.property('name').prepend(Formatting.oneSpace());
        formatter.keyword('extends').surround(Formatting.oneSpace());
    }

    formatString(node: ast.StringType, formatter: NodeFormatter<ast.StringType>) {
        this.formatMofifiers(formatter);
        formatter.property('name').prepend(Formatting.oneSpace());
        formatter.keyword('[').surround(Formatting.noSpace());
        formatter.keyword(']').prepend(Formatting.noSpace());
    }

    formatValueReference(node: ast.ValueReference, formatter: NodeFormatter<ast.ValueReference>) {
        this.formatMofifiers(formatter);
        formatter.property('name').prepend(Formatting.oneSpace());
        formatter.keyword('=').surround(Formatting.oneSpace());
        formatter.keyword('*').prepend(Formatting.noSpace());
    }

    formatNativeType(node: ast.NativeType, formatter: NodeFormatter<ast.NativeType>) {
        this.formatMofifiers(formatter);
        formatter.property('name').prepend(Formatting.oneSpace());
    }

    formatPrimitiveType(node: ast.PrimitiveType, formatter: NodeFormatter<ast.PrimitiveType>) {
        this.formatMofifiers(formatter);
        formatter.property('name').prepend(Formatting.oneSpace());
    }

    formatCollectionLiteral(node: ast.CollectionLiteral, formatter: NodeFormatter<ast.CollectionLiteral>) {
        formatter.keyword('{').surround(Formatting.oneSpace());
        formatter.keywords(',').prepend(Formatting.noSpace()).append(Formatting.oneSpace());
        formatter.keyword('}').prepend(Formatting.oneSpace());
    }

    formatDesignatedInitializer(node: ast.DesignatedInitializer, formatter: NodeFormatter<ast.DesignatedInitializer>) {
        formatter.keyword('.').append(Formatting.noSpace());
        formatter.keyword('=').surround(Formatting.oneSpace());
    }

    formatUnaryOperation(node: ast.UnaryOperation, formatter: NodeFormatter<ast.UnaryOperation>) {
        formatter.property('feature').append(Formatting.noSpace());
    }

    formatBinaryOperation(node: ast.BinaryOperation, formatter: NodeFormatter<ast.BinaryOperation>) {
        formatter.property('feature').surround(Formatting.oneSpace());
    }

    formatParenthesizedExpression(node: ast.ParenthesizedExpression, formatter: NodeFormatter<ast.ParenthesizedExpression>) {
        formatter.property('expr').surround(Formatting.noSpace());
    }

    protected formatCommaList(formatter: NodeFormatter<AstNode>): void {
        formatter.keywords(',').prepend(Formatting.noSpace()).append(Formatting.oneSpace());
    }

    protected formatMofifiers(formatter: NodeFormatter<ast.VisibilityElement>): void {
        formatter.properties('modifiers').append(Formatting.oneSpace());
    }

    protected formatBody(type: ast.WithBody, formatter: NodeFormatter<ast.WithBody>): void {
        const bracesOpen = formatter.keyword('{');
        const bracesClose = formatter.keyword('}');
        bracesOpen.prepend(Formatting.newLine());
        bracesOpen.append(Formatting.newLine({ allowMore: true }));
        formatter.interior(bracesOpen, bracesClose).prepend(Formatting.indent());
        bracesClose.prepend(Formatting.newLine());
        bracesClose.append(Formatting.newLine({ allowMore: true }));
    }

}