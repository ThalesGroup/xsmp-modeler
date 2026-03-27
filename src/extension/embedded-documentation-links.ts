export interface XsmpEmbeddedDocumentationTarget {
    readonly keyword: string;
    readonly page: string;
    readonly title: string;
}

interface XsmpEmbeddedDocumentationLanguageEntry {
    readonly page: string;
    readonly title: string;
    readonly keywords: ReadonlySet<string>;
}

const embeddedDocumentationByLanguage: Readonly<Partial<Record<string, XsmpEmbeddedDocumentationLanguageEntry>>> = {
    xsmpproject: createLanguageEntry(
        'languages/xsmpproject.md',
        'xsmp.project, profile and tool reference',
        ['project', 'using', 'source', 'dependency', 'profile', 'tool'],
    ),
    xsmpcat: createLanguageEntry(
        'languages/xsmpcat.md',
        'XSMP catalogue reference',
        [
            'catalogue',
            'namespace',
            'public',
            'protected',
            'private',
            'abstract',
            'input',
            'output',
            'transient',
            'readonly',
            'writeonly',
            'readwrite',
            'struct',
            'class',
            'exception',
            'interface',
            'model',
            'service',
            'array',
            'using',
            'integer',
            'float',
            'event',
            'string',
            'primitive',
            'native',
            'attribute',
            'enum',
            'constant',
            'field',
            'property',
            'def',
            'association',
            'container',
            'reference',
            'entrypoint',
            'eventsink',
            'eventsource',
            'throws',
            'get',
            'set',
            'in',
            'out',
            'inout',
            'extends',
            'implements',
        ],
    ),
    xsmpcfg: createLanguageEntry(
        'languages/xsmpcfg.md',
        'XSMP configuration reference',
        ['configuration', 'include', 'at', 'unsafe'],
    ),
    xsmpasb: createLanguageEntry(
        'languages/xsmpasb.md',
        'XSMP assembly reference',
        [
            'assembly',
            'configure',
            'subscribe',
            'property',
            'call',
            'event',
            'field',
            'interface',
            'link',
            'using',
            'config',
            'unsafe',
        ],
    ),
    xsmplnk: createLanguageEntry(
        'languages/xsmplnk.md',
        'XSMP link base reference',
        ['link', 'for', 'event', 'field', 'interface', 'unsafe'],
    ),
    xsmpsed: createLanguageEntry(
        'languages/xsmpsed.md',
        'XSMP schedule reference',
        [
            'schedule',
            'epoch',
            'mission',
            'task',
            'on',
            'call',
            'property',
            'transfer',
            'trig',
            'execute',
            'async',
            'emit',
            'event',
            'simulation',
            'zulu',
            'until',
            'using',
            'delay',
            'cycle',
            'repeat',
            'unsafe',
        ],
    ),
};

export function getEmbeddedDocumentationTarget(languageId: string, keyword: string): XsmpEmbeddedDocumentationTarget | undefined {
    const entry = embeddedDocumentationByLanguage[languageId];
    if (!entry) {
        return undefined;
    }

    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!entry.keywords.has(normalizedKeyword)) {
        return undefined;
    }

    return {
        keyword,
        page: entry.page,
        title: entry.title,
    };
}

function createLanguageEntry(page: string, title: string, keywords: readonly string[]): XsmpEmbeddedDocumentationLanguageEntry {
    return {
        page,
        title,
        keywords: new Set(keywords),
    };
}
