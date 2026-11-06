import { describe, expect, test } from 'vitest';
import { FloatValue, PTK, StringValue } from '@xsmp/core/utils';

describe('Checked conversions to integral values', () => {
    test.each([
        [PTK.Int8, -129, undefined], [PTK.Int8, -128, -128n],
        [PTK.Int8, 127, 127n], [PTK.Int8, 128, undefined], [PTK.Int8, 256, undefined],
        [PTK.UInt8, -1, undefined], [PTK.UInt8, 0, 0n],
        [PTK.UInt8, 255, 255n], [PTK.UInt8, 256, undefined],
        [PTK.UInt32, 4294967295, 4294967295n], [PTK.UInt32, 4294967296, undefined],
        [PTK.Int64, -(2 ** 63), -9223372036854775808n], [PTK.Int64, 2 ** 63, undefined],
        [PTK.Int32, 1.5, undefined], [PTK.Int32, Number.NaN, undefined],
        [PTK.Int32, Number.POSITIVE_INFINITY, undefined],
    ] as const)('checks Float64 %s <- %s before narrowing', (type, value, expected) => {
        expect(new FloatValue(value, PTK.Float64).integralValue(type)?.getValue()).toBe(expected);
    });

    test.each([
        ['PT9223372036.854775807S', 9223372036854775807n],
        ['PT9223372036.854775808S', undefined],
        ['-PT9223372036.854775808S', -9223372036854775808n],
        ['-PT9223372036.854775809S', undefined],
        ['PT0S', 0n],
        ['-PT0.000000001S', -1n],
    ] as const)('checks Duration %s before narrowing', (value, expected) => {
        expect(new StringValue(value).integralValue(PTK.Duration)?.getValue()).toBe(expected);
    });
});
