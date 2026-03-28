import type * as CatalogueModel from '../model/catalogue.js';
import { collectCatalogueTypeInfos, type SmpExternalReferenceResolver, type SmpImportedTypeInfo } from './reference-resolver.js';
import {
    asArray,
    getAttribute,
    getChild,
    getChildObjects,
    getChildText,
    getXsiTypeLocalName,
    indentBlock,
    joinBlocks,
    parseBigIntAttribute,
    parseBooleanAttribute,
    renderCharacterLiteral,
    renderDocumentHeader,
    renderDocComment,
    renderReferenceText,
    renderStringLiteral,
    type SmpXmlObject,
} from './shared.js';

type TypeInfo = SmpImportedTypeInfo;

interface StructureFieldInfo {
    readonly name: string;
    readonly type?: SmpXmlObject;
}

interface CatalogueImportContext {
    readonly warnings: string[];
    readonly typeById: Map<string, TypeInfo>;
    readonly typeByQualifiedName: Map<string, TypeInfo>;
    readonly referenceResolver: SmpExternalReferenceResolver;
}

export function importCatalogue(
    root: CatalogueModel.Catalogue,
    warnings: string[],
    referenceResolver: SmpExternalReferenceResolver,
): string {
    const indexedTypes = collectCatalogueTypeInfos(getChildObjects(root as unknown as SmpXmlObject, 'Namespace'));
    const context: CatalogueImportContext = {
        warnings,
        typeById: indexedTypes.typeById,
        typeByQualifiedName: indexedTypes.typeByQualifiedName,
        referenceResolver,
    };
    const attributes = renderAppliedAttributes(getChildObjects(root as unknown as SmpXmlObject, 'Metadata'), context, undefined);
    const body = getChildObjects(root as unknown as SmpXmlObject, 'Namespace')
        .map(namespace => renderNamespace(namespace, context, []));

    return joinBlocks([
        renderDocumentHeader(root as unknown as SmpXmlObject),
        ...attributes,
        `catalogue ${root['@Name']}`,
        body.join('\n\n'),
    ].filter(Boolean), '\n\n').trimEnd() + '\n';
}

function renderCatalogueReferenceText(
    link: SmpXmlObject | undefined,
    context: CatalogueImportContext,
    currentNamespace: string | undefined,
    fallbackLabel: string,
): string {
    return renderReferenceText(link, context.warnings, {
        currentNamespace,
        resolveLocal: (fragment, title) => resolveLocalReferenceText(fragment, title, context, currentNamespace),
        resolveExternal: (href, fragment, title) => context.referenceResolver.resolveReferenceText(href, fragment, title, context.warnings, fallbackLabel),
    }, fallbackLabel);
}

function resolveLocalReferenceText(
    fragment: string | undefined,
    title: string | undefined,
    context: CatalogueImportContext,
    currentNamespace: string | undefined,
): string | undefined {
    const localTypeInfo = resolveLocalTypeInfo(fragment, title, context);
    if (!localTypeInfo) {
        return undefined;
    }
    if (currentNamespace && localTypeInfo.namespace === currentNamespace) {
        return localTypeInfo.qname.slice(localTypeInfo.qname.lastIndexOf('.') + 1);
    }
    return localTypeInfo.qname;
}

function renderNamespace(namespace: SmpXmlObject, context: CatalogueImportContext, parts: readonly string[]): string {
    const name = getAttribute(namespace, 'Name') ?? '__namespace__';
    const namespacePrefix = [...parts, name].join('.');
    const header = renderHeader(namespace, context, {
        defaultId: namespacePrefix,
        currentNamespace: namespacePrefix,
    });
    const nestedNamespaces = getChildObjects(namespace, 'Namespace')
        .map(child => renderNamespace(child, context, [...parts, name]));
    const types = getChildObjects(namespace, 'Type')
        .map(type => renderType(type, context, namespacePrefix));
    const body = joinBlocks([...nestedNamespaces, ...types], '\n\n');

    return joinBlocks([
        header,
        `namespace ${name}`,
        '{',
        body ? indentBlock(body) : '',
        '}',
    ].filter(Boolean), '\n');
}

function renderType(type: SmpXmlObject, context: CatalogueImportContext, currentNamespace: string): string {
    const typeName = getXsiTypeLocalName(type);
    switch (typeName) {
        case 'PrimitiveType':
            return renderSimpleType(type, context, currentNamespace, `primitive ${getAttribute(type, 'Name')}`);
        case 'AttributeType':
            return renderSimpleType(
                type,
                context,
                currentNamespace,
                `${renderVisibility(type)}attribute ${renderCatalogueReferenceText(getChild(type, 'Type') as SmpXmlObject | undefined, context, currentNamespace, 'attribute type')} ${getAttribute(type, 'Name')}${renderDefaultValue(type, 'Default', context, currentNamespace, getChild(type, 'Type') as SmpXmlObject | undefined)}`
            );
        case 'Array':
            return renderSimpleType(
                type,
                context,
                currentNamespace,
                `${renderVisibility(type)}array ${getAttribute(type, 'Name')} = ${renderCatalogueReferenceText(getChild(type, 'ItemType') as SmpXmlObject | undefined, context, currentNamespace, 'array item type')}[${getAttribute(type, 'Size') ?? '0'}]`
            );
        case 'ValueReference':
            return renderSimpleType(
                type,
                context,
                currentNamespace,
                `${renderVisibility(type)}using ${getAttribute(type, 'Name')} = ${renderCatalogueReferenceText(getChild(type, 'Type') as SmpXmlObject | undefined, context, currentNamespace, 'value reference type')}*`
            );
        case 'String':
            return renderSimpleType(
                type,
                context,
                currentNamespace,
                `${renderVisibility(type)}string ${getAttribute(type, 'Name')} [${getAttribute(type, 'Length') ?? '0'}]`
            );
        case 'Integer':
            return renderSimpleType(
                type,
                context,
                currentNamespace,
                `${renderVisibility(type)}integer ${getAttribute(type, 'Name')}${renderExtends(type, 'PrimitiveType', context, currentNamespace)}${renderIntegerRange(type)}`
            );
        case 'Float':
            return renderSimpleType(
                type,
                context,
                currentNamespace,
                `${renderVisibility(type)}float ${getAttribute(type, 'Name')}${renderExtends(type, 'PrimitiveType', context, currentNamespace)}${renderFloatRange(type)}`
            );
        case 'EventType':
            return renderSimpleType(
                type,
                context,
                currentNamespace,
                `${renderVisibility(type)}event ${getAttribute(type, 'Name')}${renderExtends(type, 'EventArgs', context, currentNamespace)}`
            );
        case 'NativeType':
            return renderSimpleType(
                type,
                context,
                currentNamespace,
                `${renderVisibility(type)}native ${getAttribute(type, 'Name')}`
            );
        case 'Enumeration':
            return renderEnumeration(type, context, currentNamespace);
        case 'Structure':
            return renderStructure(type, context, currentNamespace, 'struct');
        case 'Class':
            return renderClassifier(type, context, currentNamespace, 'class');
        case 'Exception':
            return renderClassifier(type, context, currentNamespace, 'exception');
        case 'Interface':
            return renderInterface(type, context, currentNamespace);
        case 'Model':
            return renderComponent(type, context, currentNamespace, 'model');
        case 'Service':
            return renderComponent(type, context, currentNamespace, 'service');
        default:
            context.warnings.push(`Unsupported catalogue type '${type['@xsi:type']}'.`);
            return `/* Unsupported type ${type['@xsi:type']} ${type['@Name']} */`;
    }
}

function renderSimpleType(node: SmpXmlObject, context: CatalogueImportContext, currentNamespace: string, signature: string): string {
    const header = renderHeader(node, context, {
        defaultId: `${currentNamespace}.${getAttribute(node, 'Name')}`,
        extraTags: renderTypeTags(node),
        currentNamespace,
    });
    return joinBlocks([header, signature], '\n');
}

function renderEnumeration(node: SmpXmlObject, context: CatalogueImportContext, currentNamespace: string): string {
    const header = renderHeader(node, context, {
        defaultId: `${currentNamespace}.${getAttribute(node, 'Name')}`,
        extraTags: renderTypeTags(node),
        currentNamespace,
    });
    const literals = getChildObjects(node, 'Literal').map(literal => {
        const literalId = `${currentNamespace}.${getAttribute(node, 'Name')}.${getAttribute(literal, 'Name')}`;
        const literalHeader = renderHeader(literal, context, { defaultId: literalId });
        const line = `${getAttribute(literal, 'Name')} = ${getAttribute(literal, 'Value') ?? '0'}`;
        return joinBlocks([literalHeader, line], '\n');
    });
    return joinBlocks([
        header,
        `${renderVisibility(node)}enum ${getAttribute(node, 'Name')}`,
        '{',
        literals.length > 0 ? indentBlock(literals.join(',\n')) : '',
        '}',
    ].filter(Boolean), '\n');
}

function renderStructure(node: SmpXmlObject, context: CatalogueImportContext, currentNamespace: string, keyword: string): string {
    const name = getAttribute(node, 'Name');
    const header = renderHeader(node, context, {
        defaultId: `${currentNamespace}.${name}`,
        extraTags: renderTypeTags(node),
        currentNamespace,
    });
    const members = [
        ...getChildObjects(node, 'Constant').map(member => renderConstant(member, context, currentNamespace, false)),
        ...getChildObjects(node, 'Field').map(member => renderField(member, context, currentNamespace, false)),
    ];

    return joinBlocks([
        header,
        `${renderVisibility(node)}${keyword} ${name}`,
        '{',
        members.length > 0 ? indentBlock(joinBlocks(members, '\n\n')) : '',
        '}',
    ].filter(Boolean), '\n');
}

function renderClassifier(node: SmpXmlObject, context: CatalogueImportContext, currentNamespace: string, keyword: string): string {
    const name = getAttribute(node, 'Name');
    const abstractPrefix = parseBooleanAttribute(node, 'Abstract') ? 'abstract ' : '';
    const header = renderHeader(node, context, {
        defaultId: `${currentNamespace}.${name}`,
        extraTags: renderTypeTags(node),
        currentNamespace,
    });
    const members = [
        ...getChildObjects(node, 'Association').map(member => renderAssociation(member, context, currentNamespace)),
        ...getChildObjects(node, 'Constant').map(member => renderConstant(member, context, currentNamespace)),
        ...getChildObjects(node, 'Operation').map(member => renderOperation(member, context, currentNamespace)),
        ...getChildObjects(node, 'Field').map(member => renderField(member, context, currentNamespace)),
        ...getChildObjects(node, 'Property').map(member => renderProperty(member, context, currentNamespace)),
    ];

    return joinBlocks([
        header,
        `${renderVisibility(node)}${abstractPrefix}${keyword} ${name}${renderExtends(node, 'Base', context, currentNamespace)}`,
        '{',
        members.length > 0 ? indentBlock(joinBlocks(members, '\n\n')) : '',
        '}',
    ].filter(Boolean), '\n');
}

function renderInterface(node: SmpXmlObject, context: CatalogueImportContext, currentNamespace: string): string {
    const name = getAttribute(node, 'Name');
    const header = renderHeader(node, context, {
        defaultId: `${currentNamespace}.${name}`,
        extraTags: renderTypeTags(node),
        currentNamespace,
    });
    const bases = getChildObjects(node, 'Base').map(base => renderCatalogueReferenceText(base, context, currentNamespace, 'interface base'));
    const members = [
        ...getChildObjects(node, 'Constant').map(member => renderConstant(member, context, currentNamespace, false)),
        ...getChildObjects(node, 'Property').map(member => renderProperty(member, context, currentNamespace, false)),
        ...getChildObjects(node, 'Operation').map(member => renderOperation(member, context, currentNamespace, false)),
    ];
    const basesText = bases.length > 0 ? ` extends ${bases.join(', ')}` : '';

    return joinBlocks([
        header,
        `${renderVisibility(node)}interface ${name}${basesText}`,
        '{',
        members.length > 0 ? indentBlock(joinBlocks(members, '\n\n')) : '',
        '}',
    ].filter(Boolean), '\n');
}

function renderComponent(node: SmpXmlObject, context: CatalogueImportContext, currentNamespace: string, keyword: string): string {
    const name = getAttribute(node, 'Name');
    const abstractPrefix = parseBooleanAttribute(node, 'Abstract') ? 'abstract ' : '';
    const header = renderHeader(node, context, {
        defaultId: `${currentNamespace}.${name}`,
        extraTags: renderTypeTags(node),
    });
    const implemented = getChildObjects(node, 'Interface').map(base => renderCatalogueReferenceText(base, context, currentNamespace, 'implemented interface'));
    const members = [
        ...getChildObjects(node, 'Constant').map(member => renderConstant(member, context, currentNamespace)),
        ...getChildObjects(node, 'Operation').map(member => renderOperation(member, context, currentNamespace)),
        ...getChildObjects(node, 'Property').map(member => renderProperty(member, context, currentNamespace)),
        ...getChildObjects(node, 'Realization').map(member => renderRealization(member, context, currentNamespace)),
        ...getChildObjects(node, 'EntryPoint').map(member => renderEntryPoint(member, context, currentNamespace)),
        ...getChildObjects(node, 'EventSink').map(member => renderEventSink(member, context, currentNamespace)),
        ...getChildObjects(node, 'EventSource').map(member => renderEventSource(member, context, currentNamespace)),
        ...getChildObjects(node, 'Field').map(member => renderField(member, context, currentNamespace)),
        ...getChildObjects(node, 'Association').map(member => renderAssociation(member, context, currentNamespace)),
        ...getChildObjects(node, 'Container').map(member => renderContainer(member, context, currentNamespace)),
        ...getChildObjects(node, 'Reference').map(member => renderReference(member, context, currentNamespace)),
    ];
    const implementedText = implemented.length > 0 ? ` implements ${implemented.join(', ')}` : '';

    return joinBlocks([
        header,
        `${renderVisibility(node)}${abstractPrefix}${keyword} ${name}${renderExtends(node, 'Base', context, currentNamespace)}${implementedText}`,
        '{',
        members.length > 0 ? indentBlock(joinBlocks(members, '\n\n')) : '',
        '}',
    ].filter(Boolean), '\n');
}

function renderConstant(node: SmpXmlObject, context: CatalogueImportContext, currentNamespace: string, allowVisibility = true): string {
    const typeLink = getChild(node, 'Type') as SmpXmlObject | undefined;
    const header = renderHeader(node, context, { defaultId: `${currentNamespace}.${getAttribute(node, 'Name')}`, currentNamespace });
    return joinBlocks([
        header,
        `${renderVisibility(node, allowVisibility)}constant ${renderCatalogueReferenceText(typeLink, context, currentNamespace, 'constant type')} ${getAttribute(node, 'Name')}${renderDefaultValue(node, 'Value', context, currentNamespace, typeLink)}`,
    ], '\n');
}

function renderField(node: SmpXmlObject, context: CatalogueImportContext, currentNamespace: string, allowVisibility = true): string {
    const typeLink = getChild(node, 'Type') as SmpXmlObject | undefined;
    const header = renderHeader(node, context, { defaultId: `${currentNamespace}.${getAttribute(node, 'Name')}`, currentNamespace });
    const modifiers = [
        renderVisibility(node, allowVisibility).trim(),
        parseBooleanAttribute(node, 'Input') ? 'input' : '',
        parseBooleanAttribute(node, 'Output') ? 'output' : '',
        parseBooleanAttribute(node, 'State') === false ? 'transient' : '',
    ].filter(Boolean).join(' ');
    const prefix = modifiers ? `${modifiers} ` : '';

    return joinBlocks([
        header,
        `${prefix}field ${renderCatalogueReferenceText(typeLink, context, currentNamespace, 'field type')} ${getAttribute(node, 'Name')}${renderDefaultValue(node, 'Default', context, currentNamespace, typeLink)}`,
    ], '\n');
}

function renderProperty(node: SmpXmlObject, context: CatalogueImportContext, currentNamespace: string, allowVisibility = true): string {
    const typeLink = getChild(node, 'Type') as SmpXmlObject | undefined;
    const attachedField = getChild(node, 'AttachedField') as SmpXmlObject | undefined;
    const getRaises = getChildObjects(node, 'GetRaises').map(entry => renderCatalogueReferenceText(entry, context, currentNamespace, 'property getter exception'));
    const setRaises = getChildObjects(node, 'SetRaises').map(entry => renderCatalogueReferenceText(entry, context, currentNamespace, 'property setter exception'));
    const access = getAttribute(node, 'Access');
    const modifiers = [renderVisibility(node, allowVisibility).trim(), access].filter(Boolean).join(' ');
    const prefix = modifiers ? `${modifiers} ` : '';
    const header = renderHeader(node, context, {
        defaultId: `${currentNamespace}.${getAttribute(node, 'Name')}`,
        extraTags: getAttribute(node, 'Category') ? [`@category ${getAttribute(node, 'Category')}`] : [],
        currentNamespace,
    });
    const getRaisesText = getRaises.length > 0 ? ` get throws ${getRaises.join(', ')}` : '';
    const setRaisesText = setRaises.length > 0 ? ` set throws ${setRaises.join(', ')}` : '';
    const attachedFieldText = attachedField ? ` -> ${renderCatalogueReferenceText(attachedField, context, currentNamespace, 'attached field')}` : '';

    return joinBlocks([
        header,
        `${prefix}property ${renderCatalogueReferenceText(typeLink, context, currentNamespace, 'property type')} ${getAttribute(node, 'Name')}${getRaisesText}${setRaisesText}${attachedFieldText}`,
    ], '\n');
}

function renderOperation(node: SmpXmlObject, context: CatalogueImportContext, currentNamespace: string, allowVisibility = true): string {
    const parameters = getChildObjects(node, 'Parameter');
    const returnParameter = parameters.find(parameter => getAttribute(parameter, 'Direction') === 'return');
    const inputParameters = parameters.filter(parameter => getAttribute(parameter, 'Direction') !== 'return');
    const raisedExceptions = getChildObjects(node, 'RaisedException').map(entry => renderCatalogueReferenceText(entry, context, currentNamespace, 'raised exception'));

    const tags = [
        ...inputParameters
            .map(parameter => {
                const description = getChildText(parameter, 'Description');
                return description ? `@param ${getAttribute(parameter, 'Name')} ${description}` : undefined;
            })
            .filter((tag): tag is string => !!tag),
        ...(returnParameter
            ? [getChildText(returnParameter, 'Description')].map(description => description ? `@return ${description}` : undefined)
            : [])
            .filter((tag): tag is string => !!tag),
    ];
    const header = renderHeader(node, context, {
        defaultId: computeOperationDefaultId(node, currentNamespace),
        extraTags: tags,
        currentNamespace,
    });
    const renderedReturn = returnParameter
        ? renderReturnParameter(returnParameter, context, currentNamespace)
        : 'void';
    const renderedParameters = inputParameters.map(parameter => renderParameter(parameter, context, currentNamespace)).join(', ');
    const raisedExceptionsText = raisedExceptions.length > 0 ? ` throws ${raisedExceptions.join(', ')}` : '';

    return joinBlocks([
        header,
        `${renderVisibility(node, allowVisibility)}def ${renderedReturn} ${getAttribute(node, 'Name')}(${renderedParameters})${raisedExceptionsText}`,
    ], '\n');
}

function renderAssociation(node: SmpXmlObject, context: CatalogueImportContext, currentNamespace: string): string {
    const typeLink = getChild(node, 'Type') as SmpXmlObject | undefined;
    const header = renderHeader(node, context, { defaultId: `${currentNamespace}.${getAttribute(node, 'Name')}`, currentNamespace });
    return joinBlocks([
        header,
        `${renderVisibility(node)}association ${renderCatalogueReferenceText(typeLink, context, currentNamespace, 'association type')} ${getAttribute(node, 'Name')}`,
    ], '\n');
}

function renderContainer(node: SmpXmlObject, context: CatalogueImportContext, currentNamespace: string): string {
    const typeLink = getChild(node, 'Type') as SmpXmlObject | undefined;
    const defaultComponent = getChild(node, 'DefaultComponent') as SmpXmlObject | undefined;
    const header = renderHeader(node, context, { defaultId: `${currentNamespace}.${getAttribute(node, 'Name')}`, currentNamespace });
    const defaultComponentText = defaultComponent ? ` = ${renderCatalogueReferenceText(defaultComponent, context, currentNamespace, 'default component')}` : '';
    return joinBlocks([
        header,
        `container ${renderCatalogueReferenceText(typeLink, context, currentNamespace, 'container type')}${renderMultiplicity(node)} ${getAttribute(node, 'Name')}${defaultComponentText}`,
    ], '\n');
}

function renderReference(node: SmpXmlObject, context: CatalogueImportContext, currentNamespace: string): string {
    const typeLink = (getChild(node, 'Type') as SmpXmlObject | undefined) ?? (getChild(node, 'Interface') as SmpXmlObject | undefined);
    const header = renderHeader(node, context, { defaultId: `${currentNamespace}.${getAttribute(node, 'Name')}`, currentNamespace });
    return joinBlocks([
        header,
        `reference ${renderCatalogueReferenceText(typeLink, context, currentNamespace, 'reference type')}${renderMultiplicity(node)} ${getAttribute(node, 'Name')}`,
    ], '\n');
}

function renderRealization(node: SmpXmlObject, context: CatalogueImportContext, currentNamespace: string): string {
    const interfaceLink = getChild(node, 'Interface') as SmpXmlObject | undefined;
    const header = renderHeader(node, context, { defaultId: `${currentNamespace}.${getAttribute(node, 'Name')}`, currentNamespace });
    return joinBlocks([
        header,
        `realization ${renderCatalogueReferenceText(interfaceLink, context, currentNamespace, 'realization interface')} ${getAttribute(node, 'Name')}`,
    ], '\n');
}

function renderEntryPoint(node: SmpXmlObject, context: CatalogueImportContext, currentNamespace: string): string {
    const inputs = getChildObjects(node, 'Input').map(entry => renderCatalogueReferenceText(entry, context, currentNamespace, 'entrypoint input'));
    const outputs = getChildObjects(node, 'Output').map(entry => renderCatalogueReferenceText(entry, context, currentNamespace, 'entrypoint output'));
    const header = renderHeader(node, context, { defaultId: `${currentNamespace}.${getAttribute(node, 'Name')}`, currentNamespace });
    if (inputs.length === 0 && outputs.length === 0) {
        return joinBlocks([header, `entrypoint ${getAttribute(node, 'Name')}`], '\n');
    }

    return joinBlocks([
        header,
        `entrypoint ${getAttribute(node, 'Name')}`,
        '{',
        ...inputs.map(input => indentBlock(`in ${input}`)),
        ...outputs.map(output => indentBlock(`out ${output}`)),
        '}',
    ], '\n');
}

function renderEventSink(node: SmpXmlObject, context: CatalogueImportContext, currentNamespace: string): string {
    const typeLink = getChild(node, 'Type') as SmpXmlObject | undefined;
    const header = renderHeader(node, context, { defaultId: `${currentNamespace}.${getAttribute(node, 'Name')}`, currentNamespace });
    return joinBlocks([
        header,
        `eventsink ${renderCatalogueReferenceText(typeLink, context, currentNamespace, 'event sink type')} ${getAttribute(node, 'Name')}`,
    ], '\n');
}

function renderEventSource(node: SmpXmlObject, context: CatalogueImportContext, currentNamespace: string): string {
    const typeLink = getChild(node, 'Type') as SmpXmlObject | undefined;
    const header = renderHeader(node, context, {
        defaultId: `${currentNamespace}.${getAttribute(node, 'Name')}`,
        extraTags: parseBooleanAttribute(node, 'Multicast') === false ? ['@singlecast'] : [],
        currentNamespace,
    });
    return joinBlocks([
        header,
        `eventsource ${renderCatalogueReferenceText(typeLink, context, currentNamespace, 'event source type')} ${getAttribute(node, 'Name')}`,
    ], '\n');
}

function renderParameter(node: SmpXmlObject, context: CatalogueImportContext, currentNamespace: string): string {
    const typeLink = getChild(node, 'Type') as SmpXmlObject | undefined;
    const attributes = renderAppliedAttributes(getChildObjects(node, 'Metadata'), context, currentNamespace);
    const direction = getAttribute(node, 'Direction');
    const attributePrefix = attributes.length > 0 ? `${attributes.join(' ')} ` : '';
    const prefix = direction && direction !== 'return' ? `${direction} ` : '';
    const renderedDefault = renderDefaultValue(node, 'Default', context, currentNamespace, typeLink);
    return `${attributePrefix}${prefix}${renderCatalogueReferenceText(typeLink, context, currentNamespace, 'parameter type')} ${getAttribute(node, 'Name')}${renderedDefault}`;
}

function renderReturnParameter(node: SmpXmlObject, context: CatalogueImportContext, currentNamespace: string): string {
    const typeLink = getChild(node, 'Type') as SmpXmlObject | undefined;
    const attributes = renderAppliedAttributes(getChildObjects(node, 'Metadata'), context, currentNamespace);
    const name = getAttribute(node, 'Name');
    const attributePrefix = attributes.length > 0 ? `${attributes.join(' ')} ` : '';
    const nameSuffix = name && name !== 'return' ? ` ${name}` : '';
    return `${attributePrefix}${renderCatalogueReferenceText(typeLink, context, currentNamespace, 'return type')}${nameSuffix}`;
}

function renderDefaultValue(node: SmpXmlObject, childName: string, context: CatalogueImportContext, currentNamespace: string, expectedType?: SmpXmlObject): string {
    const child = getChild(node, childName);
    if (!child || !isXmlElement(child)) {
        return '';
    }
    return ` = ${renderCatalogueValue(child, context, currentNamespace, expectedType)}`;
}

function renderCatalogueValue(value: SmpXmlObject, context: CatalogueImportContext, currentNamespace: string, expectedTypeLink?: SmpXmlObject): string {
    const valueType = getXsiTypeLocalName(value, 'Types:Value');
    const fieldPrefix = getAttribute(value, 'Field') ? `.${getAttribute(value, 'Field')} = ` : '';
    const resolvedExpectedType = resolveTypeInfo(expectedTypeLink, context);
    switch (valueType) {
        case 'BoolValue':
            return `${fieldPrefix}${getAttribute(value, 'Value') === 'true' ? 'true' : 'false'}`;
        case 'Char8Value':
            return `${fieldPrefix}${renderCharacterLiteral(getAttribute(value, 'Value') ?? '')}`;
        case 'String8Value':
            if ((getAttribute(value, 'Value') ?? '') === 'nullptr' && canRenderNullptr(resolvedExpectedType)) {
                return `${fieldPrefix}nullptr`;
            }
            return `${fieldPrefix}${renderStringLiteral(getAttribute(value, 'Value') ?? '')}`;
        case 'DateTimeValue':
            return `${fieldPrefix}${renderStringLiteral(getAttribute(value, 'Value') ?? '')}`;
        case 'DurationValue':
            return `${fieldPrefix}${renderStringLiteral(getAttribute(value, 'Value') ?? '')}`;
        case 'EnumerationValue': {
            const literal = getAttribute(value, 'Literal');
            const expectedName = expectedTypeLink ? renderCatalogueReferenceText(expectedTypeLink, context, currentNamespace, 'enumeration type') : undefined;
            if (literal && expectedName) {
                return `${fieldPrefix}${expectedName}.${literal}`;
            }
            if (resolvedExpectedType && getXsiTypeLocalName(resolvedExpectedType.node) === 'Enumeration') {
                const matchingLiteral = getChildObjects(resolvedExpectedType.node, 'Literal')
                    .find(entry => getAttribute(entry, 'Value') === getAttribute(value, 'Value'));
                if (matchingLiteral && expectedName) {
                    return `${fieldPrefix}${expectedName}.${getAttribute(matchingLiteral, 'Name')}`;
                }
            }
            if (literal && isValidBareIdentifier(literal)) {
                return `${fieldPrefix}${literal}`;
            }
            return `${fieldPrefix}${getAttribute(value, 'Value') ?? '0'}lit`;
        }
        case 'Float32Value':
            return `${fieldPrefix}${renderCatalogueFloatLiteral(getAttribute(value, 'Value'), true)}`;
        case 'Float64Value':
            return `${fieldPrefix}${renderCatalogueFloatLiteral(getAttribute(value, 'Value'), false)}`;
        case 'Int8Value':
        case 'Int16Value':
        case 'Int32Value':
        case 'Int64Value':
            return `${fieldPrefix}${getAttribute(value, 'Value') ?? '0'}`;
        case 'UInt8Value':
        case 'UInt16Value':
        case 'UInt32Value':
            return `${fieldPrefix}${getAttribute(value, 'Value') ?? '0'}U`;
        case 'UInt64Value':
            return `${fieldPrefix}${getAttribute(value, 'Value') ?? '0'}UL`;
        case 'ArrayValue':
        case 'BoolArrayValue':
        case 'Char8ArrayValue':
        case 'DateTimeArrayValue':
        case 'DurationArrayValue':
        case 'EnumerationArrayValue':
        case 'Float32ArrayValue':
        case 'Float64ArrayValue':
        case 'Int16ArrayValue':
        case 'Int32ArrayValue':
        case 'Int64ArrayValue':
        case 'Int8ArrayValue':
        case 'String8ArrayValue':
        case 'UInt16ArrayValue':
        case 'UInt32ArrayValue':
        case 'UInt64ArrayValue':
        case 'UInt8ArrayValue': {
            const startIndex = getChildText(value, 'StartIndex');
            if (startIndex && startIndex !== '0') {
                context.warnings.push(`Catalogue array default value StartIndex='${startIndex}' is not representable in XSMP and was discarded.`);
            }
            const inferredItemValueType = inferArrayItemValueType(valueType);
            const itemType = resolvedExpectedType && getXsiTypeLocalName(resolvedExpectedType.node) === 'Array'
                ? getChild(resolvedExpectedType.node, 'ItemType') as SmpXmlObject | undefined
                : undefined;
            const items = getChildObjects(value, 'ItemValue').map(item => renderCatalogueValue(
                inferredItemValueType && !getAttribute(item, 'xsi:type')
                    ? { ...item, '@xsi:type': inferredItemValueType }
                    : item,
                context,
                currentNamespace,
                itemType,
            ));
            return `${fieldPrefix}{${items.join(', ')}}`;
        }
        case 'StructureValue': {
            const fieldInfos = getStructureFieldInfos(resolvedExpectedType?.node);
            let positionalIndex = 0;
            const items = getChildObjects(value, 'FieldValue').map(item => {
                const designatedField = getAttribute(item, 'Field');
                const expectedFieldType = designatedField
                    ? fieldInfos.find(field => field.name === designatedField)?.type
                    : fieldInfos[positionalIndex++]?.type;
                return renderCatalogueValue(item, context, currentNamespace, expectedFieldType);
            });
            return `${fieldPrefix}{${items.join(', ')}}`;
        }
        case 'Value':
            return `${fieldPrefix}nullptr`;
        default:
            context.warnings.push(`Unsupported catalogue value '${valueType}'.`);
            return `${fieldPrefix}nullptr`;
    }
}

function resolveTypeInfo(typeLink: SmpXmlObject | undefined, context: CatalogueImportContext): TypeInfo | undefined {
    if (!typeLink) {
        return undefined;
    }
    const hrefId = getAttribute(typeLink, 'xlink:href');
    const fragment = hrefId?.includes('#') ? hrefId.slice(hrefId.indexOf('#') + 1) : undefined;
    const title = getAttribute(typeLink, 'xlink:title');
    const localTypeInfo = resolveLocalTypeInfo(fragment, title, context);
    if (localTypeInfo) {
        return localTypeInfo;
    }
    const externalTypeInfo = context.referenceResolver.resolveTypeInfo(typeLink, context.warnings, 'type');
    if (externalTypeInfo) {
        return externalTypeInfo;
    }
    return undefined;
}

function resolveLocalTypeInfo(
    fragment: string | undefined,
    title: string | undefined,
    context: CatalogueImportContext,
): TypeInfo | undefined {
    if (fragment && context.typeById.has(fragment)) {
        return context.typeById.get(fragment);
    }
    if (fragment && context.typeByQualifiedName.has(fragment)) {
        return context.typeByQualifiedName.get(fragment);
    }
    if (!title) {
        return undefined;
    }
    const exact = context.typeByQualifiedName.get(title);
    if (exact) {
        return exact;
    }
    return [...context.typeByQualifiedName.values()].find(candidate => candidate.qname.endsWith(`.${title}`) || candidate.qname === title);
}

function getStructureFieldInfos(node: SmpXmlObject | undefined): StructureFieldInfo[] {
    if (!node) {
        return [];
    }
    const typeName = getXsiTypeLocalName(node);
    if (typeName === 'Class' || typeName === 'Exception' || typeName === 'Structure' || typeName === 'Model' || typeName === 'Service') {
        return getChildObjects(node, 'Field').map(field => ({
            name: getAttribute(field, 'Name') ?? '',
            type: getChild(field, 'Type') as SmpXmlObject | undefined,
        }));
    }
    return [];
}

function renderAppliedAttributes(metadata: readonly SmpXmlObject[], context: CatalogueImportContext, currentNamespace: string | undefined): string[] {
    return metadata.map(entry => renderAppliedAttribute(entry, context, currentNamespace)).filter((value): value is string => !!value);
}

function renderAppliedAttribute(metadata: SmpXmlObject, context: CatalogueImportContext, currentNamespace: string | undefined): string | undefined {
    if (getXsiTypeLocalName(metadata) !== 'Attribute') {
        context.warnings.push(`Unsupported metadata entry '${getAttribute(metadata, 'xsi:type') ?? 'unknown'}' was ignored.`);
        return undefined;
    }
    const typeLink = getChild(metadata, 'Type') as SmpXmlObject | undefined;
    const attributeName = renderCatalogueReferenceText(typeLink, context, currentNamespace, 'attribute');
    const value = getChild(metadata, 'Value');
    if (!isXmlElement(value)) {
        return `@${attributeName}`;
    }

    const attributeTypeInfo = resolveTypeInfo(typeLink, context);
    const attributeUnderlyingType = attributeTypeInfo ? getChild(attributeTypeInfo.node, 'Type') as SmpXmlObject | undefined : undefined;
    const renderedValue = renderCatalogueValue(value, context, currentNamespace ?? attributeTypeInfo?.namespace ?? '', attributeUnderlyingType);
    const literal = getAttribute(value, 'Literal');
    if (!attributeUnderlyingType && attributeName === 'View' && literal) {
        return `@${attributeName}(ViewKind.${literal})`;
    }
    const defaultValue = attributeTypeInfo ? getChild(attributeTypeInfo.node, 'Default') as SmpXmlObject | undefined : undefined;
    const renderedDefault = defaultValue && attributeUnderlyingType
        ? renderCatalogueValue(defaultValue, context, currentNamespace ?? attributeTypeInfo?.namespace ?? '', attributeUnderlyingType)
        : undefined;
    if (renderedDefault && renderedDefault === renderedValue) {
        return `@${attributeName}`;
    }
    return `@${attributeName}(${renderedValue})`;
}

function renderHeader(node: SmpXmlObject, context: CatalogueImportContext, options: { defaultId?: string; extraTags?: readonly string[]; currentNamespace?: string }): string {
    const description = getChildText(node, 'Description');
    const tags = [...(options.extraTags ?? [])];
    const id = getAttribute(node, 'Id');
    if (id && options.defaultId && id !== options.defaultId) {
        tags.push(`@id ${id}`);
    }
    const comment = renderDocComment(description, tags);
    const attributes = renderAppliedAttributes(getChildObjects(node, 'Metadata'), context, options.currentNamespace);
    return joinBlocks([comment, ...attributes], '\n');
}

function renderTypeTags(node: SmpXmlObject): string[] {
    const tags: string[] = [];
    const uuid = getAttribute(node, 'Uuid');
    if (uuid) {
        tags.push(`@uuid ${uuid}`);
    }
    const unit = getAttribute(node, 'Unit');
    if (unit) {
        tags.push(`@unit ${unit}`);
    }
    const allowMultiple = parseBooleanAttribute(node, 'AllowMultiple');
    if (allowMultiple) {
        tags.push('@allowMultiple');
    }
    for (const usage of asArray(getChild(node, 'Usage')).filter((value): value is string => typeof value === 'string')) {
        tags.push(`@usage ${usage}`);
    }
    if (getXsiTypeLocalName(node) === 'AttributeType' && getAttribute(node, 'Name') === 'Static' && !tags.includes('@usage Constant')) {
        tags.push('@usage Constant');
    }
    const platform = getChildObjects(node, 'Platform').find(entry => getAttribute(entry, 'Name') === 'cpp');
    if (platform) {
        const nativeType = getAttribute(platform, 'Type');
        const nativeNamespace = getAttribute(platform, 'Namespace');
        const nativeLocation = getAttribute(platform, 'Location');
        if (nativeType) {
            tags.push(`@type ${nativeType}`);
        }
        if (nativeNamespace) {
            tags.push(`@namespace ${nativeNamespace}`);
        }
        if (nativeLocation) {
            tags.push(`@location ${nativeLocation}`);
        }
    }
    return tags;
}

function renderVisibility(node: SmpXmlObject, allowVisibility = true): string {
    if (!allowVisibility) {
        return '';
    }
    const visibility = getAttribute(node, 'Visibility');
    return visibility ? `${visibility} ` : '';
}

function canRenderNullptr(typeInfo: TypeInfo | undefined): boolean {
    if (!typeInfo) {
        return false;
    }
    switch (getXsiTypeLocalName(typeInfo.node)) {
        case 'Array':
        case 'AttributeType':
        case 'Enumeration':
        case 'Float':
        case 'Integer':
        case 'PrimitiveType':
        case 'String':
        case 'Structure':
            return false;
        default:
            return true;
    }
}

function renderExtends(node: SmpXmlObject, childName: string, context: CatalogueImportContext, currentNamespace: string): string {
    const child = getChild(node, childName);
    if (!isXmlElement(child)) {
        return '';
    }
    return ` extends ${renderCatalogueReferenceText(child, context, currentNamespace, 'base type')}`;
}

function renderIntegerRange(node: SmpXmlObject): string {
    const minimum = getAttribute(node, 'Minimum');
    const maximum = getAttribute(node, 'Maximum');
    if (minimum === undefined && maximum === undefined) {
        return '';
    }
    return ` in ${minimum ?? '*'} ... ${maximum ?? '*'}`;
}

function renderFloatRange(node: SmpXmlObject): string {
    const minimum = getAttribute(node, 'Minimum');
    const maximum = getAttribute(node, 'Maximum');
    if (minimum === undefined && maximum === undefined) {
        return '';
    }

    const minInclusive = parseBooleanAttribute(node, 'MinInclusive');
    const maxInclusive = parseBooleanAttribute(node, 'MaxInclusive');
    const operator = `${minInclusive === false ? '<' : '.'}.${maxInclusive === false ? '<' : '.'}`;
    return ` in ${minimum ?? '*'} ${operator} ${maximum ?? '*'}`;
}

function renderMultiplicity(node: SmpXmlObject): string {
    const one = BigInt(1);
    const zero = BigInt(0);
    const minusOne = BigInt(-1);
    const lower = parseBigIntAttribute(node, 'Lower') ?? one;
    const upper = parseBigIntAttribute(node, 'Upper') ?? one;
    if (lower === one && upper === one) {
        return '';
    }
    if (lower === zero && upper === one) {
        return '?';
    }
    if (lower === zero && upper === minusOne) {
        return '*';
    }
    if (lower === one && upper === minusOne) {
        return '+';
    }
    if (lower === upper) {
        return `[${lower}]`;
    }
    if (upper === minusOne) {
        return `[${lower} ... *]`;
    }
    return `[${lower} ... ${upper}]`;
}

function computeOperationDefaultId(node: SmpXmlObject, currentNamespace: string): string {
    const parameterTypes = getChildObjects(node, 'Parameter')
        .filter(parameter => getAttribute(parameter, 'Direction') !== 'return')
        .map(parameter => {
            const typeLink = getChild(parameter, 'Type') as SmpXmlObject | undefined;
            return getAttribute(typeLink ?? {}, 'xlink:title') ?? 'Unknown';
        });
    const suffix = parameterTypes.length > 0 ? `-${parameterTypes.join('-')}` : '';
    return `${currentNamespace}.${getAttribute(node, 'Name')}${suffix}`;
}

function isXmlElement(value: unknown): value is SmpXmlObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidBareIdentifier(value: string): boolean {
    return /^[_A-Za-z]\w*$/u.test(value);
}

function renderCatalogueFloatLiteral(value: string | undefined, singlePrecision: boolean): string {
    const normalized = value && /[.eE]/u.test(value) ? value : `${value ?? '0'}.0`;
    return singlePrecision ? `${normalized}f` : normalized;
}

function inferArrayItemValueType(valueType: string): string | undefined {
    if (valueType === 'ArrayValue') {
        return undefined;
    }
    if (valueType.endsWith('ArrayValue')) {
        return `Types:${valueType.slice(0, -'ArrayValue'.length)}Value`;
    }
    return undefined;
}
