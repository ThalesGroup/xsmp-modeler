import type * as ConfigurationModel from '../model/configuration.js';
import type { SmpExternalReferenceResolver } from './reference-resolver.js';
import {
    getAttribute,
    getChild,
    getChildObjects,
    joinBlocks,
    renderBlock,
    renderDocumentHeader,
    renderImportedValue,
    renderReferenceText,
    type SmpXmlObject,
} from './shared.js';

export function importConfiguration(
    root: ConfigurationModel.Configuration,
    warnings: string[],
    referenceResolver: SmpExternalReferenceResolver,
): string {
    const rootNode = root as unknown as SmpXmlObject;
    const elements = [
        ...getChildObjects(rootNode, 'Include').map(include => renderConfigurationUsage(include, warnings, referenceResolver)),
        ...getChildObjects(rootNode, 'Component').map(component => renderComponentConfiguration(component, warnings, referenceResolver)),
    ];

    return joinBlocks([
        renderDocumentHeader(rootNode),
        `configuration ${root['@Name']}`,
        elements.join('\n\n'),
    ].filter(Boolean), '\n\n').trimEnd() + '\n';
}

function renderConfigurationReferenceText(
    link: SmpXmlObject | undefined,
    warnings: string[],
    referenceResolver: SmpExternalReferenceResolver,
    fallbackLabel: string,
): string {
    return renderReferenceText(link, warnings, {
        resolveExternal: (href, fragment, title) => referenceResolver.resolveReferenceText(href, fragment, title, warnings, fallbackLabel),
    }, fallbackLabel);
}

function renderComponentConfiguration(
    node: SmpXmlObject,
    warnings: string[],
    referenceResolver: SmpExternalReferenceResolver,
): string {
    const path = getAttribute(node, 'Path') ?? '.';
    const signature = `${path}`;
    const body = [
        ...getChildObjects(node, 'Include').map(include => renderConfigurationUsage(include, warnings, referenceResolver)),
        ...getChildObjects(node, 'Component').map(child => renderComponentConfiguration(child, warnings, referenceResolver)),
        ...getChildObjects(node, 'FieldValue').map(value => renderConfigurationFieldValue(value, warnings)),
    ];

    return renderBlock(signature, body);
}

function renderConfigurationUsage(
    node: SmpXmlObject,
    warnings: string[],
    referenceResolver: SmpExternalReferenceResolver,
): string {
    const configuration = renderConfigurationReferenceText(getChild(node, 'Configuration') as SmpXmlObject | undefined, warnings, referenceResolver, 'configuration include');
    const path = getAttribute(node, 'Path');
    const pathSuffix = path ? ` at ${path}` : '';
    return `include ${configuration}${pathSuffix}`;
}

function renderConfigurationFieldValue(node: SmpXmlObject, warnings: string[]): string {
    const field = getAttribute(node, 'Field') ?? '__field__';
    return `${field} = ${renderImportedValue(node, warnings)}`;
}
