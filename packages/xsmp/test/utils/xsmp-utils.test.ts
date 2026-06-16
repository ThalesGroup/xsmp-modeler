import { describe, expect, test } from 'vitest';
import { escape } from '@xsmp/core/utils';
import { XsmpValueConverter } from '../../src/parser/value-converter.js';

describe('escape()', () => {
    // escape() encodes a raw string into the body of a String8/Char8 literal.
    // XsmpValueConverter.convertString() is the parser-side inverse, so the
    // round-trip must be lossless for any input — otherwise valid models are
    // silently corrupted (and a trailing backslash escapes the closing quote,
    // producing uncompilable C++).
    const converter = new XsmpValueConverter();
    const roundTrip = (raw: string): string => converter.convertString(`"${escape(raw)}"`);

    test.each([
        ['plain text'],
        ['with "double" quotes'],
        ["with 'single' quotes"],
        ['control chars\t\n\r\f\b'],
        ['a single backslash: \\'],
        ['windows path C:\\Users\\model'],
        ['trailing backslash\\'],
        ['mixed \\ and " and \t'],
    ])('round-trips %j without loss', (raw) => {
        expect(roundTrip(raw)).toBe(raw);
    });
});
