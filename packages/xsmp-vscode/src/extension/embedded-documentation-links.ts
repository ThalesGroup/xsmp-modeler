export interface XsmpEmbeddedDocumentationTarget {
    readonly keyword: string;
    readonly page: string;
    readonly title: string;
    readonly anchor?: string;
}

interface XsmpEmbeddedDocumentationLanguageEntry {
    readonly page: string;
    readonly title: string;
    readonly anchorsByKeyword: Readonly<Record<string, string | undefined>>;
}

const embeddedDocumentationByLanguage: Readonly<Partial<Record<string, XsmpEmbeddedDocumentationLanguageEntry>>> = {
    xsmpproject: createLanguageEntry(
        'languages/xsmpproject.md',
        'xsmp.project, profile and tool reference',
        {
            project: 'root-syntax',
            using: 'root-syntax',
            source: 'source',
            dependency: 'dependency',
            profile: 'profile',
            tool: 'tool',
        },
    ),
    xsmpcat: createLanguageEntry(
        'languages/xsmpcat.md',
        'XSMP catalogue reference',
        {
            catalogue: 'file-structure',
            namespace: 'namespaces',
            public: 'type-declarations',
            protected: 'type-declarations',
            private: 'type-declarations',
            abstract: 'type-declarations',
            input: 'field',
            output: 'field',
            transient: 'field',
            readonly: 'property',
            writeonly: 'property',
            readwrite: 'property',
            struct: 'struct',
            class: 'class',
            exception: 'exception',
            interface: 'interface',
            model: 'model',
            service: 'service',
            array: 'array',
            using: 'using',
            integer: 'integer',
            float: 'float',
            event: 'event',
            string: 'string',
            primitive: 'primitive',
            native: 'native',
            attribute: 'attribute',
            enum: 'enum',
            constant: 'constant',
            field: 'field',
            property: 'property',
            def: 'def',
            association: 'association',
            container: 'container',
            reference: 'reference',
            entrypoint: 'entrypoint',
            eventsink: 'eventsink',
            eventsource: 'eventsource',
            throws: 'def',
            get: 'property',
            set: 'property',
            in: 'def',
            out: 'def',
            inout: 'def',
            extends: 'type-declarations',
            implements: 'type-declarations',
        },
    ),
    xsmpcfg: createLanguageEntry(
        'languages/xsmpcfg.md',
        'XSMP configuration reference',
        {
            configuration: 'root-structure',
            include: 'include',
            at: 'include',
            unsafe: 'paths',
        },
    ),
    xsmpasb: createLanguageEntry(
        'languages/xsmpasb.md',
        'XSMP assembly reference',
        {
            assembly: 'root-structure',
            configure: 'configure-blocks',
            subscribe: 'global-event-subscriptions',
            property: 'property',
            call: 'call',
            event: 'event-link',
            field: 'field-link',
            interface: 'interface-link',
            link: 'local-links',
            using: 'sub-assembly-instances',
            config: 'sub-assembly-instances',
            unsafe: 'paths',
        },
    ),
    xsmplnk: createLanguageEntry(
        'languages/xsmplnk.md',
        'XSMP link base reference',
        {
            link: 'root-structure',
            for: 'root-structure',
            event: 'event-link',
            field: 'field-link',
            interface: 'interface-link',
            unsafe: 'paths',
        },
    ),
    xsmpsed: createLanguageEntry(
        'languages/xsmpsed.md',
        'XSMP schedule reference',
        {
            schedule: 'root-structure',
            epoch: 'epoch-event',
            mission: 'mission-event',
            task: 'tasks',
            on: 'tasks',
            call: 'call',
            property: 'property',
            transfer: 'transfer',
            trig: 'trig',
            execute: 'execute',
            async: 'emit',
            emit: 'emit',
            event: 'events',
            simulation: 'simulation-event',
            zulu: 'zulu-event',
            until: 'global-event-triggered-event',
            using: 'global-event-triggered-event',
            delay: 'global-event-triggered-event',
            cycle: 'global-event-triggered-event',
            repeat: 'global-event-triggered-event',
            unsafe: 'paths',
        },
    ),
};

export function getEmbeddedDocumentationTarget(
    languageId: string,
    keyword: string,
    lineText?: string,
): XsmpEmbeddedDocumentationTarget | undefined {
    const entry = embeddedDocumentationByLanguage[languageId];
    if (!entry) {
        return undefined;
    }

    const normalizedKeyword = keyword.trim().toLowerCase();
    const anchor = resolveAnchor(languageId, normalizedKeyword, lineText) ?? entry.anchorsByKeyword[normalizedKeyword];
    if (anchor === undefined) {
        return undefined;
    }

    return {
        keyword,
        page: entry.page,
        title: entry.title,
        anchor,
    };
}

function resolveAnchor(languageId: string, keyword: string, lineText?: string): string | undefined {
    if (!lineText) {
        return undefined;
    }

    const normalizedLine = lineText.toLowerCase();
    switch (languageId) {
        case 'xsmpasb':
            return resolveAssemblyAnchor(keyword, normalizedLine);
        case 'xsmplnk':
            return resolveLinkBaseAnchor(keyword, normalizedLine);
        case 'xsmpsed':
            return resolveScheduleAnchor(keyword, normalizedLine);
        default:
            return undefined;
    }
}

function resolveAssemblyAnchor(keyword: string, line: string): string | undefined {
    if (keyword === 'event' || keyword === 'field' || keyword === 'interface') {
        if (/\bevent\s+link\b/.test(line)) {
            return 'event-link';
        }
        if (/\bfield\s+link\b/.test(line)) {
            return 'field-link';
        }
        if (/\binterface\s+link\b/.test(line)) {
            return 'interface-link';
        }
    }
    if (keyword === 'link') {
        if (/\bevent\s+link\b/.test(line)) {
            return 'event-link';
        }
        if (/\bfield\s+link\b/.test(line)) {
            return 'field-link';
        }
        if (/\binterface\s+link\b/.test(line)) {
            return 'interface-link';
        }
    }
    if (keyword === 'using' || keyword === 'config') {
        if (/\busing\s+config\b/.test(line) || /\busing\s+link\b/.test(line)) {
            return 'sub-assembly-instances';
        }
    }
    return undefined;
}

function resolveLinkBaseAnchor(keyword: string, line: string): string | undefined {
    if (keyword === 'link') {
        if (/^\s*event\s+link\b/.test(line)) {
            return 'event-link';
        }
        if (/^\s*field\s+link\b/.test(line)) {
            return 'field-link';
        }
        if (/^\s*interface\s+link\b/.test(line)) {
            return 'interface-link';
        }
        if (/^\s*link\b/.test(line)) {
            return 'root-structure';
        }
    }
    if (keyword === 'event' && /^\s*event\s+link\b/.test(line)) {
        return 'event-link';
    }
    if (keyword === 'field' && /^\s*field\s+link\b/.test(line)) {
        return 'field-link';
    }
    if (keyword === 'interface' && /^\s*interface\s+link\b/.test(line)) {
        return 'interface-link';
    }
    return undefined;
}

function resolveScheduleAnchor(keyword: string, line: string): string | undefined {
    if (keyword === 'on') {
        if (/^\s*task\b.*\bon\b/.test(line)) {
            return 'tasks';
        }
        if (/^\s*event\b.*\bon\b/.test(line)) {
            return 'global-event-triggered-event';
        }
    }

    if (keyword === 'event' || keyword === 'cycle' || keyword === 'repeat') {
        if (/^\s*event\b.*\bmission\b/.test(line)) {
            return 'mission-event';
        }
        if (/^\s*event\b.*\bepoch\b/.test(line)) {
            return 'epoch-event';
        }
        if (/^\s*event\b.*\bsimulation\b/.test(line)) {
            return 'simulation-event';
        }
        if (/^\s*event\b.*\bzulu\b/.test(line)) {
            return 'zulu-event';
        }
        if (/^\s*event\b.*\bon\b/.test(line)) {
            return 'global-event-triggered-event';
        }
    }

    if (keyword === 'using' || keyword === 'delay' || keyword === 'until') {
        if (/^\s*event\b.*\bon\b/.test(line)) {
            return 'global-event-triggered-event';
        }
    }

    return undefined;
}

function createLanguageEntry(
    page: string,
    title: string,
    anchorsByKeyword: Readonly<Record<string, string | undefined>>,
): XsmpEmbeddedDocumentationLanguageEntry {
    return {
        page,
        title,
        anchorsByKeyword,
    };
}
