const pythonKeywords = new Set([
    'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
    'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
    'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
    'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
]);

export function toPythonIdentifier(name: string): string {
    // Valid XSMP names start with a letter, so this prefix cannot collide
    // with another catalogue, namespace or component name.
    return pythonKeywords.has(name) ? `_${name}` : name;
}
