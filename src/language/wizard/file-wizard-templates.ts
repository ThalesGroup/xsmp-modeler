import { toXsmpIdentifier } from '../utils/path-utils.js';

export type XsmpStarterFileKind = 'catalogue' | 'configuration' | 'assembly' | 'link-base' | 'schedule';

export interface XsmpStarterFileTemplateOptions {
    readonly fileStem: string;
    readonly author: string;
    readonly date: string;
}

export interface XsmpStarterFileTemplate {
    readonly kind: XsmpStarterFileKind;
    readonly label: string;
    readonly extension: string;
    readonly fileName: string;
    readonly content: string;
}

interface XsmpStarterNaming {
    readonly fileStem: string;
    readonly namespaceSegment: string;
    readonly typeName: string;
    readonly instanceName: string;
    readonly qualifiedTypeName: string;
    readonly catalogueName: string;
    readonly configurationName: string;
    readonly assemblyName: string;
    readonly linkBaseName: string;
    readonly scheduleName: string;
}

const starterFileMetadata: Record<XsmpStarterFileKind, { label: string; extension: string }> = {
    catalogue: { label: 'Catalogue', extension: '.xsmpcat' },
    configuration: { label: 'Configuration', extension: '.xsmpcfg' },
    assembly: { label: 'Assembly', extension: '.xsmpasb' },
    'link-base': { label: 'Link Base', extension: '.xsmplnk' },
    schedule: { label: 'Schedule', extension: '.xsmpsed' },
};

export function getXsmpStarterFileKinds(): readonly XsmpStarterFileKind[] {
    return ['catalogue', 'configuration', 'assembly', 'link-base', 'schedule'];
}

export function getXsmpStarterFileLabel(kind: XsmpStarterFileKind): string {
    return starterFileMetadata[kind].label;
}

export function getXsmpStarterFileDefaultStem(kind: XsmpStarterFileKind): string {
    switch (kind) {
        case 'catalogue':
        case 'configuration':
        case 'assembly':
        case 'link-base':
        case 'schedule':
            return 'hello-world';
    }
}

export function createXsmpStarterFileTemplate(
    kind: XsmpStarterFileKind,
    options: XsmpStarterFileTemplateOptions,
): XsmpStarterFileTemplate {
    const naming = createStarterNaming(options.fileStem);
    const metadata = starterFileMetadata[kind];

    switch (kind) {
        case 'catalogue':
            return {
                kind,
                label: metadata.label,
                extension: metadata.extension,
                fileName: `${options.fileStem}${metadata.extension}`,
                content: createCatalogueTemplate(options, naming),
            };
        case 'configuration':
            return {
                kind,
                label: metadata.label,
                extension: metadata.extension,
                fileName: `${options.fileStem}${metadata.extension}`,
                content: createConfigurationTemplate(options, naming),
            };
        case 'assembly':
            return {
                kind,
                label: metadata.label,
                extension: metadata.extension,
                fileName: `${options.fileStem}${metadata.extension}`,
                content: createAssemblyTemplate(options, naming),
            };
        case 'link-base':
            return {
                kind,
                label: metadata.label,
                extension: metadata.extension,
                fileName: `${options.fileStem}${metadata.extension}`,
                content: createLinkBaseTemplate(options, naming),
            };
        case 'schedule':
            return {
                kind,
                label: metadata.label,
                extension: metadata.extension,
                fileName: `${options.fileStem}${metadata.extension}`,
                content: createScheduleTemplate(options, naming),
            };
    }
}

function createStarterNaming(fileStem: string): XsmpStarterNaming {
    const normalizedStem = stripStarterSuffixes(toXsmpIdentifier(fileStem).replace(/[^A-Za-z0-9_]/g, '_'));
    const namespaceSegment = normalizedStem.toLowerCase();
    const typeName = toPascalCase(normalizedStem);
    const instanceName = toCamelCase(typeName);
    const catalogueBase = normalizedStem.endsWith('_catalogue') ? normalizedStem : `${namespaceSegment}_catalogue`;
    return {
        fileStem,
        namespaceSegment,
        typeName,
        instanceName,
        qualifiedTypeName: `demo.${namespaceSegment}.${typeName}`,
        catalogueName: catalogueBase,
        configurationName: `${typeName}Config`,
        assemblyName: `${typeName}Assembly`,
        linkBaseName: `${typeName}Links`,
        scheduleName: `${typeName}Schedule`,
    };
}

function stripStarterSuffixes(value: string): string {
    return value
        .replace(/(?:_configuration|_config|_assembly|_links|_link_base|_linkbase|_schedule)$/i, '')
        || value;
}

function createCatalogueTemplate(
    options: XsmpStarterFileTemplateOptions,
    naming: XsmpStarterNaming,
): string {
    return `/**
 * Hello World catalogue.
 * @title Hello World Catalogue
 * @creator ${options.author}
 * @date ${options.date}
 */
catalogue ${naming.catalogueName}

namespace demo::${naming.namespaceSegment}
{
    /**
     * Hello World model.
     * @uuid \${uuid}
     */
    public model ${naming.typeName}
    {
        entrypoint run
    }
}
`;
}

function createConfigurationTemplate(
    options: XsmpStarterFileTemplateOptions,
    naming: XsmpStarterNaming,
): string {
    return `/**
 * Hello World configuration.
 * @title Hello World Configuration
 * @creator ${options.author}
 * @date ${options.date}
 */
configuration ${naming.configurationName}

/${naming.instanceName}: ${naming.qualifiedTypeName}
{
}
`;
}

function createAssemblyTemplate(
    options: XsmpStarterFileTemplateOptions,
    naming: XsmpStarterNaming,
): string {
    return `/**
 * Hello World assembly.
 * @title Hello World Assembly
 * @creator ${options.author}
 * @date ${options.date}
 */
assembly ${naming.assemblyName}

${naming.instanceName}: ${naming.qualifiedTypeName}
{
}
`;
}

function createLinkBaseTemplate(
    options: XsmpStarterFileTemplateOptions,
    naming: XsmpStarterNaming,
): string {
    return `/**
 * Hello World link base.
 * @title Hello World Link Base
 * @creator ${options.author}
 * @date ${options.date}
 */
link ${naming.linkBaseName} for ${naming.assemblyName}

/
{
}
`;
}

function createScheduleTemplate(
    options: XsmpStarterFileTemplateOptions,
    naming: XsmpStarterNaming,
): string {
    return `/**
 * Hello World schedule.
 * @title Hello World Schedule
 * @creator ${options.author}
 * @date ${options.date}
 */
schedule ${naming.scheduleName}

task Tick on ${naming.qualifiedTypeName}
{
    trig run
}

event Tick simulation "PT1S"
`;
}

function toPascalCase(value: string): string {
    return value
        .split(/[_\W]+/)
        .filter(segment => segment.length > 0)
        .map(segment => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join('');
}

function toCamelCase(value: string): string {
    return value.length > 0
        ? value.charAt(0).toLowerCase() + value.slice(1)
        : value;
}
