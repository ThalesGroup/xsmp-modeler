import type { AstNode } from 'langium';
import { Formatting, type NodeFormatter } from 'langium/lsp';
import * as ast from '../generated/ast.js';
import { XsmpFormatterBase } from './xsmp-formatter-base.js';

export class XsmplnkFormatter extends XsmpFormatterBase {
    protected override format(node: AstNode): void {
        switch (node.$type) {
            case ast.LocalNamedReference: return this.formatLocalNamedReference(node as ast.LocalNamedReference, this.getNodeFormatter(node));
            case ast.Path: return this.formatPath(node as ast.Path, this.getNodeFormatter(node));
            case ast.PathMember: return this.formatPathMember(node as ast.PathMember, this.getNodeFormatter(node));
            case ast.LinkBase: return this.formatLinkBase(node as ast.LinkBase, this.getNodeFormatter(node));
            case ast.ComponentLinkBase: return this.formatComponentLinkBase(node as ast.ComponentLinkBase, this.getNodeFormatter(node));
            case ast.EventLink: return this.formatDirectedLink(this.getNodeFormatter(node), 'event');
            case ast.FieldLink: return this.formatDirectedLink(this.getNodeFormatter(node), 'field');
            case ast.InterfaceLink: return this.formatDirectedLink(this.getNodeFormatter(node), 'interface');
        }
    }

    protected formatLinkBase(node: ast.LinkBase, formatter: NodeFormatter<ast.LinkBase>): void {
        formatter.keyword('link').prepend(Formatting.noIndent()).append(Formatting.oneSpace());
        formatter.property('name').append(Formatting.newLine({ allowMore: true }));
        formatter.keyword('for').surround(Formatting.oneSpace());
        formatter.nodes(...node.elements).prepend(Formatting.noIndent());
    }

    protected formatComponentLinkBase(node: ast.ComponentLinkBase, formatter: NodeFormatter<ast.ComponentLinkBase>): void {
        this.formatBody(formatter);
    }
}
