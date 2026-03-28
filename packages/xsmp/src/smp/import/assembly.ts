import type * as AssemblyModel from '../model/assembly.js';
import type { SmpExternalReferenceResolver } from './reference-resolver.js';
import { renderImportedLink } from './linkbase.js';
import {
    getAttribute,
    getChild,
    getChildObjects,
    getTextAttributeOrChild,
    getXsiTypeLocalName,
    isValidQualifiedName,
    joinBlocks,
    prefixFirstContentLine,
    renderBlock,
    renderDocumentHeader,
    renderImportedTemplateArgument,
    renderImportedTemplateParameter,
    renderImportedValue,
    renderNestedImportedValue,
    renderNamedElementHeader,
    renderOptionalBlock,
    renderStringLiteral,
    sanitizeReferenceText,
    type SmpXmlObject,
} from './shared.js';

export function importAssembly(
    root: AssemblyModel.Assembly,
    warnings: string[],
    referenceResolver: SmpExternalReferenceResolver,
): string {
    const rootNode = root as unknown as SmpXmlObject;
    const parameters = getChildObjects(rootNode, 'Parameter')
        .map(parameter => renderImportedTemplateParameter(parameter, warnings));
    const configurations = getChildObjects(rootNode, 'ComponentConfiguration')
        .map(configuration => renderAssemblyComponentConfiguration(configuration, warnings));
    const model = getChild(rootNode, 'Model');
    if (!model || typeof model !== 'object' || Array.isArray(model)) {
        throw new Error('Malformed SMP Assembly XML: missing root Model element.');
    }
    const parameterText = parameters.length > 0 ? ` <${parameters.join(', ')}>` : '';

    return joinBlocks([
        renderDocumentHeader(rootNode),
        `assembly${parameterText} ${sanitizeReferenceText(getAttribute(rootNode, 'Name') ?? '__assembly__')}`,
        ...configurations,
        renderModelInstance(model as SmpXmlObject, warnings, referenceResolver),
    ].filter(Boolean), '\n\n').trimEnd() + '\n';
}

function renderModelInstance(
    node: SmpXmlObject,
    warnings: string[],
    referenceResolver: SmpExternalReferenceResolver,
): string {
    const name = sanitizeReferenceText(getAttribute(node, 'Name') ?? '__model__');
    const implementation = renderImplementation(getAttribute(node, 'Implementation'), warnings);
    const header = renderNamedElementHeader(node);
    const body = [
        ...getChildObjects(node, 'Assembly').map(instance => renderAssemblyInstance(instance, warnings, referenceResolver)),
        ...getChildObjects(node, 'Model').map(instance => renderSubModelInstance(instance, warnings, referenceResolver)),
        ...getChildObjects(node, 'Link').map(link => renderImportedLink(link, warnings)),
        ...getChildObjects(node, 'FieldValue').map(value => renderAssemblyFieldValue(value, warnings)),
        ...getChildObjects(node, 'Invocation').map(invocation => renderAssemblyInvocation(invocation, warnings)),
        ...getChildObjects(node, 'GlobalEventHandler').map(handler => renderGlobalEventHandler(handler)),
    ];

    const signature = `${name}: ${implementation}`;
    return renderOptionalBlock(signature, body, { header });
}

function renderSubModelInstance(
    node: SmpXmlObject,
    warnings: string[],
    referenceResolver: SmpExternalReferenceResolver,
): string {
    const container = sanitizeReferenceText(getAttribute(node, 'Container') ?? '__container__');
    const rendered = renderModelInstance(node, warnings, referenceResolver);
    return prefixFirstContentLine(rendered, `${container} += `);
}

function renderAssemblyInstance(
    node: SmpXmlObject,
    warnings: string[],
    referenceResolver: SmpExternalReferenceResolver,
): string {
    const header = renderNamedElementHeader(node);
    const container = sanitizeReferenceText(getAttribute(node, 'Container') ?? '__container__');
    const name = sanitizeReferenceText(getAttribute(node, 'Name') ?? '__assembly__');
    const assemblyName = renderAssemblyDocumentReference(getTextAttributeOrChild(node, 'Assembly'), warnings, referenceResolver, 'assembly reference', ['assembly']);
    const argumentsText = getChildObjects(node, 'Argument').map(argument => renderImportedTemplateArgument(argument, warnings));
    const configurationName = renderAssemblyDocumentReference(getTextAttributeOrChild(node, 'Configuration'), warnings, referenceResolver, 'assembly configuration', ['configuration']);
    const linkBaseName = renderAssemblyDocumentReference(getTextAttributeOrChild(node, 'LinkBase'), warnings, referenceResolver, 'assembly link base', ['linkbase']);
    const body = getChildObjects(node, 'ModelConfiguration')
        .map(configuration => renderAssemblyComponentConfiguration(configuration, warnings));
    const argumentsSuffix = argumentsText.length > 0 ? `<${argumentsText.join(', ')}>` : '';
    const configurationSuffix = configurationName ? ` using config ${configurationName}` : '';
    const linkBaseSuffix = linkBaseName ? ` using link ${linkBaseName}` : '';

    const signature = `${container} += ${name}: ${assemblyName}${argumentsSuffix}${configurationSuffix}${linkBaseSuffix}`;
    return renderOptionalBlock(signature, body, { header, bodySeparator: '\n\n' });
}

function renderAssemblyComponentConfiguration(node: SmpXmlObject, warnings: string[]): string {
    const path = getAttribute(node, 'InstancePath') ?? '.';
    const body = [
        ...getChildObjects(node, 'Invocation').map(invocation => renderAssemblyInvocation(invocation, warnings)),
        ...getChildObjects(node, 'GlobalEventHandler').map(handler => renderGlobalEventHandler(handler)),
        ...getChildObjects(node, 'FieldValue').map(value => renderAssemblyFieldValue(value, warnings)),
    ];

    return renderBlock(`configure ${path}`, body);
}

function renderAssemblyFieldValue(node: SmpXmlObject, warnings: string[]): string {
    const field = getAttribute(node, 'Field') ?? '__field__';
    return `${field} = ${renderImportedValue(node, warnings)}`;
}

function renderAssemblyInvocation(node: SmpXmlObject, warnings: string[]): string {
    switch (getXsiTypeLocalName(node, 'Assembly:Invocation')) {
        case 'OperationCall': {
            const operation = sanitizeReferenceText(getAttribute(node, 'Operation') ?? '__operation__');
            const parameters = getChildObjects(node, 'Parameter')
                .map(parameter => `${sanitizeReferenceText(getAttribute(parameter, 'Parameter') ?? '__parameter__')}=${renderNestedImportedValue(parameter, 'Value', warnings)}`);
            return `call ${operation}(${parameters.join(', ')})`;
        }
        case 'PropertyValue': {
            const property = sanitizeReferenceText(getAttribute(node, 'Property') ?? '__property__');
            return `property ${property} = ${renderNestedImportedValue(node, 'Value', warnings)}`;
        }
        default:
            warnings.push(`Unsupported assembly invocation type '${getAttribute(node, 'xsi:type') ?? 'Assembly:Invocation'}'.`);
            return '/* unsupported invocation */';
    }
}

function renderGlobalEventHandler(node: SmpXmlObject): string {
    const entryPoint = sanitizeReferenceText(getAttribute(node, 'EntryPointName') ?? '__entryPoint__');
    const eventName = getAttribute(node, 'GlobalEventName') ?? '';
    return `subscribe ${entryPoint} -> ${renderStringLiteral(eventName)}`;
}

function renderImplementation(value: string | undefined, warnings: string[]): string {
    if (!value) {
        warnings.push('Missing model implementation; using placeholder string implementation.');
        return renderStringLiteral('__missing__');
    }

    const xsmpQualifiedName = value.replaceAll('::', '.');
    if (isValidQualifiedName(xsmpQualifiedName)) {
        return xsmpQualifiedName;
    }
    return renderStringLiteral(value);
}

function renderAssemblyDocumentReference(
    fileReference: string | undefined,
    warnings: string[],
    referenceResolver: SmpExternalReferenceResolver,
    fallbackLabel: string,
    expectedKinds: ReadonlyArray<'assembly' | 'configuration' | 'linkbase'>,
): string {
    if (!fileReference) {
        warnings.push(`Missing ${fallbackLabel}; using placeholder.`);
        return '__missing__';
    }

    const resolved = referenceResolver.resolveDocumentName(fileReference, warnings, fallbackLabel, expectedKinds);
    if (resolved) {
        return sanitizeReferenceText(resolved);
    }

    const stem = fileReference.replace(/\.(smpasb|smpcfg|smplnk)$/u, '');
    const basename = stem.split(/[\\/]/u).at(-1) ?? stem;
    const sanitized = sanitizeReferenceText(basename);
    warnings.push(`Could not resolve ${fallbackLabel} '${fileReference}'; using '${sanitized}'.`);
    return sanitized;
}
