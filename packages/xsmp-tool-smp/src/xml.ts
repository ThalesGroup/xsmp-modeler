import { create } from 'xmlbuilder2';
import type { XMLBuilder } from 'xmlbuilder2/lib/interfaces.js';

/** Serialize the SMP object representation without interpreting literal entities. */
export function serializeSmpXml(content: object): string {
    const document = create({ version: '1.0', encoding: 'UTF-8' });
    appendObject(document, content);
    return document.end({ prettyPrint: true });
}

function appendObject(parent: XMLBuilder, content: object): void {
    for (const [name, value] of Object.entries(content)) {
        appendValue(parent, name, value);
    }
}

function appendValue(parent: XMLBuilder, name: string, value: unknown): void {
    if (value === undefined || value === null) {
        return;
    }
    if (Array.isArray(value)) {
        for (const item of value) appendValue(parent, name, item);
    } else if (name.startsWith('@')) {
        parent.att(name.slice(1), escapeAmpersands(String(value)));
    } else if (name.startsWith('!')) {
        parent.com(String(value));
    } else if (name.startsWith('$')) {
        parent.dat(String(value));
    } else {
        const child = name.startsWith('#') ? parent : parent.ele(name);
        if (typeof value === 'object') {
            appendObject(child, value);
        } else {
            child.txt(escapeAmpersands(String(value)));
        }
    }
}

function escapeAmpersands(value: string): string {
    // Fluent att/txt bypass ObjectReader's entity decoding. XMLWriter preserves
    // entity-looking ampersands, so protect every literal ampersand once here.
    return value.replaceAll('&', '&amp;');
}
