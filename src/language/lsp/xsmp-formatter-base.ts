import type { AstNode } from 'langium';
import { AbstractFormatter, Formatting, type NodeFormatter } from 'langium/lsp';
import type * as ast from '../generated/ast-partial.js';

export abstract class XsmpFormatterBase extends AbstractFormatter {
    protected formatTypeAnnotation<T extends AstNode>(formatter: NodeFormatter<T>): void {
        formatter.keyword(':').prepend(Formatting.noSpace()).append(Formatting.oneSpace());
    }

    protected formatTypedAssignment<T extends AstNode>(formatter: NodeFormatter<T>): void {
        this.formatTypeAnnotation(formatter);
        this.formatAssignment(formatter);
    }

    protected formatDirectedLink<T extends AstNode>(formatter: NodeFormatter<T>, kind: 'event' | 'field' | 'interface'): void {
        formatter.keyword(kind).append(Formatting.oneSpace());
        formatter.keyword('link').append(Formatting.oneSpace());
        if (kind === 'interface') {
            formatter.keywords(':').surround(Formatting.noSpace());
        }
        formatter.keyword('->').surround(Formatting.oneSpace());
    }

    protected formatPath(node: ast.Path, formatter: NodeFormatter<ast.Path>): void {
        if (node.unsafe) {
            formatter.keyword('unsafe').append(Formatting.oneSpace());
        }
        if (node.absolute) {
            formatter.keyword('/').append(Formatting.noSpace());
        }
        formatter.keyword('..').surround(Formatting.noSpace());
        formatter.keyword('.').surround(Formatting.noSpace());
        formatter.keyword('[').append(Formatting.noSpace());
        formatter.keyword(']').prepend(Formatting.noSpace());
    }

    protected formatLocalNamedReference(node: ast.LocalNamedReference, formatter: NodeFormatter<ast.LocalNamedReference>): void {
        if (node.unsafe) {
            formatter.keyword('unsafe').append(Formatting.oneSpace());
        }
    }

    protected formatPathMember(_node: ast.PathMember, formatter: NodeFormatter<ast.PathMember>): void {
        formatter.property('separator').surround(Formatting.noSpace());
    }

    protected formatCommaList<T extends AstNode>(formatter: NodeFormatter<T>): void {
        formatter.keywords(',').prepend(Formatting.noSpace()).append(Formatting.oneSpace());
    }

    protected formatBody<T extends AstNode>(formatter: NodeFormatter<T>): void {
        const bracesOpen = formatter.keyword('{');
        const bracesClose = formatter.keyword('}');
        bracesOpen.prepend(Formatting.newLine());
        bracesOpen.append(Formatting.newLine({ allowMore: true }));
        formatter.interior(bracesOpen, bracesClose).prepend(Formatting.indent());
        bracesClose.prepend(Formatting.newLine());
        bracesClose.append(Formatting.newLine({ allowMore: true }));
    }

    protected formatAssignment<T extends AstNode>(formatter: NodeFormatter<T>): void {
        formatter.keyword('=').surround(Formatting.oneSpace());
    }

    protected formatInlineCollection<T extends AstNode>(formatter: NodeFormatter<T>): void {
        formatter.keyword('{').prepend(Formatting.noSpace()).append(Formatting.oneSpace());
        this.formatCommaList(formatter);
        formatter.keyword('}').prepend(Formatting.oneSpace());
    }

    protected formatSquareList<T extends AstNode>(formatter: NodeFormatter<T>): void {
        formatter.keyword('[').append(Formatting.noSpace());
        this.formatCommaList(formatter);
        formatter.keyword(']').prepend(Formatting.noSpace());
    }

    protected formatRoundList<T extends AstNode>(formatter: NodeFormatter<T>): void {
        formatter.keyword('(').append(Formatting.noSpace());
        this.formatCommaList(formatter);
        formatter.keyword(')').prepend(Formatting.noSpace());
    }

    protected formatAttachedAngleList<T extends AstNode>(formatter: NodeFormatter<T>): void {
        formatter.keyword('<').surround(Formatting.noSpace());
        this.formatCommaList(formatter);
        formatter.keyword('>').prepend(Formatting.noSpace());
    }

    protected formatSeparatedAngleList<T extends AstNode>(formatter: NodeFormatter<T>): void {
        formatter.keyword('<').prepend(Formatting.oneSpace()).append(Formatting.noSpace());
        this.formatCommaList(formatter);
        formatter.keyword('>').prepend(Formatting.noSpace());
    }
}
