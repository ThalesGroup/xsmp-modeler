import { afterEach, describe, expect, test, vi } from 'vitest';
import { DocumentState, EmptyFileSystem, URI } from 'langium';
import * as path from 'node:path';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createXsmpServices } from '@xsmp/core';
import {
    createSmpMirrorDescriptor,
    getSmpMirrorLanguageId,
    getSmpMirrorSourceUri,
    getSmpSourcePathFromMirrorPath,
    getXsmpHomologuePath,
} from '@xsmp/core/smp';

const formats = [
    { suffix: 'smpcat', languageId: 'xsmpcat', text: 'catalogue Demo', rootType: 'Catalogue' },
    { suffix: 'smpcfg', languageId: 'xsmpcfg', text: 'configuration Demo', rootType: 'Configuration' },
    { suffix: 'smplnk', languageId: 'xsmplnk', text: 'link Demo', rootType: 'LinkBase' },
    { suffix: 'smpasb', languageId: 'xsmpasb', text: 'assembly Demo Root: demo.Model {}', rootType: 'Assembly' },
    { suffix: 'smpsed', languageId: 'xsmpsed', text: 'schedule Demo', rootType: 'Schedule' },
] as const;

const services = createXsmpServices(EmptyFileSystem);
const registry = services.shared.ServiceRegistry;

afterEach(() => vi.restoreAllMocks());

describe('SMP mirror URI identity', () => {
    test.each(formats)('preserves the .$suffix filename and the physical XSMP homologue', ({ suffix, languageId }) => {
        const sourcePath = path.resolve('project', `my catalogue #%.${suffix}`);
        const descriptor = createSmpMirrorDescriptor(sourcePath)!;

        expect(descriptor.mirrorUri).toEqual(descriptor.sourceUri.with({ scheme: 'xsmp-smp' }));
        expect(descriptor.mirrorUri.path).toBe(descriptor.sourceUri.path);
        expect(getSmpMirrorLanguageId(descriptor.mirrorUri)).toBe(languageId);
        expect(getSmpMirrorSourceUri(descriptor.mirrorUri)?.toString()).toBe(descriptor.sourceUri.toString());
        expect(getXsmpHomologuePath(sourcePath)).toBe(path.resolve('project', `my catalogue #%.${languageId}`));
    });

    test.each([
        'file://server/share/my%20catalogue%20%23%25.smpcat',
        'file:///C:/project/my%20catalogue%20%23%25.smpcat',
    ])('preserves authority and encoded characters when resolving %s', source => {
        const sourceUri = URI.parse(source);
        expect(getSmpMirrorSourceUri(sourceUri.with({ scheme: 'xsmp-smp' }))).toEqual(sourceUri);
    });

    test.each(formats)('keeps legacy .$languageId conversion available without registering a backend alias', ({ suffix, languageId }) => {
        const oldMirrorUri = URI.parse(`xsmp-smp:///project/demo.${languageId}`);
        expect(getSmpSourcePathFromMirrorPath(oldMirrorUri.path)).toBe(`/project/demo.${suffix}`);
        expect(getSmpMirrorLanguageId(oldMirrorUri)).toBeUndefined();
        expect(getSmpMirrorSourceUri(oldMirrorUri)).toBeUndefined();
        expect(registry.hasServices(oldMirrorUri)).toBe(false);
    });

    test.each(['file:///demo.smpcat', 'xsmp:///demo.smpcat', 'xsmp-smp:///demo.xml'])(
        'does not treat %s as an SMP mirror', uri => {
            expect(getSmpMirrorLanguageId(URI.parse(uri))).toBeUndefined();
            expect(getSmpMirrorSourceUri(URI.parse(uri))).toBeUndefined();
        },
    );
});

describe('SMP mirror language selection', () => {
    test.each(formats)('parses .$suffix mirrors before the editor opens them', ({ suffix, languageId, text, rootType }) => {
        const uri = URI.parse(`xsmp-smp:///project/demo.${suffix}`);
        const document = services.shared.workspace.LangiumDocumentFactory.fromString(text, uri);

        expect(registry.getServices(uri)).toBe(services[languageId]);
        expect(document.parseResult.lexerErrors).toEqual([]);
        expect(document.parseResult.parserErrors).toEqual([]);
        expect(document.parseResult.value.$type).toBe(rootType);
        expect(document.textDocument.languageId).toBe(languageId);
    });

    test.each(formats)('selects .$suffix services regardless of the client languageId', ({ suffix, languageId }) => {
        const uri = URI.parse(`xsmp-smp:///project/demo.${suffix}`);
        const getDocument = vi.spyOn(services.shared.workspace.TextDocuments, 'get');

        for (const clientLanguageId of ['xml', languageId === 'xsmpcat' ? 'xsmpcfg' : 'xsmpcat']) {
            getDocument.mockReturnValue(TextDocument.create(uri.toString(), clientLanguageId, 1, ''));
            expect(registry.getServices(uri)).toBe(services[languageId]);
        }
    });

    test.each(formats)('does not parse physical .$suffix XML as XSMP even with a client languageId', ({ suffix, languageId }) => {
        const uri = URI.parse(`file:///project/demo.${suffix}`);
        vi.spyOn(services.shared.workspace.TextDocuments, 'get')
            .mockReturnValue(TextDocument.create(uri.toString(), languageId, 1, '<xml/>'));
        expect(registry.hasServices(uri)).toBe(false);
        expect(() => services.shared.workspace.LangiumDocumentFactory.fromString('<xml/>', uri))
            .toThrow('must be accessed through its XSMP mirror');
    });

    test('retains normal XSMP document and builtin routing', () => {
        expect(registry.getServices(URI.parse('file:///project/demo.xsmpcat'))).toBe(services.xsmpcat);
        expect(registry.getServices(URI.parse('xsmp:///builtin.xsmpcat'))).toBe(services.xsmpcat);
        expect(registry.getServices(URI.parse('file:///project/xsmp.project'))).toBe(services.xsmpproject);
    });

    test('does not recreate old mirror aliases when resolving restored tabs', async () => {
        const legacyUri = URI.parse('xsmp-smp:///project/demo.xsmpcat');
        await expect(services.shared.SmpMirrorManager.getOrCreateMirrorContent(legacyUri)).resolves.toBeUndefined();
        expect(services.shared.workspace.LangiumDocuments.hasDocument(legacyUri)).toBe(false);
    });

    test.each(['xsmp-smp:/project/old.xsmpcat', 'file:///project/xml.smpcat'])(
        'ignores unsupported open document %s without poisoning later workspace updates', async unsupportedUri => {
            const isolated = createXsmpServices(EmptyFileSystem).shared;
            const uri = URI.parse(unsupportedUri);
            const supportedUri = URI.parse('file:///project/valid.xsmpcat');
            const documents = new Map([
                [uri.toString(), TextDocument.create(uri.toString(), 'xsmpcat', 1, '')],
                [supportedUri.toString(), TextDocument.create(supportedUri.toString(), 'xsmpcat', 1, 'catalogue Valid')],
            ]);
            vi.spyOn(isolated.workspace.TextDocuments, 'get').mockImplementation(candidate => documents.get(candidate.toString()));

            await isolated.workspace.DocumentBuilder.update([uri], []);
            expect(isolated.workspace.LangiumDocuments.hasDocument(uri)).toBe(false);
            await isolated.workspace.DocumentBuilder.update([supportedUri], []);
            const valid = isolated.workspace.LangiumDocuments.getDocument(supportedUri)!;
            expect(valid.state).toBe(DocumentState.Validated);
            expect(valid.parseResult.parserErrors).toEqual([]);
        },
    );
});
