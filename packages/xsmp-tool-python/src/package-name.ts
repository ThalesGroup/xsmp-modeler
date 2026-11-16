/** Keep the generated root package from shadowing its runtime dependencies. */
export function toPythonPackageName(identifier: string): string {
    // Valid XSMP names start with a letter, so this prefix cannot collide.
    return identifier === 'ecss_smp' || identifier === 'xsmp' ? `_${identifier}` : identifier;
}
