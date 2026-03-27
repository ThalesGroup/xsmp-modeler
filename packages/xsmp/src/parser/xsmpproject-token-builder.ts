import { type TokenType } from 'chevrotain';
import { DefaultTokenBuilder, type GrammarAST, type Stream } from 'langium';

export class XsmpprojectTokenBuilder extends DefaultTokenBuilder {
    protected override buildTerminalTokens(rules: Stream<GrammarAST.AbstractRule>): TokenType[] {
        return [...super.buildTerminalTokens(rules), this.buildIdToken()];
    }

    protected buildIdToken(): TokenType {
        const tokenType: TokenType = {
            name: 'partial_keyword',
            PATTERN: /[_a-zA-Z]\w*/,
            LINE_BREAKS: true
        };
        return tokenType;
    }
}