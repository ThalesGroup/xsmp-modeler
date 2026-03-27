import type * as LinkBaseModel from '../model/linkbase.js';
import {
    getAttribute,
    getChildText,
    getChildObjects,
    getXsiTypeLocalName,
    joinBlocks,
    renderBlock,
    renderDocumentHeader,
    renderInterfaceLinkSourcePath,
    renderNamedElementHeader,
    sanitizeReferenceText,
    type SmpXmlObject,
} from './shared.js';

export function importLinkBase(
    root: LinkBaseModel.LinkBase,
    warnings: string[],
): string {
    const rootNode = root as unknown as SmpXmlObject;
    const components = getChildObjects(rootNode, 'Component')
        .map(component => renderComponentLinkBase(component, warnings));

    return joinBlocks([
        renderDocumentHeader(rootNode),
        `link ${sanitizeReferenceText(getAttribute(rootNode, 'Name') ?? '__link__')}`,
        components.join('\n\n'),
    ].filter(Boolean), '\n\n').trimEnd() + '\n';
}

export function renderImportedLink(node: SmpXmlObject, warnings: string[]): string {
    const ownerPath = getChildText(node, 'OwnerPath') ?? '__owner__';
    const clientPath = getChildText(node, 'ClientPath') ?? '__client__';
    switch (getXsiTypeLocalName(node, 'LinkBase:Link')) {
        case 'EventLink':
            return `event link ${ownerPath} -> ${clientPath}`;
        case 'FieldLink':
            return `field link ${ownerPath} -> ${clientPath}`;
        case 'InterfaceLink': {
            const sourcePath = renderInterfaceLinkSourcePath(getChildText(node, 'OwnerPath'), getChildText(node, 'Reference'));
            const backReference = getChildText(node, 'BackReference');
            return `interface link ${sourcePath} -> ${clientPath}${backReference ? `:${sanitizeReferenceText(backReference)}` : ''}`;
        }
        default:
            warnings.push(`Unsupported link type '${getAttribute(node, 'xsi:type') ?? 'LinkBase:Link'}'; importing as field link.`);
            return `field link ${ownerPath} -> ${clientPath}`;
    }
}

function renderComponentLinkBase(node: SmpXmlObject, warnings: string[]): string {
    const path = getAttribute(node, 'Path') ?? '.';
    const header = renderNamedElementHeader(node);
    const elements = [
        ...getChildObjects(node, 'Link').map(link => renderImportedLink(link, warnings)),
        ...getChildObjects(node, 'Component').map(child => renderComponentLinkBase(child, warnings)),
    ];

    return renderBlock(path, elements, { header, bodySeparator: '\n\n' });
}
