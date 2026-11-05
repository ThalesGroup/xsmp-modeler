import type * as ast from '../generated/ast-partial.js';
import { getPTK } from './xsmp-utils.js';
import { getValueAs } from './solver.js';
import { PTK } from './primitive-type-kind.js';

export function getIntegerRegistrationBoundsIssue(type: ast.Integer): string | undefined {
    if (getPTK(type) !== PTK.UInt64) return undefined;
    const maximum = type.maximum ? getValueAs(type.maximum, PTK.UInt64)?.getValue() : (1n << 64n) - 1n;
    const minimum = type.minimum ? getValueAs(type.minimum, PTK.UInt64)?.getValue() : 0n;
    const limit = (1n << 63n) - 1n;
    if ((typeof minimum === 'bigint' && minimum > limit) || (typeof maximum === 'bigint' && maximum > limit)) {
        return 'SMP C++ type registration uses signed Int64 bounds and cannot represent this UInt64 range. Specify bounds no greater than 9223372036854775807, or use Smp.UInt64 directly for its full range.';
    }
    return undefined;
}
