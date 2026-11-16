import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type AstNode, type LangiumDocument } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast';
import { SmpGenerator } from '@xsmp/tool-smp';
import { serializeSmpXml } from '../src/xml.js';
import { evaluateXmlXPath, hasXmllint } from './xsd-test-utils.js';

let services: ReturnType<typeof createXsmpServices>;
const documents: LangiumDocument[] = [];
const literal = '&lt; &amp; &quot; &#65; &#x41; &unknown; < > " \' &';
const escaped = '&amp;lt; &amp;amp; &amp;quot; &amp;#65; &amp;#x41; &amp;unknown; &lt; &gt; " \' &amp;';

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

afterEach(async () => {
    await clearDocuments(services.shared, documents.splice(0));
});

const cases = [
    { kind: 'Catalogue', language: 'xsmpcat', source: 'catalogue Demo namespace ns {}' },
    { kind: 'Package', language: 'xsmpcat', source: 'catalogue Demo namespace ns {}' },
    { kind: 'Configuration', language: 'xsmpcfg', source: 'configuration Demo /Root: ns.Model {}' },
    { kind: 'LinkBase', language: 'xsmplnk', source: 'link Demo / {}' },
    { kind: 'Assembly', language: 'xsmpasb', source: 'assembly Demo Root: ns.Model {}' },
    { kind: 'Schedule', language: 'xsmpsed', source: 'schedule <Root = "root"> Demo task Main {}' },
] as const;

async function generate(kind: typeof cases[number]['kind'], node: AstNode): Promise<string> {
    const generator = new SmpGenerator(services.shared);
    switch (kind) {
        case 'Catalogue': return generator.doGenerateCatalogue(node as ast.Catalogue, undefined);
        case 'Package': return generator.doGeneratePackage(node as ast.Catalogue, undefined);
        case 'Configuration': return generator.doGenerateConfiguration(node as ast.Configuration, undefined);
        case 'LinkBase': return generator.doGenerateLinkBase(node as ast.LinkBase, undefined);
        case 'Assembly': return generator.doGenerateAssembly(node as ast.Assembly, undefined);
        case 'Schedule': return generator.doGenerateSchedule(node as ast.Schedule, undefined);
    }
}

describe('SMP literal XML entities', () => {
    test.each([
        { value: '&lt;', xml: '&amp;lt;' },
        { value: '&amp;lt;', xml: '&amp;amp;lt;' },
        { value: '&amp;', xml: '&amp;amp;' },
        { value: '&quot;', xml: '&amp;quot;' },
        { value: '&#65;', xml: '&amp;#65;' },
        { value: '&#x41;', xml: '&amp;#x41;' },
        { value: '&#0;', xml: '&amp;#0;' },
        { value: '&#x110000;', xml: '&amp;#x110000;' },
        { value: '&#xZZ;', xml: '&amp;#xZZ;' },
        { value: '&unknown;', xml: '&amp;unknown;' },
        { value: 'a & b', xml: 'a &amp; b' },
    ])('preserves $value in attributes and text', ({ value, xml }) => {
        const result = serializeSmpXml({ Root: { '@Value': value, Text: value } });
        expect(result).toContain(`<Root Value="${xml}">`);
        expect(result).toContain(`<Text>${xml}</Text>`);
    });

    test('retains XML escaping, comments, CDATA, arrays and optional values without mutating inputs', () => {
        const content = Object.freeze({
            '!notice': '&lt; &#65; & comment',
            Root: Object.freeze({
                '@Value': 'a & b <c> "q"',
                '$': '<c>&lt; &amp; &#65; &unknown;</c>',
                Text: 'a & b <c> "q"',
                Item: Object.freeze([Object.freeze({ '@Index': 0 }), Object.freeze({ '@Index': 1 })]),
                Flag: false,
                Zero: 0,
                Empty: '',
                Omitted: undefined,
                NoItems: Object.freeze([]),
            }),
        });
        expect(serializeSmpXml(content)).toBe(`<?xml version="1.0" encoding="UTF-8"?>
<!--&lt; &#65; & comment-->
<Root Value="a &amp; b &lt;c&gt; &quot;q&quot;">
  <![CDATA[<c>&lt; &amp; &#65; &unknown;</c>]]>
  <Text>a &amp; b &lt;c&gt; "q"</Text>
  <Item Index="0"/>
  <Item Index="1"/>
  <Flag>false</Flag>
  <Zero>0</Zero>
  <Empty/>
</Root>`);
    });

    test.skipIf(!hasXmllint())('round-trips raw strings, CDATA and comments through xmllint', () => {
        const xml = serializeSmpXml({ Root: {
            '@Value': literal,
            Text: literal,
            CData: { '$': literal },
            '!comment': literal,
        } });
        expect(evaluateXmlXPath(xml, 'string(/Root/@Value)')).toBe(literal);
        expect(evaluateXmlXPath(xml, 'string(/Root/Text)')).toBe(literal);
        expect(evaluateXmlXPath(xml, 'string(/Root/CData)')).toBe(literal);
        expect(evaluateXmlXPath(xml, 'string(/Root/comment())')).toBe(literal);
    });

    test.each(cases)('preserves literal descriptions in $kind output', async ({ kind, language, source }) => {
        const parse = parseHelper(services[language]);
        const document = await parse(`/** ${literal} */\n${source}`);
        documents.push(document);
        expect(document.parseResult.parserErrors).toHaveLength(0);
        const xml = await generate(kind, document.parseResult.value);
        expect(xml).toContain(`<Description>${escaped}</Description>`);
    });

    test.skipIf(!hasXmllint())('preserves string values and descriptions in an independent XML parser', async () => {
        const document = await parseHelper<ast.Catalogue>(services.xsmpcat)(`/** ${literal} */
catalogue Demo
namespace ns {
    public string Text[200]
    public struct Data {
        constant Text value = "&lt; &amp;lt; &#65; &#x41; &unknown; < > &"
    }
}`);
        documents.push(document);
        expect(document.parseResult.parserErrors).toHaveLength(0);
        const xml = await new SmpGenerator(services.shared).doGenerateCatalogue(document.parseResult.value, undefined);
        expect(evaluateXmlXPath(xml, 'string(/*/Description)')).toBe(literal);
        expect(evaluateXmlXPath(xml, 'string(//Constant/Value/@Value)'))
            .toBe('&lt; &amp;lt; &#65; &#x41; &unknown; < > &');
    });
});
