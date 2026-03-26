import type { AstNode } from 'langium';
import { Formatting, type NodeFormatter } from 'langium/lsp';
import * as ast from '../generated/ast.js';
import { XsmpFormatterBase } from './xsmp-formatter-base.js';

export class XsmpcfgFormatter extends XsmpFormatterBase {
    protected override format(node: AstNode): void {
        switch (node.$type) {
            case ast.Path: return this.formatPath(node as ast.Path, this.getNodeFormatter(node));
            case ast.PathMember: return this.formatPathMember(node as ast.PathMember, this.getNodeFormatter(node));
            case ast.CfgStructureFieldValue: return this.formatCfgStructureFieldValue(node as ast.CfgStructureFieldValue, this.getNodeFormatter(node));
            case ast.Configuration: return this.formatConfiguration(node as ast.Configuration, this.getNodeFormatter(node));
            case ast.ComponentConfiguration: return this.formatComponentConfiguration(node as ast.ComponentConfiguration, this.getNodeFormatter(node));
            case ast.ConfigurationUsage: return this.formatConfigurationUsage(node as ast.ConfigurationUsage, this.getNodeFormatter(node));
            case ast.FieldValue: return this.formatAssignment(this.getNodeFormatter(node));
            case ast.ArrayValue: return this.formatSquareList(this.getNodeFormatter(node));
            case ast.StructureValue: return this.formatInlineCollection(this.getNodeFormatter(node));
        }
    }

    protected formatConfiguration(node: ast.Configuration, formatter: NodeFormatter<ast.Configuration>): void {
        formatter.keyword('configuration').prepend(Formatting.noIndent()).append(Formatting.oneSpace());
        formatter.property('name').append(Formatting.newLine({ allowMore: true }));
    }

    protected formatComponentConfiguration(node: ast.ComponentConfiguration, formatter: NodeFormatter<ast.ComponentConfiguration>): void {
        if (ast.isConfiguration(node.$container)) {
            formatter.property('name').prepend(Formatting.newLine({ allowMore: true }));
        }
        formatter.keyword(':').prepend(Formatting.noSpace()).append(Formatting.oneSpace());
        formatter.nodes(...node.elements).prepend(Formatting.newLine({ allowMore: true }));
        this.formatBody(formatter);
    }

    protected formatConfigurationUsage(node: ast.ConfigurationUsage, formatter: NodeFormatter<ast.ConfigurationUsage>): void {
        formatter.keyword('include').append(Formatting.oneSpace());
        formatter.keyword('at').surround(Formatting.oneSpace());
    }

    protected formatCfgStructureFieldValue(node: ast.CfgStructureFieldValue, formatter: NodeFormatter<ast.CfgStructureFieldValue>): void {
        if (node.unsafe) {
            formatter.keyword('unsafe').append(Formatting.oneSpace());
        }
        this.formatAssignment(formatter);
    }
}
