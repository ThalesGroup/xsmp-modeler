import { describe, expect, test } from 'vitest';
import { getEmbeddedDocumentationTarget } from '../../src/extension/embedded-documentation-links.js';

describe('embedded documentation links', () => {
    test('maps project keywords to the xsmp.project reference', () => {
        expect(getEmbeddedDocumentationTarget('xsmpproject', 'tool')).toEqual({
            keyword: 'tool',
            page: 'languages/xsmpproject.md',
            title: 'xsmp.project, profile and tool reference',
        });
    });

    test('maps assembly keywords to the assembly reference', () => {
        expect(getEmbeddedDocumentationTarget('xsmpasb', 'assembly')).toEqual({
            keyword: 'assembly',
            page: 'languages/xsmpasb.md',
            title: 'XSMP assembly reference',
        });
    });

    test('supports mixed-case keywords that normalize to documented entries', () => {
        expect(getEmbeddedDocumentationTarget('xsmpcat', 'readOnly')).toEqual({
            keyword: 'readOnly',
            page: 'languages/xsmpcat.md',
            title: 'XSMP catalogue reference',
        });
    });

    test('ignores unknown language and keyword combinations', () => {
        expect(getEmbeddedDocumentationTarget('xsmpcfg', 'assembly')).toBeUndefined();
        expect(getEmbeddedDocumentationTarget('unknown', 'project')).toBeUndefined();
    });
});
