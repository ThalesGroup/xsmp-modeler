import type { AstNode } from 'langium';
import { AbstractFormatter, Formatting, type NodeFormatter } from 'langium/lsp';
import * as ast from '../generated/ast-partial.js';

export class XsmpprojectFormatter extends AbstractFormatter {
    protected override format(node: AstNode): void {
        switch (node.$type) {
            case ast.Project: return this.formatProject(node as ast.Project, this.getNodeFormatter(node));
            case ast.Dependency: return this.formatDependency(node as ast.Dependency, this.getNodeFormatter(node));
            case ast.ProfileReference: return this.formatProfileReference(node as ast.ProfileReference, this.getNodeFormatter(node));
            case ast.ToolReference: return this.formatToolReference(node as ast.ToolReference, this.getNodeFormatter(node));
            case ast.Source: return this.formatSource(node as ast.Source, this.getNodeFormatter(node));
        }
    }
    formatProject(node: ast.Project, formatter: NodeFormatter<ast.Project>) {
        formatter.keyword('project').prepend(Formatting.newLine({ allowMore: true })).append(Formatting.oneSpace());
    }
    formatDependency(node: ast.Dependency, formatter: NodeFormatter<ast.Dependency>) {
        formatter.keyword('dependency').prepend(Formatting.newLine({ allowMore: true })).append(Formatting.oneSpace());
    }
    formatProfileReference(node: ast.ProfileReference, formatter: NodeFormatter<ast.ProfileReference>) {
        formatter.keyword('profile').prepend(Formatting.newLine({ allowMore: true })).append(Formatting.oneSpace());
    }
    formatToolReference(node: ast.ToolReference, formatter: NodeFormatter<ast.ToolReference>) {
        formatter.keyword('tool').prepend(Formatting.newLine({ allowMore: true })).append(Formatting.oneSpace());
    }
    formatSource(node: ast.Source, formatter: NodeFormatter<ast.Source>) {
        formatter.keyword('source').prepend(Formatting.newLine({ allowMore: true })).append(Formatting.oneSpace());
    }
}