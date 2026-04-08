import type { AstNode } from 'langium';
import { Formatting, type NodeFormatter } from 'langium/lsp';
import * as ast from '../generated/ast-partial.js';
import { XsmpFormatterBase } from './xsmp-formatter-base.js';

export class XsmpcfgFormatter extends XsmpFormatterBase {
    protected override format(node: AstNode): void {
        switch (node.$type) {
            case ast.Path.$type: return this.formatPath(node as ast.Path, this.getNodeFormatter(node));
            case ast.PathMember.$type: return this.formatPathMember(node as ast.PathMember, this.getNodeFormatter(node));
            case ast.ConcretePathNamedSegment.$type: return this.formatLocalNamedReference(node as ast.ConcretePathNamedSegment, this.getNodeFormatter(node));
            case ast.CfgStructureFieldValue.$type: return this.formatCfgStructureFieldValue(node as ast.CfgStructureFieldValue, this.getNodeFormatter(node));
            case ast.Configuration.$type: return this.formatConfiguration(node as ast.Configuration, this.getNodeFormatter(node));
            case ast.ComponentConfiguration.$type: return this.formatComponentConfiguration(node as ast.ComponentConfiguration, this.getNodeFormatter(node));
            case ast.ConfigurationUsage.$type: return this.formatConfigurationUsage(node as ast.ConfigurationUsage, this.getNodeFormatter(node));
            case ast.FieldValue.$type: return this.formatAssignment(this.getNodeFormatter(node));
            case ast.ArrayValue.$type: return this.formatArrayValue(node as ast.ArrayValue, this.getNodeFormatter(node));
            case ast.StructureValue.$type: return this.formatInlineCollection(this.getNodeFormatter(node));
        }
    }

    protected formatConfiguration(node: ast.Configuration, formatter: NodeFormatter<ast.Configuration>): void {
        formatter.keyword('configuration').prepend(Formatting.noIndent()).append(Formatting.oneSpace());
        formatter.property(ast.Configuration.name).append(Formatting.newLine({ allowMore: true }));
    }

    protected formatComponentConfiguration(node: ast.ComponentConfiguration, formatter: NodeFormatter<ast.ComponentConfiguration>): void {
        if (ast.isConfiguration(node.$container)) {
            formatter.property(ast.ComponentConfiguration.name).prepend(Formatting.newLine({ allowMore: true }));
        }
        formatter.keyword(':').prepend(Formatting.noSpace()).append(Formatting.oneSpace());
        formatter.nodes(...node.elements).prepend(Formatting.newLine({ allowMore: true }));
        this.formatBody(formatter);
    }

    protected formatConfigurationUsage(node: ast.ConfigurationUsage, formatter: NodeFormatter<ast.ConfigurationUsage>): void {
        formatter.keyword('include').append(Formatting.oneSpace());
        formatter.keyword('at').surround(Formatting.oneSpace());
    }

    protected formatCfgStructureFieldValue(_node: ast.CfgStructureFieldValue, formatter: NodeFormatter<ast.CfgStructureFieldValue>): void {
        this.formatAssignment(formatter);
    }

    protected formatArrayValue(node: ast.ArrayValue, formatter: NodeFormatter<ast.ArrayValue>): void {
        this.formatSquareList(formatter);
        if (node.startIndex !== undefined) {
            formatter.keyword(':').prepend(Formatting.noSpace()).append(node.elements.length > 0 ? Formatting.oneSpace() : Formatting.noSpace());
        }
    }
}
