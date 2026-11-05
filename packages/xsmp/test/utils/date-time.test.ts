import { describe, expect, test } from 'vitest';
import { parseDateTime, PTK, serializeDateTime, StringValue } from '@xsmp/core/utils';

describe('SMP DateTime', () => {
    test.each([
        ['2000-01-01T12:00:00Z', 0n],
        ['2024-01-01T00:00:00Z', 757_339_200_000_000_000n],
        ['2000-01-01T13:00:00+01:00', 0n],
        ['2000-01-01T07:00:00-05:00', 0n],
        ['2000-01-01T12:00:00.123456789Z', 123_456_789n],
        ['2000-01-01T12:00:00,123456789Z', 123_456_789n],
        ['2000-01-01T12:00:00.1234567899Z', 123_456_789n],
        ['2000-01-01T11:59:59.999999999Z', -1n],
        ['1969-12-31T23:59:59.999999999Z', -946_728_000_000_000_001n],
    ])('parses %s relative to the SMP epoch', (text, expected) => {
        expect(parseDateTime(text)).toBe(expected);
        expect(new StringValue(text).integralValue(PTK.DateTime)?.getValue()).toBe(expected);
    });

    test.each(['UTC', 'Europe/Paris', 'America/New_York'])('uses UTC for omitted zones with TZ=%s', tz => {
        const previous = process.env.TZ;
        try {
            process.env.TZ = tz;
            expect(new StringValue('2024-01-01T00:00:00').integralValue(PTK.DateTime)?.getValue())
                .toBe(757_339_200_000_000_000n);
            expect(parseDateTime('2024-01-01')).toBe(757_339_200_000_000_000n);
        } finally {
            if (previous === undefined) {
                delete process.env.TZ;
            } else {
                process.env.TZ = previous;
            }
        }
    });

    test.each([
        [0n, '2000-01-01T12:00:00.000000000Z'],
        [1n, '2000-01-01T12:00:00.000000001Z'],
        [-1n, '2000-01-01T11:59:59.999999999Z'],
        [-1_000_000_000n, '2000-01-01T11:59:59.000000000Z'],
        [-946_728_000_000_000_001n, '1969-12-31T23:59:59.999999999Z'],
        [757_339_200_123_456_789n, '2024-01-01T00:00:00.123456789Z'],
    ])('serializes %s nanoseconds without a negative fraction', (value, expected) => {
        expect(serializeDateTime(value)).toBe(expected);
    });

    test.each([-(1n << 63n), (1n << 63n) - 1n])('preserves the signed 64-bit boundary %s', value => {
        const text = serializeDateTime(value);
        expect(new StringValue(text).integralValue(PTK.DateTime)?.getValue()).toBe(value);
    });

    test.each([-(1n << 63n) - 1n, 1n << 63n])('rejects dates outside signed 64-bit range: %s', value => {
        expect(new StringValue(serializeDateTime(value)).integralValue(PTK.DateTime)).toBeUndefined();
    });

    test.each(['not a date', '2024-02-30T00:00:00Z', '2024-13-01T00:00:00Z', '2024-01-01T24:00:00.1Z'])('rejects invalid dates: %s', text => {
        expect(new StringValue(text).integralValue(PTK.DateTime)).toBeUndefined();
    });
});
