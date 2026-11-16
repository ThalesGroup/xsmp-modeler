import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { AstUtils, EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast';
import { getAttribute, getChildObjects, getChildText, parseSmpXml, SmpImportService } from '@xsmp/core/smp';
import { getValue } from '../../xsmp/src/utils/solver.js';
import { assertXmlConformsToXsd, hasXmllint, type SmpSchemaKind } from './xsd-test-utils.js';

let services: ReturnType<typeof createXsmpServices>;
let directory: string;
const documents: LangiumDocument[] = [];
beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});
beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-decoded-xml-'));
    fs.mkdirSync(path.join(directory, 'src'));
});
afterEach(async () => {
    await clearDocuments(services.shared, documents.splice(0));
    fs.rmSync(directory, { recursive: true, force: true });
});

async function render(xml: string, extension: string, kind: SmpSchemaKind) {
    const inputPath = path.join(directory, `input.${extension}`);
    fs.writeFileSync(inputPath, xml);
    if (hasXmllint()) assertXmlConformsToXsd(inputPath, kind, 'ECSS_SMP_2025');
    const outputUri = URI.file(path.join(directory, 'src', `imported.x${extension}`));
    const result = await new SmpImportService(services.shared).renderImportedDocument({ inputPath, outputUri });
    expect(result.warnings).toEqual([]);
    return { ...result, outputUri };
}

describe('decoded SMP XML values', () => {
    test('preserves XML entity meaning once in attributes and text', () => {
        const encoded = '&lt; | &amp;lt; | &#60; | &amp;#60; | &quot; | &apos; | &amp; | &#x1F642;';
        const expected = '< | &lt; | < | &#60; | " | \' | & | 🙂';
        const { root } = parseSmpXml(`<Root Value="${encoded}"><Description>${encoded}</Description></Root>`);
        expect(getAttribute(root, 'Value')).toBe(expected);
        expect(getChildText(root, 'Description')).toBe(expected);
    });

    test.each([
        '<Root><Child></Root>',
        '<Root Value="1" Value="2"/>',
        '<Root><unknown:Child/></Root>',
        '<Root/><Other/>',
        '<Root>&unknown;</Root>',
        '<!DOCTYPE Root [<!ENTITY custom "expanded">]><Root>&custom;</Root>',
        '<?xml version="1.1"?><Root/>',
        '<Root>&#0;</Root>',
    ])('rejects malformed or unsupported XML without partial results: %s', xml => {
        expect(() => parseSmpXml(xml)).toThrow('Failed to parse SMP XML.');
    });

    test('does not load an external DTD', () => {
        const { root } = parseSmpXml('<!DOCTYPE Root SYSTEM "file:///does-not-exist.dtd"><Root Value="plain"/>');
        expect(getAttribute(root, 'Value')).toBe('plain');
    });

    test('coalesces text and CDATA and keeps repeated children across comments and processing instructions', () => {
        const parsed = parseSmpXml(`<?xml version="1.0"?><!--before--><Root xmlns="urn:root" xmlns:meta="urn:meta" meta:label="A &amp; B">
            <Description>before <![CDATA[&lt; &]]> after &lt;</Description>
            <Item Value="first"/><!--between--><?ignored value?><Item Value="second"/>
            <Empty/><__proto__ Value="ordinary"/><__proto__ Value="again"/><constructor Value="child"/>
        </Root><!--after-->`);
        expect(parsed.rootNamespace).toBe('urn:root');
        expect(parsed.rootLocalName).toBe('Root');
        expect(getAttribute(parsed.root, 'xmlns:meta')).toBe('urn:meta');
        expect(getAttribute(parsed.root, 'meta:label')).toBe('A & B');
        expect(getChildText(parsed.root, 'Description')).toBe('before &lt; & after <');
        expect(getChildObjects(parsed.root, 'Item').map(item => getAttribute(item, 'Value'))).toEqual(['first', 'second']);
        expect(getChildObjects(parsed.root, 'Empty')).toHaveLength(1);
        expect(getChildObjects(parsed.root, '__proto__').map(item => getAttribute(item, 'Value'))).toEqual(['ordinary', 'again']);
        expect(getAttribute(getChildObjects(parsed.root, 'constructor')[0], 'Value')).toBe('child');
        expect(Object.getPrototypeOf(parsed.root)).toBe(Object.prototype);
        expect(Object.keys(parsed.root).some(key => key.startsWith('!') || key.startsWith('?'))).toBe(false);
    });

    test.each([
        ['Catalogue', 'smpcat', 'catalogue', ''],
        ['Configuration', 'smpcfg', 'configuration', ''],
        ['LinkBase', 'smplnk', 'linkbase', ''],
        ['Assembly', 'smpasb', 'assembly', '<Model Name="Root" Implementation="demo::Root"/>'],
        ['Schedule', 'smpsed', 'schedule', ''],
    ] as const)('imports decoded descriptions and metadata in %s documents', async (root, extension, kind, body) => {
        const xml = `<${root}:${root} xmlns:${root}="http://www.ecss.nl/smp/2025/Smdl/${root}" Id="Demo" Name="Demo" Title="A &amp; B">
            <Description>literal &amp;lt; and <![CDATA[less-than <]]></Description>${body}</${root}:${root}>`;
        const result = await render(xml, extension, kind);
        expect(result.kind).toBe(kind);
        expect(result.content).toContain('literal &lt; and less-than <');
        expect(result.content).toContain('@title A & B');
    });

    test('retains decoded catalogue string and character values through parsing and evaluation', async () => {
        const xml = `<Catalogue:Catalogue xmlns:Catalogue="http://www.ecss.nl/smp/2025/Smdl/Catalogue" xmlns:Types="http://www.ecss.nl/smp/2025/Core/Types" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xlink="http://www.w3.org/1999/xlink" Id="Demo" Name="Demo">
            <Namespace Id="demo" Name="demo">
                <Type xsi:type="Types:String" Id="Text" Name="Text" Uuid="11111111-1111-1111-1111-111111111111" Length="100" Visibility="public"/>
                <Type xsi:type="Types:Structure" Id="Data" Name="Data" Uuid="22222222-2222-2222-2222-222222222222" Visibility="public">
                    <Constant Id="TextValue" Name="TextValue"><Type xlink:href="#Text"/><Value xsi:type="Types:String8Value" Value="a \\&quot;quoted\\&quot; &amp; b &amp;lt;"/></Constant>
                    <Constant Id="CharValue" Name="CharValue"><Type xlink:href="http://www.ecss.nl/smp/2025/Smdl#Smp.Char8" xlink:title="Char8"/><Value xsi:type="Types:Char8Value" Value="&amp;"/></Constant>
                </Type>
            </Namespace>
        </Catalogue:Catalogue>`;
        const { content, outputUri } = await render(xml, 'smpcat', 'catalogue');
        const project = await parseHelper<ast.Project>(services.xsmpproject)("project 'Demo' using 'ECSS_SMP_2025' source 'src'", { documentUri: URI.file(path.join(directory, 'xsmp.project')).toString() });
        const document = await parseHelper<ast.Catalogue>(services.xsmpcat)(content, { documentUri: outputUri.toString() });
        documents.push(project, document);
        await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });
        for (const item of documents) expect(item.diagnostics?.filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
        const values = AstUtils.streamAllContents(document.parseResult.value).filter(ast.isConstant).map(constant => getValue(constant.value)?.getValue()).toArray();
        expect(values).toEqual(['a "quoted" & b &lt;', '&']);
    });
});
