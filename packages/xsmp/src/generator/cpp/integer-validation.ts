import { type ValidationAcceptor, type ValidationChecks } from 'langium';
import type * as ast from '../../generated/ast.js';
import type { XsmpcatServices } from '../../xsmpcat-module.js';
import { getPTK } from '../../utils/xsmp-utils.js';
import { getValueAs } from '../../utils/solver.js';
import { PTK } from '../../utils/primitive-type-kind.js';

export function getCppIntegerBoundsIssue(type: ast.Integer): string | undefined {
    if (getPTK(type) !== PTK.UInt64) return undefined;
    const maximum = type.maximum ? getValueAs(type.maximum, PTK.UInt64)?.getValue() : (1n << 64n) - 1n;
    const minimum = type.minimum ? getValueAs(type.minimum, PTK.UInt64)?.getValue() : 0n;
    const limit = (1n << 63n) - 1n;
    if ((typeof minimum === 'bigint' && minimum > limit) || (typeof maximum === 'bigint' && maximum > limit)) {
        return 'SMP C++ type registration uses signed Int64 bounds and cannot represent this UInt64 range. Specify bounds no greater than 9223372036854775807, or use Smp.UInt64 directly for its full range.';
    }
    return undefined;
}

export function registerCppIntegerValidationChecks(services: XsmpcatServices, category: string): void {
    const checks: ValidationChecks<ast.XsmpAstType> = {
        Integer: (type: ast.Integer, accept: ValidationAcceptor) => {
            const issue = getCppIntegerBoundsIssue(type);
            if (issue) accept('error', issue, { node: type, property: type.maximum ? 'maximum' : 'name' });
        },
    };
    services.validation.ValidationRegistry.register(checks, undefined, category);
}
