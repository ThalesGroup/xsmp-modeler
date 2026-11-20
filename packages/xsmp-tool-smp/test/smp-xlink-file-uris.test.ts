import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI } from 'langium';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createXsmpServices } from '@xsmp/core';
import { SmpExternalReferenceResolver, SmpImportService } from '@xsmp/core/smp';
import { assertXmlConformsToXsd, hasXmllint } from './xsd-test-utils.js';

let services: ReturnType<typeof createXsmpServices>;
let directory: string;
beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-xlink-uri-')); });
afterEach(async () => {
    services.shared.SmpWorkspaceIndex.setEligibleSourcePaths([]);
    await services.shared.SmpWorkspaceIndex.rebuildSearchRoots([]);
    fs.rmSync(directory, { recursive: true, force: true });
});

function configuration(name: string, id: string, content = ''): string {
    return `<Configuration:Configuration xmlns:Configuration="http://www.ecss.nl/smp/2025/Smdl/Configuration" xmlns:xlink="http://www.w3.org/1999/xlink" Id="${id}" Name="${name}">${content}</Configuration:Configuration>`;
}
function write(file: string, content: string): string {
    const target = path.join(directory, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    if (hasXmllint()) assertXmlConformsToXsd(target, 'configuration', 'ECSS_SMP_2025');
    return target;
}
async function render(href: string, owner = 'owner.smpcfg') {
    const inputPath = write(owner, configuration('Owner', 'OwnerId', `<Include><Configuration xlink:href="${href}"/></Include>`));
    const result = await new SmpImportService(services.shared).renderImportedDocument({ inputPath, outputUri: URI.file(path.join(directory, 'imported.xsmpcfg')) });
    expect(result.warnings).toEqual([]);
    return result.content;
}
function encoded(file: string): string {
    return file.split('/').map(encodeURIComponent).join('/');
}

describe('local SMP XLink URI resolution', () => {
    test.each([
        ['space', 'external config.smpcfg'],
        ['hash', 'external#config.smpcfg'],
        ['percent', 'external%config.smpcfg'],
        ['unicode', 'éxternal.smpcfg'],
        ['literal escape sequence', 'external%20config.smpcfg'],
        ['subdirectory', 'nested/external config.smpcfg'],
    ])('resolves encoded relative and file URI paths containing %s', async (_label, file) => {
        const target = write(file, configuration('ExternalConfig', 'ConfigId'));
        expect(await render(`${encoded(file)}#ConfigId`)).toContain('include ExternalConfig');
        expect(await render(`${pathToFileURL(target).href}#ConfigId`)).toContain('include ExternalConfig');
        expect(services.shared.SmpWorkspaceIndex.hasExternalReference(target)).toBe(true);
    });

    test.each([
        ['external config.smpcfg', 'external config.smpcfg'],
        ['nested/external.smpcfg', 'nested\\external.smpcfg'],
    ])('preserves legacy filesystem reference %s', async (file, href) => {
        write(file, configuration('ExternalConfig', 'ConfigId'));
        expect(await render(`${href}#ConfigId`)).toContain('include ExternalConfig');
    });

    test('preserves a legacy filesystem path containing an unescaped percent sign', () => {
        write('external%config.smpcfg', configuration('ExternalConfig', 'ConfigId'));
        const resolver = new SmpExternalReferenceResolver(path.join(directory, 'owner.smpcfg'), services.shared.SmpWorkspaceIndex);
        expect(resolver.resolveDocumentName('external%config.smpcfg', [], 'configuration')).toBe('ExternalConfig');
    });

    test('keeps workspace basename lookup for an encoded relative reference', async () => {
        write('elsewhere/external config.smpcfg', configuration('ExternalConfig', 'ConfigId'));
        expect(await render('external%20config.smpcfg#ConfigId')).toContain('include ExternalConfig');
    });

    test('resolves encoded references to the source document', async () => {
        expect(await render('owner%20source.smpcfg#OwnerId', 'owner source.smpcfg')).toContain('include Owner');
    });

    test('does not interpret unsupported URI schemes or malformed file URIs as local paths', async () => {
        write('external.smpcfg', configuration('ExternalConfig', 'ConfigId'));
        await services.shared.SmpWorkspaceIndex.rebuildSearchRoots([directory]);
        const resolver = new SmpExternalReferenceResolver(path.join(directory, 'owner.smpcfg'), services.shared.SmpWorkspaceIndex);
        for (const href of ['https://example.org/external.smpcfg', 'ftp://example.org/external.smpcfg', 'custom:external.smpcfg', 'file:///external%ZZ.smpcfg']) {
            expect(resolver.resolveDocumentName(href, [], 'configuration')).toBeUndefined();
        }
    });

    test.runIf(process.platform === 'win32')('preserves an absolute Windows drive path', async () => {
        const target = write('external.smpcfg', configuration('ExternalConfig', 'ConfigId'));
        expect(await render(`${target}#ConfigId`)).toContain('include ExternalConfig');
    });
});
