import type { AstNode } from 'langium';
import { Formatting, type NodeFormatter } from 'langium/lsp';
import * as ast from '../generated/ast-partial.js';
import { XsmpFormatterBase } from './xsmp-formatter-base.js';

export class XsmpasbFormatter extends XsmpFormatterBase {
    protected override format(node: AstNode): void {
        switch (node.$type) {
            case ast.LocalNamedReference.$type: return this.formatLocalNamedReference(node as ast.LocalNamedReference, this.getNodeFormatter(node));
            case ast.Path.$type: return this.formatPath(node as ast.Path, this.getNodeFormatter(node));
            case ast.PathMember.$type: return this.formatPathMember(node as ast.PathMember, this.getNodeFormatter(node));
            case ast.Assembly.$type: return this.formatAssembly(node as ast.Assembly, this.getNodeFormatter(node));
            case ast.AssemblyComponentConfiguration.$type: return this.formatComponentConfiguration(node as ast.AssemblyComponentConfiguration, this.getNodeFormatter(node));
            case ast.GlobalEventHandler.$type: return this.formatGlobalEventHandler(node as ast.GlobalEventHandler, this.getNodeFormatter(node));
            case ast.StringParameter.$type: return this.formatTypedAssignment(this.getNodeFormatter(node));
            case ast.Int32Parameter.$type: return this.formatTypedAssignment(this.getNodeFormatter(node));
            case ast.StringArgument.$type: return this.formatAssignment(this.getNodeFormatter(node));
            case ast.Int32Argument.$type: return this.formatAssignment(this.getNodeFormatter(node));
            case ast.ModelInstance.$type: return this.formatModelInstance(node as ast.ModelInstance, this.getNodeFormatter(node));
            case ast.AssemblyInstance.$type: return this.formatAssemblyInstance(node as ast.AssemblyInstance, this.getNodeFormatter(node));
            case ast.SubInstance.$type: return this.formatSubInstance(node as ast.SubInstance, this.getNodeFormatter(node));
            case ast.EventLink.$type: return this.formatDirectedLink(this.getNodeFormatter(node), 'event');
            case ast.FieldLink.$type: return this.formatDirectedLink(this.getNodeFormatter(node), 'field');
            case ast.InterfaceLink.$type: return this.formatDirectedLink(this.getNodeFormatter(node), 'interface');
            case ast.OperationCall.$type: return this.formatOperationCall(node as ast.OperationCall, this.getNodeFormatter(node));
            case ast.ParameterValue.$type: return this.formatAssignment(this.getNodeFormatter(node));
            case ast.PropertyValue.$type: return this.formatPropertyValue(node as ast.PropertyValue, this.getNodeFormatter(node));
            case ast.FieldValue.$type: return this.formatAssignment(this.getNodeFormatter(node));
            case ast.ArrayValue.$type: return this.formatSquareList(this.getNodeFormatter(node));
            case ast.StructureValue.$type: return this.formatInlineCollection(this.getNodeFormatter(node));
        }
    }

    protected formatAssembly(node: ast.Assembly, formatter: NodeFormatter<ast.Assembly>): void {
        formatter.keyword('assembly').prepend(Formatting.noIndent());
        this.formatSeparatedAngleList(formatter);
        formatter.property(ast.Assembly.name).prepend(Formatting.oneSpace());
        formatter.property(ast.Assembly.name).append(Formatting.newLine({ allowMore: true }));
        formatter.nodes(...node.configurations, ...node.model ? [node.model] : []).prepend(Formatting.noIndent());
    }

    protected formatComponentConfiguration(node: ast.AssemblyComponentConfiguration, formatter: NodeFormatter<ast.AssemblyComponentConfiguration>): void {
        formatter.keyword('configure').append(Formatting.oneSpace());
        this.formatBody(formatter);
    }

    protected formatGlobalEventHandler(node: ast.GlobalEventHandler, formatter: NodeFormatter<ast.GlobalEventHandler>): void {
        formatter.keyword('subscribe').append(Formatting.oneSpace());
        formatter.keyword('->').surround(Formatting.oneSpace());
    }

    protected formatModelInstance(node: ast.ModelInstance, formatter: NodeFormatter<ast.ModelInstance>): void {
        this.formatTypeAnnotation(formatter);
        this.formatBody(formatter);
    }

    protected formatAssemblyInstance(node: ast.AssemblyInstance, formatter: NodeFormatter<ast.AssemblyInstance>): void {
        this.formatTypeAnnotation(formatter);
        this.formatAttachedAngleList(formatter);
        formatter.keywords('using').surround(Formatting.oneSpace());
        formatter.keyword('config').append(Formatting.oneSpace());
        formatter.keyword('link').append(Formatting.oneSpace());
        this.formatBody(formatter);
    }

    protected formatSubInstance(node: ast.SubInstance, formatter: NodeFormatter<ast.SubInstance>): void {
        formatter.keyword('+=').surround(Formatting.oneSpace());
    }

    protected formatOperationCall(node: ast.OperationCall, formatter: NodeFormatter<ast.OperationCall>): void {
        formatter.keyword('call').append(Formatting.oneSpace());
        this.formatRoundList(formatter);
    }

    protected formatPropertyValue(node: ast.PropertyValue, formatter: NodeFormatter<ast.PropertyValue>): void {
        formatter.keyword('property').append(Formatting.oneSpace());
        this.formatAssignment(formatter);
    }
}
