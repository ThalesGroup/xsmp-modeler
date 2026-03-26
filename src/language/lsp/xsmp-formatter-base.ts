import type { AstNode } from 'langium';
import { AbstractFormatter, Formatting, type NodeFormatter } from 'langium/lsp';

export abstract class XsmpFormatterBase extends AbstractFormatter {
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
