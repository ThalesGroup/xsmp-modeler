import { create } from 'xmlbuilder2';
import * as fs from 'node:fs/promises';
import { toXsmpIdentifier } from '../../utils/path-utils.js';
import { escape } from '../../utils/index.js';

export type SmpImportKind = 'catalogue' | 'configuration' | 'linkbase' | 'assembly' | 'schedule';

export interface SmpImportResult {
    readonly kind: SmpImportKind;
    readonly outputPath: string;
    readonly warnings: readonly string[];
}

export interface SmpImportRequest {
    readonly inputPath: string;
    readonly outputPath?: string;
    readonly overwrite?: boolean;
}

export interface SmpRenderImportRequest {
    readonly inputPath: string;
}

export interface SmpRenderImportResult {
    readonly kind: SmpImportKind;
    readonly content: string;
    readonly warnings: readonly string[];
}

export type SmpXmlObject = Record<string, unknown>;

export interface ParsedSmpXmlDocument {
    readonly rootKey: string;
    readonly rootLocalName: string;
    readonly rootNamespace?: string;
    readonly root: SmpXmlObject;
}

export interface SmpReferenceResolutionContext {
    readonly currentNamespace?: string;
    readonly resolveLocal?: (fragment: string | undefined, title: string | undefined) => string | undefined;
    readonly resolveExternal?: (href: string | undefined, fragment: string | undefined, title: string | undefined) => string | undefined;
}

export function getDefaultImportedXsmpPath(inputPath: string): string {
    if (inputPath.endsWith('.smpcat')) {
        return inputPath.slice(0, -'.smpcat'.length) + '.xsmpcat';
    }
    if (inputPath.endsWith('.smpcfg')) {
        return inputPath.slice(0, -'.smpcfg'.length) + '.xsmpcfg';
    }
    if (inputPath.endsWith('.smplnk')) {
        return inputPath.slice(0, -'.smplnk'.length) + '.xsmplnk';
    }
    if (inputPath.endsWith('.smpasb')) {
        return inputPath.slice(0, -'.smpasb'.length) + '.xsmpasb';
    }
    if (inputPath.endsWith('.smpsed')) {
        return inputPath.slice(0, -'.smpsed'.length) + '.xsmpsed';
    }
    return `${inputPath}.xsmp`;
}

export async function parseSmpXmlFile(inputPath: string): Promise<ParsedSmpXmlDocument> {
    const xml = await fs.readFile(inputPath, 'utf-8');
    return parseSmpXml(xml);
}

export function parseSmpXml(xml: string): ParsedSmpXmlDocument {
    let parsed: unknown;
    try {
        parsed = create(xml).end({ format: 'object' });
    } catch (error) {
        throw new Error('Failed to parse SMP XML.', { cause: error });
    }

    if (!isSmpXmlObject(parsed)) {
        throw new Error('Parsed SMP XML does not contain an object root.');
    }

    const rootEntry = getDocumentRootEntry(parsed);
    if (!rootEntry) {
        throw new Error('Parsed SMP XML does not contain a root element.');
    }
    const [rootKey, root] = rootEntry;

    const prefix = rootKey.includes(':') ? rootKey.slice(0, rootKey.indexOf(':')) : undefined;
    const rootNamespace = prefix ? getAttribute(root, `xmlns:${prefix}`) : getAttribute(root, 'xmlns');

    return {
        rootKey,
        rootLocalName: getLocalName(rootKey),
        rootNamespace,
        root,
    };
}

function getDocumentRootEntry(node: SmpXmlObject): [string, SmpXmlObject] | undefined {
    for (const [key, value] of Object.entries(node)) {
        if (isSmpXmlObject(value)) {
            return [key, value];
        }
    }
    return undefined;
}

export function detectSmpImportKind(document: ParsedSmpXmlDocument): SmpImportKind | undefined {
    const namespace = document.rootNamespace ?? '';
    if (document.rootLocalName === 'Catalogue' && namespace.endsWith('/Catalogue')) {
        return 'catalogue';
    }
    if (document.rootLocalName === 'Configuration' && namespace.endsWith('/Configuration')) {
        return 'configuration';
    }
    if (document.rootLocalName === 'LinkBase' && namespace.endsWith('/LinkBase')) {
        return 'linkbase';
    }
    if (document.rootLocalName === 'Assembly' && namespace.endsWith('/Assembly')) {
        return 'assembly';
    }
    if (document.rootLocalName === 'Schedule' && namespace.endsWith('/Schedule')) {
        return 'schedule';
    }
    return undefined;
}

export function isSmpXmlObject(value: unknown): value is SmpXmlObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asArray<T>(value: T | readonly T[] | undefined | null): T[] {
    if (value === undefined || value === null) {
        return [];
    }
    return Array.isArray(value) ? Array.from(value as readonly T[]) : [value as T];
}

export function getLocalName(key: string): string {
    const normalized = key.startsWith('@') ? key.slice(1) : key;
    const separatorIndex = normalized.indexOf(':');
    return separatorIndex >= 0 ? normalized.slice(separatorIndex + 1) : normalized;
}

export function getAttribute(node: SmpXmlObject, localName: string): string | undefined {
    const normalized = localName.startsWith('@') ? localName : `@${localName}`;
    for (const [key, value] of Object.entries(node)) {
        if (key !== normalized && getLocalName(key) !== getLocalName(normalized)) {
            continue;
        }
        if (typeof value === 'string') {
            return value;
        }
        if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
            return String(value);
        }
    }
    return undefined;
}

export function getChild(node: SmpXmlObject, localName: string): unknown {
    for (const [key, value] of Object.entries(node)) {
        if (key.startsWith('@')) {
            continue;
        }
        if (getLocalName(key) === localName) {
            return value;
        }
    }
    return undefined;
}

export function getChildText(node: SmpXmlObject, localName: string): string | undefined {
    const child = getChild(node, localName);
    if (typeof child === 'string') {
        return child;
    }
    return undefined;
}

export function getTextAttributeOrChild(node: SmpXmlObject, localName: string): string | undefined {
    return getChildText(node, localName) ?? getAttribute(node, localName);
}

export function getXsiTypeLocalName(node: SmpXmlObject, fallback = ''): string {
    return getLocalName(getAttribute(node, 'xsi:type') ?? fallback);
}

export function getChildren(node: SmpXmlObject, localName: string): unknown[] {
    const child = getChild(node, localName);
    return asArray(child);
}

export function getChildObjects(node: SmpXmlObject, localName: string): SmpXmlObject[] {
    return getChildren(node, localName).filter(isSmpXmlObject);
}

export function parseBooleanAttribute(node: SmpXmlObject, localName: string): boolean | undefined {
    const value = getAttribute(node, localName);
    if (value === undefined) {
        return undefined;
    }
    return value === 'true';
}

export function parseBigIntAttribute(node: SmpXmlObject, localName: string): bigint | undefined {
    const value = getAttribute(node, localName);
    if (value === undefined || value === '') {
        return undefined;
    }
    return BigInt(value);
}

export function renderDocComment(description: string | undefined, tags: readonly string[] = []): string {
    const lines: string[] = [];
    if (description) {
        lines.push(...description.split(/\r?\n/u).map(line => line.trimEnd()));
    }
    if (description && tags.length > 0) {
        lines.push('');
    }
    lines.push(...tags);

    if (lines.length === 0) {
        return '';
    }
    if (lines.length === 1 && !lines[0].startsWith('@')) {
        return `/** ${lines[0]} */`;
    }

    return [
        '/**',
        ...lines.map(line => line === '' ? ' *' : ` * ${line}`),
        ' */',
    ].join('\n');
}

export function renderDocumentHeader(node: SmpXmlObject): string {
    return renderDocComment(getChildText(node, 'Description'), renderDocumentMetadataTags(node));
}

export function renderNamedElementHeader(node: SmpXmlObject): string {
    return renderDocComment(getChildText(node, 'Description'));
}

export function indentBlock(text: string, level = 1): string {
    const prefix = '    '.repeat(level);
    return text.split('\n').map(line => line.length > 0 ? `${prefix}${line}` : line).join('\n');
}

export function joinBlocks(blocks: readonly string[], separator = '\n\n'): string {
    return blocks.filter(block => block.trim().length > 0).join(separator);
}

export interface RenderBlockOptions {
    readonly header?: string;
    readonly bodySeparator?: string;
}

export function renderBlock(signature: string, body: readonly string[], options: RenderBlockOptions = {}): string {
    return joinBlocks([
        options.header ?? '',
        signature,
        '{',
        body.length > 0 ? indentBlock(joinBlocks(body, options.bodySeparator ?? '\n')) : '',
        '}',
    ].filter(Boolean), '\n');
}

export function renderOptionalBlock(signature: string, body: readonly string[], options: RenderBlockOptions = {}): string {
    if (body.length === 0) {
        return joinBlocks([options.header ?? '', signature], '\n');
    }
    return renderBlock(signature, body, options);
}

export function prefixFirstContentLine(text: string, prefix: string): string {
    const lines = text.split('\n');
    const targetIndex = lines.findIndex(line =>
        line !== ' */'
        && !line.startsWith('/**')
        && !line.startsWith(' *')
        && line.trim().length > 0
    );
    if (targetIndex < 0) {
        return text;
    }
    lines[targetIndex] = `${prefix}${lines[targetIndex]}`;
    return lines.join('\n');
}

export function extractHrefFragment(href: string | undefined): string | undefined {
    if (!href) {
        return undefined;
    }
    const hashIndex = href.indexOf('#');
    if (hashIndex >= 0) {
        return href.slice(hashIndex + 1);
    }
    return undefined;
}

export function isValidQualifiedName(value: string | undefined): boolean {
    return typeof value === 'string' && /^[_A-Za-z]\w*(\.[_A-Za-z]\w*)*$/u.test(value);
}

export function renderReferenceText(
    link: SmpXmlObject | undefined,
    warnings: string[],
    resolutionContext?: string | SmpReferenceResolutionContext,
    fallbackLabel = 'reference',
): string {
    if (!link) {
        warnings.push(`Missing ${fallbackLabel}; using placeholder.`);
        return '__missing__';
    }

    const context = typeof resolutionContext === 'string'
        ? { currentNamespace: resolutionContext }
        : (resolutionContext ?? {});
    const title = getAttribute(link, 'xlink:title');
    const href = getAttribute(link, 'xlink:href');
    const fragment = extractHrefFragment(href);
    const localResolution = context.resolveLocal?.(fragment, title);
    if (localResolution) {
        return localResolution;
    }
    if (href && !href.startsWith('#')) {
        const externalResolution = context.resolveExternal?.(href, fragment, title);
        if (externalResolution) {
            return externalResolution;
        }
    }

    if (href?.startsWith('#')) {
        if (fragment && title && context.currentNamespace && fragment === `${context.currentNamespace}.${title}`) {
            return title;
        }
        if (fragment && title && !context.currentNamespace && !fragment.includes('.')) {
            return title;
        }
        if (fragment && context.currentNamespace && fragment.startsWith(`${context.currentNamespace}.`) && fragment.endsWith(`.${title ?? ''}`)) {
            return title ?? fragment;
        }
        if (fragment && isValidQualifiedName(fragment)) {
            return fragment.startsWith('Smp.') && title ? title : fragment;
        }
        if (title && isValidQualifiedName(title)) {
            return title;
        }
    }

    if (href && fragment && isValidQualifiedName(fragment)) {
        if (fragment.startsWith('Smp.') && title) {
            return title;
        }
        return fragment;
    }
    if (title && isValidQualifiedName(title)) {
        return title;
    }
    if (fragment && isValidQualifiedName(fragment)) {
        warnings.push(`Missing xlink:title for ${fallbackLabel}; falling back to '${fragment}'.`);
        return fragment;
    }
    if (title) {
        const sanitized = sanitizeReferenceText(title);
        warnings.push(`Using sanitized ${fallbackLabel} '${sanitized}' from title '${title}'.`);
        return sanitized;
    }
    if (fragment) {
        const sanitized = sanitizeReferenceText(fragment);
        warnings.push(`Using sanitized ${fallbackLabel} '${sanitized}' from href '${href}'.`);
        return sanitized;
    }

    warnings.push(`Missing ${fallbackLabel} target; using placeholder.`);
    return '__missing__';
}

export function sanitizeReferenceText(value: string): string {
    if (isValidQualifiedName(value)) {
        return value;
    }
    return value
        .split(/[^\w]+/u)
        .filter(Boolean)
        .map(toXsmpIdentifier)
        .filter(Boolean)
        .join('.') || '__missing__';
}

export function renderStringLiteral(value: string): string {
    return `"${escape(value)}"`;
}

export function renderCharacterLiteral(value: string): string {
    return `'${escape(value)}'`;
}

const scalarValueSuffixes = new Map<string, string>([
    ['Float32Value', 'f32'],
    ['Float64Value', 'f64'],
    ['Int8Value', 'i8'],
    ['Int16Value', 'i16'],
    ['Int32Value', 'i32'],
    ['Int64Value', 'i64'],
    ['UInt8Value', 'u8'],
    ['UInt16Value', 'u16'],
    ['UInt32Value', 'u32'],
    ['UInt64Value', 'u64'],
]);

const arrayValueTypes = new Set([
    'ArrayValue',
    'BoolArrayValue',
    'Char8ArrayValue',
    'DateTimeArrayValue',
    'DurationArrayValue',
    'EnumerationArrayValue',
    'Float32ArrayValue',
    'Float64ArrayValue',
    'Int16ArrayValue',
    'Int32ArrayValue',
    'Int64ArrayValue',
    'Int8ArrayValue',
    'String8ArrayValue',
    'UInt16ArrayValue',
    'UInt32ArrayValue',
    'UInt64ArrayValue',
    'UInt8ArrayValue',
]);

export function renderImportedTemplateParameter(node: SmpXmlObject, warnings: string[]): string {
    const name = sanitizeReferenceText(getAttribute(node, 'Name') ?? '__parameter__');
    const valueType = getXsiTypeLocalName(node, 'Assembly:TemplateArgument');
    switch (valueType) {
        case 'Int32Argument': {
            const value = getAttribute(node, 'Value');
            return value === undefined ? `${name}: int32` : `${name} = ${value}`;
        }
        case 'StringArgument': {
            const value = getAttribute(node, 'Value');
            return value === undefined ? `${name}: string` : `${name} = ${renderStringLiteral(value)}`;
        }
        default:
            warnings.push(`Unsupported template parameter type '${getAttribute(node, 'xsi:type') ?? valueType}'; defaulting to string.`);
            return `${name}: string`;
    }
}

export function renderImportedTemplateArgument(node: SmpXmlObject, warnings: string[]): string {
    const parameter = sanitizeReferenceText(getAttribute(node, 'Name') ?? '__parameter__');
    const valueType = getXsiTypeLocalName(node, 'Assembly:TemplateArgument');
    switch (valueType) {
        case 'Int32Argument': {
            const value = getAttribute(node, 'Value');
            if (value === undefined) {
                warnings.push(`Missing int32 template argument value for '${parameter}'; defaulting to 0.`);
                return `${parameter} = 0`;
            }
            return `${parameter} = ${value}`;
        }
        case 'StringArgument': {
            const value = getAttribute(node, 'Value');
            if (value === undefined) {
                warnings.push(`Missing string template argument value for '${parameter}'; defaulting to empty string.`);
                return `${parameter} = ${renderStringLiteral('')}`;
            }
            return `${parameter} = ${renderStringLiteral(value)}`;
        }
        default:
            warnings.push(`Unsupported template argument type '${getAttribute(node, 'xsi:type') ?? valueType}'; defaulting to empty string.`);
            return `${parameter} = ${renderStringLiteral('')}`;
    }
}

export function renderImportedValue(node: SmpXmlObject, warnings: string[]): string {
    const valueType = getXsiTypeLocalName(node, 'Types:Value');
    switch (valueType) {
        case 'BoolValue':
            return getAttribute(node, 'Value') === 'true' ? 'true' : 'false';
        case 'Char8Value':
            return renderCharacterLiteral(getAttribute(node, 'Value') ?? '');
        case 'String8Value':
            return renderStringLiteral(getAttribute(node, 'Value') ?? '');
        case 'DateTimeValue':
            return `${renderStringLiteral(getAttribute(node, 'Value') ?? '')}dt`;
        case 'DurationValue':
            return `${renderStringLiteral(getAttribute(node, 'Value') ?? '')}d`;
        case 'EnumerationValue': {
            const literal = getAttribute(node, 'Literal');
            return literal ? literal : `${getAttribute(node, 'Value') ?? '0'}lit`;
        }
        default: {
            const numericSuffix = scalarValueSuffixes.get(valueType);
            if (numericSuffix) {
                return `${getAttribute(node, 'Value') ?? '0'}${numericSuffix}`;
            }
            if (arrayValueTypes.has(valueType)) {
                return `[${getChildObjects(node, 'ItemValue').map(item => renderImportedValue(item, warnings)).join(', ')}]`;
            }
            if (valueType === 'StructureValue') {
                return `{ ${getChildObjects(node, 'FieldValue').map(item => renderImportedStructureFieldValue(item, warnings)).join(', ')} }`;
            }
            warnings.push(`Unsupported imported SMP value '${getAttribute(node, 'xsi:type') ?? valueType}'.`);
            return '0';
        }
    }
}

export function renderImportedStructureFieldValue(node: SmpXmlObject, warnings: string[]): string {
    const field = getAttribute(node, 'Field');
    const value = renderImportedValue(node, warnings);
    return field ? `${field} = ${value}` : value;
}

export function renderNestedImportedValue(
    node: SmpXmlObject,
    childName: string,
    warnings: string[],
    fallback = '0',
): string {
    const value = getChild(node, childName);
    return value && isSmpXmlObject(value) ? renderImportedValue(value, warnings) : fallback;
}

export function renderInterfaceLinkSourcePath(ownerPath: string | undefined, reference: string | undefined): string {
    const owner = ownerPath?.trim() ?? '';
    const member = reference?.trim() ?? '';
    if (owner.length === 0 || owner === '.') {
        return member || '.';
    }
    if (owner === '/') {
        return member ? `/${member}` : '/';
    }
    return member ? `${owner}.${member}` : owner;
}

export function fileExists(filePath: string): Promise<boolean> {
    return fs.access(filePath).then(() => true, () => false);
}

export function renderDocumentMetadataTags(node: SmpXmlObject): string[] {
    const tags: string[] = [];
    const title = getAttribute(node, 'Title');
    const date = getAttribute(node, 'Date');
    const creator = getAttribute(node, 'Creator');
    const version = getAttribute(node, 'Version');
    if (title) {
        tags.push(`@title ${title}`);
    }
    if (date) {
        tags.push(`@date ${date}`);
    }
    if (creator) {
        for (const part of creator.split(',').map(entry => entry.trim()).filter(Boolean)) {
            tags.push(`@creator ${part}`);
        }
    }
    if (version) {
        tags.push(`@version ${version}`);
    }
    return tags;
}
