import { expect, test } from 'vitest';
import { EmptyFileSystem } from 'langium';
import { createXsmpServices } from '@xsmp/core';

const parser = createXsmpServices(EmptyFileSystem).xsmpcat.parser.LangiumParser;

function parseLiteral(literal: string) {
    return parser.parse(`catalogue Separators namespace digits { class Values { constant Float64 value = ${literal} } }`);
}

test.each([
    "1''2", "12'", "0''7", "07'", "0x1''a", "0x1a'", "0x'a", "0b1''0", "0b10'", "0b'1",
    "1''2s", "12'ns", "01'ms", "1'.0", "1.0'", "1.0''1", "1e1'", "1e1''0", "1'2e'3", "1e'2",
])('rejects misplaced digit separators in %s', literal => {
    const result = parseLiteral(literal);
    expect(result.lexerErrors.length + result.parserErrors.length).toBeGreaterThan(0);
});

test.each([
    '0', '010', "0'7", "1'234", "0x1'aF", "0b1'0", "1'234UL", "0xA'BuL", "07'7L", "1'0ns", "01'0s",
    '1.', '.1', "1'2.", ".1'2", "1'2.3'4", "1e1'0", "1'2.3'4e-1'0f", "1'2E+1'0F", "0.0'1e2",
])('accepts valid digit separators in %s', literal => {
    const result = parseLiteral(literal);
    expect(result.lexerErrors).toEqual([]);
    expect(result.parserErrors).toEqual([]);
});
