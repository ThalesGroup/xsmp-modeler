import type { WorkspaceFolder } from 'vscode-languageserver-protocol';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { URI } from 'vscode-uri';
import type { XsmpSharedServices } from '../../xsmp-module.js';
import {
    detectSmpImportKind,
    extractHrefFragment,
    getAttribute,
    getChildObjects,
    parseSmpXml,
    type ParsedSmpXmlDocument,
    type SmpImportKind,
    type SmpXmlObject,
} from './shared.js';
import type { SmpWorkspaceIndex } from '../workspace-index.js';

const ignoredSearchDirectories = new Set([
    '.git',
    '.tsbuildinfo',
    'coverage',
    'lib',
    'node_modules',
    'out',
]);

export interface SmpImportedTypeInfo {
    readonly qname: string;
    readonly namespace: string;
    readonly node: SmpXmlObject;
}

interface SmpExternalDocumentIndex {
    readonly kind: SmpImportKind;
    readonly documentName?: string;
    readonly referenceTextById: Map<string, string>;
    readonly typeById: Map<string, SmpImportedTypeInfo>;
    readonly typeByQualifiedName: Map<string, SmpImportedTypeInfo>;
}

export class SmpExternalReferenceResolver {
    protected readonly inputDirectory: string;
    protected readonly searchRoots: readonly string[];
    protected readonly documentIndexCache = new Map<string, SmpExternalDocumentIndex | null>();
    protected workspaceFileIndex: Map<string, string[]> | undefined;
    protected readonly workspaceIndex?: SmpWorkspaceIndex;
    protected readonly ambiguousHrefWarnings = new Set<string>();
    protected readonly mismatchedKindWarnings = new Set<string>();
    protected readonly unsupportedHrefWarnings = new Set<string>();
    protected readonly unresolvedIdWarnings = new Set<string>();

    constructor(services: XsmpSharedServices, inputPath: string, workspaceIndex?: SmpWorkspaceIndex) {
        this.inputDirectory = path.dirname(path.resolve(inputPath));
        this.searchRoots = collectSearchRoots(services.workspace.WorkspaceManager.workspaceFolders, this.inputDirectory);
        this.workspaceIndex = workspaceIndex;
    }

    resolveReferenceText(
        href: string | undefined,
        fragment: string | undefined,
        title: string | undefined,
        warnings: string[],
        fallbackLabel: string,
    ): string | undefined {
        const typeInfo = this.resolveTypeInfoFromParts(href, fragment, title, warnings, fallbackLabel);
        if (typeInfo) {
            return typeInfo.qname;
        }

        const index = this.resolveExternalDocumentIndex(href, warnings, fallbackLabel);
        if (!index) {
            return undefined;
        }

        if (fragment && index.referenceTextById.has(fragment)) {
            return index.referenceTextById.get(fragment);
        }
        if (title && index.referenceTextById.has(title)) {
            return index.referenceTextById.get(title);
        }

        if (fragment) {
            this.warnUnresolvedId(href, fragment, warnings, fallbackLabel);
        }
        return undefined;
    }

    resolveTypeInfo(
        link: SmpXmlObject | undefined,
        warnings: string[],
        fallbackLabel: string,
    ): SmpImportedTypeInfo | undefined {
        if (!link) {
            return undefined;
        }
        const href = getAttribute(link, 'xlink:href');
        const fragment = extractHrefFragment(href);
        const title = getAttribute(link, 'xlink:title');
        return this.resolveTypeInfoFromParts(href, fragment, title, warnings, fallbackLabel);
    }

    resolveDocumentName(
        fileReference: string | undefined,
        warnings: string[],
        fallbackLabel: string,
        expectedKinds?: readonly SmpImportKind[],
    ): string | undefined {
        const index = this.resolveExternalDocumentIndex(fileReference, warnings, fallbackLabel, expectedKinds);
        if (index?.documentName) {
            return index.documentName;
        }
        return undefined;
    }

    protected resolveTypeInfoFromParts(
        href: string | undefined,
        fragment: string | undefined,
        title: string | undefined,
        warnings: string[],
        fallbackLabel: string,
    ): SmpImportedTypeInfo | undefined {
        const index = this.resolveExternalDocumentIndex(href, warnings, fallbackLabel);
        if (!index) {
            return undefined;
        }

        if (fragment && index.typeById.has(fragment)) {
            return index.typeById.get(fragment);
        }
        if (fragment && index.typeByQualifiedName.has(fragment)) {
            return index.typeByQualifiedName.get(fragment);
        }
        if (title) {
            const exact = index.typeByQualifiedName.get(title);
            if (exact) {
                return exact;
            }
            const suffixMatch = [...index.typeByQualifiedName.values()].find(candidate =>
                candidate.qname === title || candidate.qname.endsWith(`.${title}`)
            );
            if (suffixMatch) {
                return suffixMatch;
            }
        }
        return undefined;
    }

    protected warnUnresolvedId(
        href: string | undefined,
        fragment: string,
        warnings: string[],
        fallbackLabel: string,
    ): void {
        const key = `${href ?? '__missing__'}#${fragment}`;
        if (this.unresolvedIdWarnings.has(key)) {
            return;
        }
        this.unresolvedIdWarnings.add(key);
        warnings.push(`Could not resolve external ${fallbackLabel} id '${fragment}' from '${href ?? '__missing__'}'; falling back to title or fragment text.`);
    }

    protected resolveExternalDocumentIndex(
        href: string | undefined,
        warnings: string[],
        fallbackLabel: string,
        expectedKinds?: readonly SmpImportKind[],
    ): SmpExternalDocumentIndex | undefined {
        const externalPath = this.resolveExternalDocumentPath(href, warnings, fallbackLabel);
        if (!externalPath) {
            return undefined;
        }

        const cachedIndex = this.workspaceIndex?.getCachedExternalDocumentIndex(externalPath) as SmpExternalDocumentIndex | null | undefined;
        if (cachedIndex !== undefined) {
            return cachedIndex ?? undefined;
        }
        if (this.documentIndexCache.has(externalPath)) {
            return this.documentIndexCache.get(externalPath) ?? undefined;
        }

        let parsedDocument: ParsedSmpXmlDocument;
        try {
            parsedDocument = parseSmpXml(fs.readFileSync(externalPath, 'utf-8'));
        } catch {
            this.documentIndexCache.set(externalPath, null);
            this.workspaceIndex?.setCachedExternalDocumentIndex(externalPath, null);
            return undefined;
        }

        const kind = detectSmpImportKind(parsedDocument);
        if (!kind) {
            const warningKey = `${externalPath}:${fallbackLabel}`;
            if (!this.unsupportedHrefWarnings.has(warningKey)) {
                this.unsupportedHrefWarnings.add(warningKey);
                warnings.push(`External ${fallbackLabel} file '${externalPath}' is not a supported SMP import document; falling back to title or fragment text.`);
            }
            this.documentIndexCache.set(externalPath, null);
            this.workspaceIndex?.setCachedExternalDocumentIndex(externalPath, null);
            return undefined;
        }
        if (expectedKinds && !expectedKinds.includes(kind)) {
            const warningKey = `${externalPath}:${fallbackLabel}:${expectedKinds.join('|')}`;
            if (!this.mismatchedKindWarnings.has(warningKey)) {
                this.mismatchedKindWarnings.add(warningKey);
                warnings.push(`External ${fallbackLabel} file '${externalPath}' is a ${kind} document, expected ${expectedKinds.join(' or ')}; falling back to title or fragment text.`);
            }
            return undefined;
        }

        const index = buildExternalDocumentIndex(kind, parsedDocument.root);
        this.documentIndexCache.set(externalPath, index);
        this.workspaceIndex?.setCachedExternalDocumentIndex(externalPath, index);
        return index;
    }

    protected resolveExternalDocumentPath(
        href: string | undefined,
        warnings: string[],
        fallbackLabel: string,
    ): string | undefined {
        const filePart = extractExternalFilePart(href);
        if (!filePart) {
            return undefined;
        }

        if (looksLikeRemoteUri(filePart)) {
            return undefined;
        }

        const normalizedPart = normalizeSearchPath(filePart);
        const directCandidates = new Set<string>();
        if (path.isAbsolute(normalizedPart)) {
            directCandidates.add(path.resolve(normalizedPart));
        } else {
            directCandidates.add(path.resolve(this.inputDirectory, normalizedPart));
            for (const root of this.searchRoots) {
                directCandidates.add(path.resolve(root, normalizedPart));
            }
        }

        for (const candidate of directCandidates) {
            if (isFile(candidate)) {
                return candidate;
            }
        }

        const basename = path.basename(normalizedPart);
        const candidates = this.findWorkspaceCandidates(basename, normalizedPart);
        if (candidates.length === 0) {
            return undefined;
        }

        const selected = candidates[0];
        if (candidates.length > 1 && !this.ambiguousHrefWarnings.has(`${filePart}:${selected}`)) {
            this.ambiguousHrefWarnings.add(`${filePart}:${selected}`);
            warnings.push(`Multiple SMP files match external ${fallbackLabel} href '${filePart}'; using '${selected}'.`);
        }
        return selected;
    }

    protected findWorkspaceCandidates(basename: string, normalizedPart: string): string[] {
        if (this.workspaceIndex) {
            return this.workspaceIndex.findWorkspaceCandidates(basename, normalizedPart, this.inputDirectory);
        }
        const index = this.getWorkspaceFileIndex();
        const normalizedSuffix = normalizeForComparison(normalizedPart);
        return [...(index.get(basename) ?? [])]
            .filter(candidate => {
                if (!normalizedPart.includes(path.sep) && !normalizedPart.includes('/')) {
                    return true;
                }
                return normalizeForComparison(candidate).endsWith(normalizedSuffix);
            })
            .sort((left, right) => compareWorkspaceCandidates(left, right, this.inputDirectory));
    }

    protected getWorkspaceFileIndex(): Map<string, string[]> {
        if (this.workspaceFileIndex) {
            return this.workspaceFileIndex;
        }

        const index = new Map<string, string[]>();
        for (const root of this.searchRoots) {
            this.scanWorkspaceFiles(root, index);
        }
        this.workspaceFileIndex = index;
        return index;
    }

    protected scanWorkspaceFiles(root: string, index: Map<string, string[]>): void {
        if (!isDirectory(root)) {
            return;
        }

        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(root, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (!ignoredSearchDirectories.has(entry.name)) {
                    this.scanWorkspaceFiles(path.join(root, entry.name), index);
                }
                continue;
            }
            if (!entry.isFile()) {
                continue;
            }
            if (!entry.name.endsWith('.smpcat')
                && !entry.name.endsWith('.smpcfg')
                && !entry.name.endsWith('.smplnk')
                && !entry.name.endsWith('.smpasb')
                && !entry.name.endsWith('.smpsed')
                && !entry.name.endsWith('.smppkg')) {
                continue;
            }

            const candidate = path.join(root, entry.name);
            const existing = index.get(entry.name);
            if (existing) {
                if (!existing.includes(candidate)) {
                    existing.push(candidate);
                }
            } else {
                index.set(entry.name, [candidate]);
            }
        }
    }
}

function buildExternalDocumentIndex(kind: SmpImportKind, root: SmpXmlObject): SmpExternalDocumentIndex {
    switch (kind) {
        case 'catalogue':
            return buildExternalCatalogueIndex(root);
        case 'configuration':
            return buildExternalConfigurationIndex(root);
        case 'linkbase':
            return buildExternalSimpleNamedDocumentIndex(kind, root);
        case 'assembly':
            return buildExternalSimpleNamedDocumentIndex(kind, root);
        case 'schedule':
            return buildExternalScheduleIndex(root);
    }
}

function buildExternalCatalogueIndex(root: SmpXmlObject): SmpExternalDocumentIndex {
    const { typeById, typeByQualifiedName } = collectCatalogueTypeInfos(getChildObjects(root, 'Namespace'));

    const referenceTextById = new Map<string, string>();
    for (const [id, info] of typeById) {
        referenceTextById.set(id, info.qname);
    }

    return createExternalDocumentIndex('catalogue', getAttribute(root, 'Name'), referenceTextById, typeById, typeByQualifiedName);
}

export function collectCatalogueTypeInfos(namespaces: readonly SmpXmlObject[]): {
    readonly typeById: Map<string, SmpImportedTypeInfo>;
    readonly typeByQualifiedName: Map<string, SmpImportedTypeInfo>;
} {
    const typeById = new Map<string, SmpImportedTypeInfo>();
    const typeByQualifiedName = new Map<string, SmpImportedTypeInfo>();
    for (const namespace of namespaces) {
        indexCatalogueNamespaceTypes(namespace, [], typeById, typeByQualifiedName);
    }
    return { typeById, typeByQualifiedName };
}

function indexCatalogueNamespaceTypes(
    namespace: SmpXmlObject,
    namespaceParts: readonly string[],
    typeById: Map<string, SmpImportedTypeInfo>,
    typeByQualifiedName: Map<string, SmpImportedTypeInfo>,
): void {
    const name = getAttribute(namespace, 'Name');
    if (!name) {
        return;
    }

    const nextParts = [...namespaceParts, name];
    const namespaceName = nextParts.join('.');
    for (const type of getChildObjects(namespace, 'Type')) {
        const typeName = getAttribute(type, 'Name');
        if (!typeName) {
            continue;
        }
        const qname = `${namespaceName}.${typeName}`;
        const info: SmpImportedTypeInfo = {
            qname,
            namespace: namespaceName,
            node: type,
        };
        typeByQualifiedName.set(qname, info);
        const id = getAttribute(type, 'Id');
        if (id) {
            typeById.set(id, info);
        }
    }

    for (const nested of getChildObjects(namespace, 'Namespace')) {
        indexCatalogueNamespaceTypes(nested, nextParts, typeById, typeByQualifiedName);
    }
}

function buildExternalConfigurationIndex(root: SmpXmlObject): SmpExternalDocumentIndex {
    const referenceTextById = new Map<string, string>();
    const name = getAttribute(root, 'Name');
    const id = getAttribute(root, 'Id');
    addNamedReference(referenceTextById, name, id);
    return createExternalDocumentIndex('configuration', name, referenceTextById);
}

function buildExternalSimpleNamedDocumentIndex(kind: SmpImportKind, root: SmpXmlObject): SmpExternalDocumentIndex {
    const referenceTextById = new Map<string, string>();
    const name = getAttribute(root, 'Name');
    const id = getAttribute(root, 'Id');
    addNamedReference(referenceTextById, name, id);
    return createExternalDocumentIndex(kind, name, referenceTextById);
}

function buildExternalScheduleIndex(root: SmpXmlObject): SmpExternalDocumentIndex {
    const referenceTextById = new Map<string, string>();
    const scheduleName = getAttribute(root, 'Name');
    const scheduleId = getAttribute(root, 'Id');
    addNamedReference(referenceTextById, scheduleName, scheduleId);

    for (const task of getChildObjects(root, 'Task')) {
        const taskName = getAttribute(task, 'Name');
        if (!taskName) {
            continue;
        }
        const qualifiedTaskName = scheduleName ? `${scheduleName}.${taskName}` : taskName;
        const taskId = getAttribute(task, 'Id');
        if (taskId) {
            referenceTextById.set(taskId, qualifiedTaskName);
        }
        referenceTextById.set(taskName, qualifiedTaskName);
    }

    return createExternalDocumentIndex('schedule', scheduleName, referenceTextById);
}

function addNamedReference(referenceTextById: Map<string, string>, name: string | undefined, id: string | undefined): void {
    if (id && name) {
        referenceTextById.set(id, name);
    }
    if (name) {
        referenceTextById.set(name, name);
    }
}

function createExternalDocumentIndex(
    kind: SmpImportKind,
    documentName: string | undefined,
    referenceTextById: Map<string, string>,
    typeById: Map<string, SmpImportedTypeInfo> = new Map(),
    typeByQualifiedName: Map<string, SmpImportedTypeInfo> = new Map(),
): SmpExternalDocumentIndex {
    return {
        kind,
        documentName,
        referenceTextById,
        typeById,
        typeByQualifiedName,
    };
}

function collectSearchRoots(workspaceFolders: readonly WorkspaceFolder[] | undefined, inputDirectory: string): readonly string[] {
    const searchRoots = new Set<string>([path.resolve(inputDirectory)]);
    for (const folder of workspaceFolders ?? []) {
        const uri = URI.parse(folder.uri);
        if (uri.scheme === 'file') {
            searchRoots.add(path.resolve(uri.fsPath));
        }
    }
    return [...searchRoots];
}

function extractExternalFilePart(href: string | undefined): string | undefined {
    if (!href || href.startsWith('#')) {
        return undefined;
    }
    const hashIndex = href.indexOf('#');
    return hashIndex >= 0 ? href.slice(0, hashIndex) : href;
}

function normalizeSearchPath(value: string): string {
    return value.replaceAll('/', path.sep).replaceAll('\\', path.sep);
}

function normalizeForComparison(value: string): string {
    return path.normalize(value).replaceAll('\\', '/');
}

function compareWorkspaceCandidates(left: string, right: string, inputDirectory: string): number {
    const leftDistance = path.relative(inputDirectory, left).split(path.sep).length;
    const rightDistance = path.relative(inputDirectory, right).split(path.sep).length;
    return leftDistance - rightDistance || left.localeCompare(right);
}

function looksLikeRemoteUri(value: string): boolean {
    return /^https?:\/\//iu.test(value);
}

function isDirectory(candidate: string): boolean {
    try {
        return fs.statSync(candidate).isDirectory();
    } catch {
        return false;
    }
}

function isFile(candidate: string): boolean {
    try {
        return fs.statSync(candidate).isFile();
    } catch {
        return false;
    }
}
