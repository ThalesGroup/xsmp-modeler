import type { AstNode } from 'langium';
import { Formatting, type NodeFormatter } from 'langium/lsp';
import * as ast from '../generated/ast.js';
import { XsmpFormatterBase } from './xsmp-formatter-base.js';

export class XsmpasbFormatter extends XsmpFormatterBase {
    protected override format(node: AstNode): void {
        switch (node.$type) {
            case ast.Assembly: return this.formatAssembly(node as ast.Assembly, this.getNodeFormatter(node));
            case ast.AssemblyComponentConfiguration: return this.formatComponentConfiguration(node as ast.AssemblyComponentConfiguration, this.getNodeFormatter(node));
            case ast.GlobalEventHandler: return this.formatGlobalEventHandler(node as ast.GlobalEventHandler, this.getNodeFormatter(node));
            case ast.StringParameter: return this.formatStringParameter(node as ast.StringParameter, this.getNodeFormatter(node));
            case ast.Int32Parameter: return this.formatInt32Parameter(node as ast.Int32Parameter, this.getNodeFormatter(node));
            case ast.StringArgument: return this.formatTemplateArgument(node as ast.StringArgument, this.getNodeFormatter(node));
            case ast.Int32Argument: return this.formatTemplateArgument(node as ast.Int32Argument, this.getNodeFormatter(node));
            case ast.ModelInstance: return this.formatModelInstance(node as ast.ModelInstance, this.getNodeFormatter(node));
            case ast.AssemblyInstance: return this.formatAssemblyInstance(node as ast.AssemblyInstance, this.getNodeFormatter(node));
            case ast.SubInstance: return this.formatSubInstance(node as ast.SubInstance, this.getNodeFormatter(node));
            case ast.EventLink: return this.formatEventLink(node as ast.EventLink, this.getNodeFormatter(node));
            case ast.FieldLink: return this.formatFieldLink(node as ast.FieldLink, this.getNodeFormatter(node));
            case ast.InterfaceLink: return this.formatInterfaceLink(node as ast.InterfaceLink, this.getNodeFormatter(node));
            case ast.OperationCall: return this.formatOperationCall(node as ast.OperationCall, this.getNodeFormatter(node));
            case ast.ParameterValue: return this.formatParameterValue(node as ast.ParameterValue, this.getNodeFormatter(node));
            case ast.PropertyValue: return this.formatPropertyValue(node as ast.PropertyValue, this.getNodeFormatter(node));
            case ast.FieldValue: return this.formatFieldValue(node as ast.FieldValue, this.getNodeFormatter(node));
            case ast.ArrayValue: return this.formatArrayValue(node as ast.ArrayValue, this.getNodeFormatter(node));
            case ast.StructureValue: return this.formatStructureValue(node as ast.StructureValue, this.getNodeFormatter(node));
        }
    }

    protected formatAssembly(node: ast.Assembly, formatter: NodeFormatter<ast.Assembly>): void {
        formatter.keyword('assembly').prepend(Formatting.noIndent());
        this.formatSeparatedAngleList(formatter);
        formatter.property('name').prepend(Formatting.oneSpace());
        formatter.property('name').append(Formatting.newLine({ allowMore: true }));
        formatter.nodes(...node.configurations, node.model).prepend(Formatting.noIndent());
    }

    protected formatComponentConfiguration(node: ast.AssemblyComponentConfiguration, formatter: NodeFormatter<ast.AssemblyComponentConfiguration>): void {
        formatter.keyword('configure').append(Formatting.oneSpace());
        this.formatBody(formatter);
    }

    protected formatGlobalEventHandler(node: ast.GlobalEventHandler, formatter: NodeFormatter<ast.GlobalEventHandler>): void {
        formatter.keyword('subscribe').append(Formatting.oneSpace());
        formatter.keyword('->').surround(Formatting.oneSpace());
    }

    protected formatStringParameter(node: ast.StringParameter, formatter: NodeFormatter<ast.StringParameter>): void {
        formatter.keyword(':').prepend(Formatting.noSpace()).append(Formatting.oneSpace());
        this.formatAssignment(formatter);
    }

    protected formatInt32Parameter(node: ast.Int32Parameter, formatter: NodeFormatter<ast.Int32Parameter>): void {
        formatter.keyword(':').prepend(Formatting.noSpace()).append(Formatting.oneSpace());
        this.formatAssignment(formatter);
    }

    protected formatTemplateArgument(node: ast.StringArgument | ast.Int32Argument, formatter: NodeFormatter<ast.StringArgument | ast.Int32Argument>): void {
        this.formatAssignment(formatter);
    }

    protected formatModelInstance(node: ast.ModelInstance, formatter: NodeFormatter<ast.ModelInstance>): void {
        formatter.keyword(':').prepend(Formatting.noSpace()).append(Formatting.oneSpace());
        this.formatBody(formatter);
    }

    protected formatAssemblyInstance(node: ast.AssemblyInstance, formatter: NodeFormatter<ast.AssemblyInstance>): void {
        formatter.keyword(':').prepend(Formatting.noSpace()).append(Formatting.oneSpace());
        this.formatAttachedAngleList(formatter);
        formatter.keywords('using').surround(Formatting.oneSpace());
        formatter.keyword('config').append(Formatting.oneSpace());
        formatter.keyword('link').append(Formatting.oneSpace());
        this.formatBody(formatter);
    }

    protected formatSubInstance(node: ast.SubInstance, formatter: NodeFormatter<ast.SubInstance>): void {
        formatter.keyword('+=').surround(Formatting.oneSpace());
    }

    protected formatEventLink(node: ast.EventLink, formatter: NodeFormatter<ast.EventLink>): void {
        formatter.keyword('event').append(Formatting.oneSpace());
        formatter.keyword('link').append(Formatting.oneSpace());
        formatter.keyword('->').surround(Formatting.oneSpace());
    }

    protected formatFieldLink(node: ast.FieldLink, formatter: NodeFormatter<ast.FieldLink>): void {
        formatter.keyword('field').append(Formatting.oneSpace());
        formatter.keyword('link').append(Formatting.oneSpace());
        formatter.keyword('->').surround(Formatting.oneSpace());
    }

    protected formatInterfaceLink(node: ast.InterfaceLink, formatter: NodeFormatter<ast.InterfaceLink>): void {
        formatter.keyword('interface').append(Formatting.oneSpace());
        formatter.keyword('link').append(Formatting.oneSpace());
        formatter.keywords(':').prepend(Formatting.noSpace()).append(Formatting.oneSpace());
        formatter.keyword('->').surround(Formatting.oneSpace());
    }

    protected formatOperationCall(node: ast.OperationCall, formatter: NodeFormatter<ast.OperationCall>): void {
        formatter.keyword('call').append(Formatting.oneSpace());
        this.formatRoundList(formatter);
    }

    protected formatParameterValue(node: ast.ParameterValue, formatter: NodeFormatter<ast.ParameterValue>): void {
        this.formatAssignment(formatter);
    }

    protected formatPropertyValue(node: ast.PropertyValue, formatter: NodeFormatter<ast.PropertyValue>): void {
        formatter.keyword('property').append(Formatting.oneSpace());
        this.formatAssignment(formatter);
    }

    protected formatFieldValue(node: ast.FieldValue, formatter: NodeFormatter<ast.FieldValue>): void {
        this.formatAssignment(formatter);
    }

    protected formatArrayValue(node: ast.ArrayValue, formatter: NodeFormatter<ast.ArrayValue>): void {
        this.formatSquareList(formatter);
    }

    protected formatStructureValue(node: ast.StructureValue, formatter: NodeFormatter<ast.StructureValue>): void {
        this.formatInlineCollection(formatter);
    }
}
