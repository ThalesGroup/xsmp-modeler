import { describe, expect, test } from 'vitest';
import * as Duration from '@xsmp/core/utils'


describe('Check durations', () => {

    test('parse duration', async () => {
        expect(Duration.parse('P0D')).toBe(BigInt(0));
        expect(Duration.parse('PT0S')).toBe(BigInt(0));
        expect(Duration.parse('PT+0S')).toBe(BigInt(0));
        expect(Duration.parse('PT-0S')).toBe(BigInt(0));
        expect(Duration.parse('PT0.000000001S')).toBe(BigInt(1));
        expect(Duration.parse('PT0.1S')).toBe(BigInt(100_000_000));
        expect(Duration.parse('PT+0.000000001S')).toBe(BigInt(1));
        expect(Duration.parse('PT-0.000000001S')).toBe(BigInt(-1));
        expect(Duration.parse('PT1S')).toBe(BigInt(1_000_000_000));
        expect(Duration.parse('PT+1S')).toBe(BigInt(1_000_000_000));
        expect(Duration.parse('PT-1S')).toBe(BigInt(-1_000_000_000));
        expect(Duration.parse('-PT1S')).toBe(BigInt(-1_000_000_000));
        expect(Duration.parse('P2DT1M')).toBe(BigInt(172_860_000_000_000));
        expect(Duration.parse('P-2DT-1M-0.000000001S')).toBe(BigInt(-172_860_000_000_001));
        expect(Duration.parse('-P2DT1M0.000000001S')).toBe(BigInt(-172_860_000_000_001));
        expect(()=>Duration.parse('P2')).Throw('Text cannot be parsed to a Duration: P2');
    });

    test('serialize duration', async () => {

        expect(Duration.serialize(BigInt(0))).toBe('PT0S');
        expect(Duration.serialize(BigInt(1))).toBe('PT0.000000001S');
        expect(Duration.serialize(BigInt(100_000_000))).toBe('PT0.1S');
        expect(Duration.serialize(BigInt(-1))).toBe('-PT0.000000001S');
        expect(Duration.serialize(BigInt(1_000_000_000))).toBe('PT1S');
        expect(Duration.serialize(BigInt(-1_000_000_000))).toBe('-PT1S');
        expect(Duration.serialize(BigInt(10_000_000_000))).toBe('PT10S');
        expect(Duration.serialize(BigInt(-10_000_000_000))).toBe('-PT10S');
        expect(Duration.serialize(BigInt(1_000_000_001))).toBe('PT1.000000001S');
        expect(Duration.serialize(BigInt(-1_000_000_001))).toBe('-PT1.000000001S');
        expect(Duration.serialize(BigInt(172_860_000_000_000))).toBe('P2DT1M');
        expect(Duration.serialize(BigInt(-172_860_000_000_001))).toBe('-P2DT1M0.000000001S');
        expect(Duration.serialize(BigInt(1_100_000_000))).toBe('PT1.1S');
    });

    test.each([
        [0n, 'PT0S'],
        [1n, 'PT0.000000001S'],
        [-1n, '-PT0.000000001S'],
        [60_000_000_000n, 'PT1M'],
        [-3_600_000_000_000n, '-PT1H'],
        [86_400_000_000_000n, 'P1D'],
        [-86_400_000_000_000n, '-P1D'],
        [172_860_000_000_001n, 'P2DT1M0.000000001S'],
        [9_223_372_036_854_775_807n, 'P106751DT23H47M16.854775807S'],
        [-9_223_372_036_854_775_808n, '-P106751DT23H47M16.854775808S'],
    ])('round-trips %s nanoseconds with canonical spelling', (value, text) => {
        expect(Duration.serialize(value)).toBe(text);
        expect(Duration.parse(text)).toBe(value);
        expect(Duration.parse(Duration.serialize(value))).toBe(value);
    });

    test.each([
        'garbagePT1Strailing', 'PT1Strailing', ' PT1S', 'PT1S\n',
        'P', 'PT', 'P1DT', 'P1Dt', 'PT1.S', 'PT1.1234567890S', 'PT1S1S',
    ])('rejects an incomplete or partially matched duration: %j', text => {
        expect(() => Duration.parse(text)).toThrow('Text cannot be parsed to a Duration');
    });

    test('parses integer components without losing precision', () => {
        expect(Duration.parse('P9007199254740993D')).toBe(9007199254740993n * 86_400_000_000_000n);
    });
});
