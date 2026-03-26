import type { AstNode } from 'langium';
import { Formatting, type NodeFormatter } from 'langium/lsp';
import * as ast from '../generated/ast.js';
import { XsmpFormatterBase } from './xsmp-formatter-base.js';

export class XsmpcfgFormatter extends XsmpFormatterBase {
    protected override format(node: AstNode): void {
        switch (node.$type) {
            case ast.Configuration: return this.formatConfiguration(node as ast.Configuration, this.getNodeFormatter(node));
            case ast.ComponentConfiguration: return this.formatComponentConfiguration(node as ast.ComponentConfiguration, this.getNodeFormatter(node));
            case ast.ConfigurationUsage: return this.formatConfigurationUsage(node as ast.ConfigurationUsage, this.getNodeFormatter(node));
            case ast.FieldValue: return this.formatFieldValue(node as ast.FieldValue, this.getNodeFormatter(node));
            case ast.ArrayValue: return this.formatArrayValue(node as ast.ArrayValue, this.getNodeFormatter(node));
            case ast.StructureValue: return this.formatStructureValue(node as ast.StructureValue, this.getNodeFormatter(node));
        }
    }

    protected formatConfiguration(node: ast.Configuration, formatter: NodeFormatter<ast.Configuration>): void {
        formatter.keyword('configuration').prepend(Formatting.noIndent()).append(Formatting.oneSpace());
        formatter.property('name').append(Formatting.newLine({ allowMore: true }));
        formatter.nodes(...node.elements).prepend(Formatting.noIndent());
    }

    protected formatComponentConfiguration(node: ast.ComponentConfiguration, formatter: NodeFormatter<ast.ComponentConfiguration>): void {
        formatter.keyword(':').prepend(Formatting.noSpace()).append(Formatting.oneSpace());
        this.formatBody(formatter);
    }

    protected formatConfigurationUsage(node: ast.ConfigurationUsage, formatter: NodeFormatter<ast.ConfigurationUsage>): void {
        formatter.keyword('include').append(Formatting.oneSpace());
        formatter.keyword('at').surround(Formatting.oneSpace());
        formatter.keyword('unsafe').append(Formatting.oneSpace());
    }

    protected formatFieldValue(node: ast.FieldValue, formatter: NodeFormatter<ast.FieldValue>): void {
        formatter.keyword('unsafe').append(Formatting.oneSpace());
        this.formatAssignment(formatter);
    }

    protected formatArrayValue(node: ast.ArrayValue, formatter: NodeFormatter<ast.ArrayValue>): void {
        this.formatSquareList(formatter);
    }

    protected formatStructureValue(node: ast.StructureValue, formatter: NodeFormatter<ast.StructureValue>): void {
        this.formatInlineCollection(formatter);
    }
}
