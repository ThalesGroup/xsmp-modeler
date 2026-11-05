// SMP DateTime is a signed number of nanoseconds since 2000-01-01T12:00:00Z.
const SMP_EPOCH_NANOSECONDS = 946_728_000_000_000_000n;
const NANOS_PER_SECOND = 1_000_000_000n;

/** Parse an ISO date/time, interpreting an omitted time zone as UTC. */
export function parseDateTime(text: string): bigint | undefined {
    const match = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}:\d{2})(?:[.,](\d+))?)?(Z|[+-]\d{2}:\d{2})?$/i.exec(text);
    if (!match) {
        return undefined;
    }
    const [, date, time = '00:00:00', fraction = '', zone = 'Z'] = match;
    if (time.startsWith('24:') && /[1-9]/.test(fraction)) {
        return undefined;
    }
    // Date.parse normalizes some invalid calendar dates, such as February 30.
    const day = Date.parse(`${date}T00:00:00Z`);
    if (Number.isNaN(day) || new Date(day).toISOString().slice(0, 10) !== date) {
        return undefined;
    }
    // Parse whole seconds only: Date cannot preserve sub-millisecond precision.
    const instant = Date.parse(`${date}T${time}${zone}`);
    if (Number.isNaN(instant)) {
        return undefined;
    }
    const nanos = BigInt(fraction.padEnd(9, '0').slice(0, 9));
    return BigInt(instant) * 1_000_000n + nanos - SMP_EPOCH_NANOSECONDS;
}

/** Serialize SMP nanoseconds as an ISO date/time with nanosecond precision. */
export function serializeDateTime(value: bigint): string {
    const unixNanos = value + SMP_EPOCH_NANOSECONDS;
    let seconds = unixNanos / NANOS_PER_SECOND;
    let fraction = unixNanos % NANOS_PER_SECOND;
    // BigInt division truncates toward zero. ISO fractions must be non-negative.
    if (fraction < 0n) {
        seconds -= 1n;
        fraction += NANOS_PER_SECOND;
    }
    return new Date(Number(seconds) * 1_000).toISOString()
        .replace('.000Z', `.${fraction.toString().padStart(9, '0')}Z`);
}
