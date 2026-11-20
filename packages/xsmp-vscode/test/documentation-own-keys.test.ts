import { expect, test } from 'vitest';
import { getEmbeddedDocumentationTarget } from '../src/extension/embedded-documentation-links.js';

test.each(['xsmpproject', 'xsmpcat', 'xsmpcfg', 'xsmpasb', 'xsmplnk', 'xsmpsed'])(
    '%s does not offer documentation for inherited object properties', language => {
        for (const keyword of ['constructor', '__proto__', ' Constructor ', ' __PROTO__ ']) {
            expect(getEmbeddedDocumentationTarget(language, keyword)).toBeUndefined();
        }
    },
);

test.each(['constructor', '__proto__', 'toString', 'hasOwnProperty'])(
    'ignores inherited language name %s without throwing', language => {
        expect(getEmbeddedDocumentationTarget(language, 'struct')).toBeUndefined();
    },
);

test.each([
    ['xsmpcat', 'struct', undefined, 'struct'],
    ['xsmpcat', ' readOnly ', undefined, 'property'],
    ['xsmpasb', 'link', 'field link source -> target', 'field-link'],
    ['xsmpasb', 'link', 'event link source -> target', 'event-link'],
] as const)('keeps documented %s %s targets and their context', (language, keyword, line, anchor) => {
    expect(getEmbeddedDocumentationTarget(language, keyword, line)?.anchor).toBe(anchor);
});
