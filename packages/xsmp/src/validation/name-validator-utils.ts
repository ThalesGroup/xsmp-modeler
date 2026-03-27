import type { AstNode, Properties, ValidationAcceptor } from 'langium';

export const nameRegex = /^[a-zA-Z]\w*$/;

export const cppReservedNames = new Set([
    'alignas', 'alignof', 'and', 'and_eq', 'asm', 'auto', 'bitand', 'bitor', 'bool', 'break',
    'case', 'catch', 'char', 'char8_t', 'char16_t', 'char32_t', 'class', 'compl', 'concept',
    'const', 'consteval', 'constexpr', 'constinit', 'const_cast', 'continue', 'co_await',
    'co_return', 'co_yield', 'decltype', 'default', 'delete', 'do', 'double', 'dynamic_cast',
    'else', 'enum', 'explicit', 'export', 'extern', 'false', 'float', 'for', 'friend', 'goto',
    'if', 'inline', 'int', 'long', 'mutable', 'namespace', 'new', 'noexcept', 'not', 'not_eq',
    'nullptr', 'operator', 'or', 'or_eq', 'private', 'protected', 'public', 'register',
    'reinterpret_cast', 'requires', 'return', 'short', 'signed', 'sizeof', 'static', 'static_assert',
    'static_cast', 'struct', 'switch', 'template', 'this', 'thread_local', 'throw', 'true', 'try',
    'typedef', 'typeid', 'typename', 'union', 'unsigned', 'using', 'virtual', 'void', 'volatile',
    'wchar_t', 'while', 'xor', 'xor_eq'
]);

export interface NameValidationOptions {
    allowCppKeywords?: boolean;
    required?: boolean;
}

export function checkName<N extends AstNode>(
    accept: ValidationAcceptor,
    node: N,
    name: string | undefined,
    property: Properties<N>,
    options: NameValidationOptions = {},
): void {
    const { allowCppKeywords = true, required = true } = options;
    if (!name) {
        if (required) {
            accept('error', 'A name shall not be empty.', { node, property });
        }
        return;
    }
    if (!nameRegex.test(name)) {
        accept('error', 'A name shall start with a letter.', { node, property });
    }
    if (!allowCppKeywords && cppReservedNames.has(name)) {
        accept('error', 'A name shall not be an ISO/ANSI C++ keyword.', { node, property });
    }
}
