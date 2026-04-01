import { describe, expect, test } from 'vitest';
import { getEmbeddedDocumentationTarget } from '../src/extension/embedded-documentation-links.js';

describe('embedded documentation links', () => {
    test('maps project keywords to the xsmp.project reference', () => {
        expect(getEmbeddedDocumentationTarget('xsmpproject', 'tool')).toEqual({
            keyword: 'tool',
            page: 'languages/xsmpproject.md',
            title: 'xsmp.project, profile and tool reference',
            anchor: 'tool',
        });
    });

    test('maps assembly keywords to the assembly reference', () => {
        expect(getEmbeddedDocumentationTarget('xsmpasb', 'assembly')).toEqual({
            keyword: 'assembly',
            page: 'languages/xsmpasb.md',
            title: 'XSMP assembly reference',
            anchor: 'root-structure',
        });
    });

    test('supports mixed-case keywords that normalize to documented entries', () => {
        expect(getEmbeddedDocumentationTarget('xsmpcat', 'readOnly')).toEqual({
            keyword: 'readOnly',
            page: 'languages/xsmpcat.md',
            title: 'XSMP catalogue reference',
            anchor: 'property',
        });
    });

    test('maps realization to the catalogue realization reference', () => {
        expect(getEmbeddedDocumentationTarget('xsmpcat', 'realization')).toEqual({
            keyword: 'realization',
            page: 'languages/xsmpcat.md',
            title: 'XSMP catalogue reference',
            anchor: 'realization',
        });
    });

    test('maps link and schedule keywords to specific sections', () => {
        expect(getEmbeddedDocumentationTarget('xsmplnk', 'interface')).toEqual({
            keyword: 'interface',
            page: 'languages/xsmplnk.md',
            title: 'XSMP link base reference',
            anchor: 'interface-link',
        });
        expect(getEmbeddedDocumentationTarget('xsmpsed', 'simulation')).toEqual({
            keyword: 'simulation',
            page: 'languages/xsmpsed.md',
            title: 'XSMP schedule reference',
            anchor: 'simulation-event',
        });
    });

    test('uses line context for ambiguous link keywords', () => {
        expect(getEmbeddedDocumentationTarget('xsmplnk', 'link', 'event link publishedMode -> sink')).toEqual({
            keyword: 'link',
            page: 'languages/xsmplnk.md',
            title: 'XSMP link base reference',
            anchor: 'event-link',
        });
        expect(getEmbeddedDocumentationTarget('xsmplnk', 'link', 'link OrbitalLinks for OrbitalSegment')).toEqual({
            keyword: 'link',
            page: 'languages/xsmplnk.md',
            title: 'XSMP link base reference',
            anchor: 'root-structure',
        });
    });

    test('uses line context for ambiguous schedule keywords', () => {
        expect(getEmbeddedDocumentationTarget('xsmpsed', 'event', 'event Bootstrap mission "PT10S"')).toEqual({
            keyword: 'event',
            page: 'languages/xsmpsed.md',
            title: 'XSMP schedule reference',
            anchor: 'mission-event',
        });
        expect(getEmbeddedDocumentationTarget('xsmpsed', 'event', 'event Bootstrap epoch "2026-03-28T10:00:00Z"')).toEqual({
            keyword: 'event',
            page: 'languages/xsmpsed.md',
            title: 'XSMP schedule reference',
            anchor: 'epoch-event',
        });
        expect(getEmbeddedDocumentationTarget('xsmpsed', 'event', 'event Bootstrap simulation "PT10S"')).toEqual({
            keyword: 'event',
            page: 'languages/xsmpsed.md',
            title: 'XSMP schedule reference',
            anchor: 'simulation-event',
        });
        expect(getEmbeddedDocumentationTarget('xsmpsed', 'repeat', 'event Bootstrap zulu "2026-03-28T10:00:00Z" repeat "PT1M"')).toEqual({
            keyword: 'repeat',
            page: 'languages/xsmpsed.md',
            title: 'XSMP schedule reference',
            anchor: 'zulu-event',
        });
        expect(getEmbeddedDocumentationTarget('xsmpsed', 'repeat', 'event Dispatch on "Ready" repeat "PT1M"')).toEqual({
            keyword: 'repeat',
            page: 'languages/xsmpsed.md',
            title: 'XSMP schedule reference',
            anchor: 'global-event-triggered-event',
        });
        expect(getEmbeddedDocumentationTarget('xsmpsed', 'on', 'task Bootstrap on demo.orbit.Platform')).toEqual({
            keyword: 'on',
            page: 'languages/xsmpsed.md',
            title: 'XSMP schedule reference',
            anchor: 'tasks',
        });
        expect(getEmbeddedDocumentationTarget('xsmpsed', 'on', 'event Dispatch on "Ready" until "PT5S"')).toEqual({
            keyword: 'on',
            page: 'languages/xsmpsed.md',
            title: 'XSMP schedule reference',
            anchor: 'global-event-triggered-event',
        });
        expect(getEmbeddedDocumentationTarget('xsmpsed', 'using', 'event Dispatch on "Ready" using mission delay "PT5S"')).toEqual({
            keyword: 'using',
            page: 'languages/xsmpsed.md',
            title: 'XSMP schedule reference',
            anchor: 'global-event-triggered-event',
        });
        expect(getEmbeddedDocumentationTarget('xsmpsed', 'until', 'event Dispatch on "Ready" until mission "PT5S"')).toEqual({
            keyword: 'until',
            page: 'languages/xsmpsed.md',
            title: 'XSMP schedule reference',
            anchor: 'global-event-triggered-event',
        });
    });

    test('uses line context for ambiguous assembly keywords', () => {
        expect(getEmbeddedDocumentationTarget('xsmpasb', 'link', 'interface link logger -> payload:backLogger')).toEqual({
            keyword: 'link',
            page: 'languages/xsmpasb.md',
            title: 'XSMP assembly reference',
            anchor: 'interface-link',
        });
        expect(getEmbeddedDocumentationTarget('xsmpasb', 'using', 'payload += PayloadA: PayloadSegment using config PayloadCfg using link PayloadLinks')).toEqual({
            keyword: 'using',
            page: 'languages/xsmpasb.md',
            title: 'XSMP assembly reference',
            anchor: 'sub-assembly-instances',
        });
    });

    test('ignores unknown language and keyword combinations', () => {
        expect(getEmbeddedDocumentationTarget('xsmpcfg', 'assembly')).toBeUndefined();
        expect(getEmbeddedDocumentationTarget('unknown', 'project')).toBeUndefined();
        expect(getEmbeddedDocumentationTarget('xsmpsed', 'later', 'task Bootstrap call demo.orbit.Platform.step')).toBeUndefined();
    });
});
