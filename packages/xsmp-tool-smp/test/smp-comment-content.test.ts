import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI } from 'langium';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createXsmpServices } from '@xsmp/core';
import { renderDocComment, SmpImportService } from '@xsmp/core/smp';
import { assertXmlConformsToXsd, hasXmllint } from './xsd-test-utils.js';

let importer: SmpImportService;
const directories: string[] = [];
beforeAll(async () => {
    const services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
    importer = new SmpImportService(services.shared);
});
afterEach(() => {
    for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

async function render(description: string, metadata = '') {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-comment-content-'));
    directories.push(directory);
    const inputPath = path.join(directory, 'descriptions.smpcat');
    fs.writeFileSync(inputPath, `<Catalogue:Catalogue xmlns:Catalogue="http://www.ecss.nl/smp/2025/Smdl/Catalogue" xmlns:Types="http://www.ecss.nl/smp/2025/Core/Types" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Id="Descriptions" Name="Descriptions" ${metadata}>
        <Description>${description}</Description>
        <Namespace Id="demo" Name="demo"><Description>Namespace /* note */ continues.</Description>
            <Type xsi:type="Types:String" Id="Text" Name="Text" Uuid="11111111-1111-1111-1111-111111111111" Length="8"><Description>Type */ continues.</Description></Type>
        </Namespace>
    </Catalogue:Catalogue>`);
    if (hasXmllint()) assertXmlConformsToXsd(inputPath, 'catalogue', 'ECSS_SMP_2025');
    const result = await importer.renderImportedDocument({ inputPath, outputUri: URI.file(path.join(directory, 'descriptions.xsmpcat')) });
    expect(result.warnings).toEqual([]);
    expect(result.content).toContain('namespace demo');
    expect(result.content).toContain('string Text');
    expect(result.content).toContain('Namespace /* note * / continues.');
    expect(result.content).toContain('Type * / continues.');
    return result.content;
}

describe('SMP description comment rendering', () => {
    test('keeps one-line descriptions inside their comment', async () => {
        expect(await render('Notation: /* comment */ is accepted.'))
            .toContain('/** Notation: /* comment * / is accepted. */');
    });

    test('neutralizes every terminator in multiline descriptions and metadata', async () => {
        const content = await render('First */ line\nSecond */ line', 'Title="Title */ text" Creator="Author */ text" Version="Version */ text"');
        for (const text of ['First * / line', 'Second * / line', '@title Title * / text', '@creator Author * / text', '@version Version * / text']) {
            expect(content).toContain(text);
        }
    });

    test('handles multiline parameter descriptions rendered as tags', () => {
        expect(renderDocComment(undefined, ['@param value first */\nsecond */']))
            .toBe('/**\n * @param value first * /\nsecond * /\n */');
    });

    test('preserves ordinary comment formatting', () => {
        expect(renderDocComment(undefined)).toBe('');
        expect(renderDocComment('Plain description.')).toBe('/** Plain description. */');
        expect(renderDocComment('First line\nSecond line', ['@title A title']))
            .toBe('/**\n * First line\n * Second line\n *\n * @title A title\n */');
    });
});
