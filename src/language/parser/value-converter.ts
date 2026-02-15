import type { CstNode, GrammarAST, ValueType } from 'langium';
import { DefaultValueConverter } from 'langium';

export class XsmpValueConverter extends DefaultValueConverter {
    protected override runConverter(rule: GrammarAST.AbstractRule, input: string, cstNode: CstNode): ValueType {

        switch (rule.name) {
            case 'STRING':
            case 'CHAR':
                return this.convertString(input);
            case 'INTEGER_LITERAL':
                return this.convertInteger(input);
            default:
                return super.runConverter(rule, input, cstNode);
        }
    }

    private static readonly NS = BigInt(1);
    private static readonly US = BigInt(1_000);
    private static readonly MS = XsmpValueConverter.US * BigInt(1_000);
    private static readonly S = XsmpValueConverter.MS * BigInt(1_000);
    private static readonly MN = XsmpValueConverter.S * BigInt(60);
    private static readonly HOUR = XsmpValueConverter.MN * BigInt(60);
    private static readonly DAY = XsmpValueConverter.HOUR * BigInt(24);

    convertInteger(input: string): string {
        const length = input.length;
        if (length === 0) {
            return input;
        }
        switch (input.charAt(length - 1)) {
            case 's': {
                switch (input.charAt(length - 2)) {
                    case 'n': // ns
                        return this.convertTimeSuffix(input.substring(0, length - 2), XsmpValueConverter.NS);
                    case 'u': // us
                        return this.convertTimeSuffix(input.substring(0, length - 2), XsmpValueConverter.US);
                    case 'm': // ms
                        return this.convertTimeSuffix(input.substring(0, length - 2), XsmpValueConverter.MS);
                    default: // s
                        return this.convertTimeSuffix(input.substring(0, length - 1), XsmpValueConverter.S);
                }
            }
            case 'n': // mn
                return this.convertTimeSuffix(input.substring(0, length - 2), XsmpValueConverter.MN);
            case 'h': // h
                return this.convertTimeSuffix(input.substring(0, length - 1), XsmpValueConverter.HOUR);
            case 'd': { // d
                const secondChar = input.charAt(1);
                if (secondChar === 'x' || secondChar === 'X') { // an hexa literal can end with 'd'
                    return input;
                }
                return this.convertTimeSuffix(input.substring(0, length - 1), XsmpValueConverter.DAY);
            }
            default:
                return input;
        }
    }
    convertTimeSuffix(value: string, multiplicator: bigint): string {
        value = (BigInt(value.replaceAll("'", '')) * multiplicator).toString();
        let result = '';
        let count = 0;
        for (let i = value.length - 1; i >= 0; i--) {
            result = value[i] + result;
            count++;
            if (count % 3 === 0 && i !== 0) {
                result = "'" + result;
            }
        }
        return result + 'L';
    }

    convertString(str: string): string {
        const escapeMap: Record<string, string> = {
            'a': '\x07',
            'b': '\x08',
            'f': '\x0c',
            'n': '\n',
            'r': '\r',
            't': '\t',
            'v': '\x0b',
            '\\': '\\',
            '"': '"',
            '\'': '\'',
            '?': '\x3f'
        };

        let i = 1,
            result = '';

        while (i < str.length - 1) {
            let ch = str[i++];

            if (ch === '\\') {
                ch = str[i++];

                if (escapeMap[ch]) {
                    result += escapeMap[ch];
                } else if (ch === 'u' || ch === 'U') {
                    const hexLength = ch === 'u' ? 4 : 8,
                        hexCode = str.slice(i, i + hexLength);
                    result += String.fromCodePoint(Number.parseInt(hexCode, 16));
                    i += hexLength;
                } else if (ch === 'x') {
                    const hexCode = str.slice(i, i + 2);
                    result += String.fromCodePoint(Number.parseInt(hexCode, 16));
                    i += 2;
                } else if (ch >= '0' && ch <= '7') {

                    let octalCode = ch;
                    ch = str[i];
                    if (ch >= '0' && ch <= '7') {
                        octalCode += ch;
                        i++;
                    }
                    ch = str[i];
                    if (ch >= '0' && ch <= '7') {
                        octalCode += ch;
                        i++;
                    }
                    result += String.fromCodePoint(Number.parseInt(octalCode, 8));
                } else {
                    result += ch;
                }
            } else {
                result += ch;
            }
        }

        return result;
    }

}