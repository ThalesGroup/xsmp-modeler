import { describe, expect, test } from 'vitest';
import * as Duration from 'xsmp/utils'


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
        expect(Duration.serialize(BigInt(-1))).toBe('PT-0.000000001S');
        expect(Duration.serialize(BigInt(1_000_000_000))).toBe('PT1S');
        expect(Duration.serialize(BigInt(-1_000_000_000))).toBe('PT-1S');
        expect(Duration.serialize(BigInt(10_000_000_000))).toBe('PT10S');
        expect(Duration.serialize(BigInt(-10_000_000_000))).toBe('PT-10S');
        expect(Duration.serialize(BigInt(1_000_000_001))).toBe('PT1.000000001S');
        expect(Duration.serialize(BigInt(-1_000_000_001))).toBe('PT-1.000000001S');
        expect(Duration.serialize(BigInt(172_860_000_000_000))).toBe('P2DT1M');
        expect(Duration.serialize(BigInt(-172_860_000_000_001))).toBe('P-2DT-1M-0.000000001S');
        expect(Duration.serialize(BigInt(1_100_000_000))).toBe('PT1.1S');
    });
});