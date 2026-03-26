import type { AstNode } from 'langium';
import { Formatting, type NodeFormatter } from 'langium/lsp';
import * as ast from '../generated/ast.js';
import { XsmpFormatterBase } from './xsmp-formatter-base.js';

export class XsmplnkFormatter extends XsmpFormatterBase {
    protected override format(node: AstNode): void {
        switch (node.$type) {
            case ast.LinkBase: return this.formatLinkBase(node as ast.LinkBase, this.getNodeFormatter(node));
            case ast.ComponentLinkBase: return this.formatComponentLinkBase(node as ast.ComponentLinkBase, this.getNodeFormatter(node));
            case ast.EventLink: return this.formatEventLink(node as ast.EventLink, this.getNodeFormatter(node));
            case ast.FieldLink: return this.formatFieldLink(node as ast.FieldLink, this.getNodeFormatter(node));
            case ast.InterfaceLink: return this.formatInterfaceLink(node as ast.InterfaceLink, this.getNodeFormatter(node));
        }
    }

    protected formatLinkBase(node: ast.LinkBase, formatter: NodeFormatter<ast.LinkBase>): void {
        formatter.keyword('link').prepend(Formatting.noIndent()).append(Formatting.oneSpace());
        formatter.property('name').append(Formatting.newLine({ allowMore: true }));
        formatter.nodes(...node.elements).prepend(Formatting.noIndent());
    }

    protected formatComponentLinkBase(node: ast.ComponentLinkBase, formatter: NodeFormatter<ast.ComponentLinkBase>): void {
        this.formatBody(formatter);
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
}
