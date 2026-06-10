import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import {
    ComponentConfiguration,
    type Configuration,
    type LinkBase,
    PatternPathNamedSegment,
    isComponentConfiguration,
    isConfiguration,
    isLinkBase,
    isPatternPathNamedSegment
} from '@xsmp/core/ast-partial';

let services: ReturnType<typeof createXsmpServices>;
let parseConfiguration: ReturnType<typeof parseHelper<Configuration>>;
let parseLinkBase: ReturnType<typeof parseHelper<LinkBase>>;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parseConfiguration = parseHelper<Configuration>(services.xsmpcfg);
    parseLinkBase = parseHelper<LinkBase>(services.xsmplnk);

    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

describe('Template identifier pattern parsing', () => {
    test('keeps templated path segments atomic and splits them through the pattern service', async () => {
        const document = await parseConfiguration(`configuration Demo
    Child{Lane}Ops
    {
    }
`);

        expect(checkDocumentValid(document)).toBeUndefined();

        const configuration = document.parseResult.value;
        const childConfiguration = configuration.elements[0]!;
        expect(isComponentConfiguration(childConfiguration)).toBe(true);
        const head = (childConfiguration as ComponentConfiguration).name!.head!;
        expect(isPatternPathNamedSegment(head)).toBe(true);

        const segment = head as PatternPathNamedSegment;
        expect(segment.text).toBe('Child{Lane}Ops');

        expect(services.shared.IdentifierPatternService.parseTextPattern(segment.text)?.parts).toEqual([
            { kind: 'text', text: 'Child' },
            { kind: 'template', text: '{Lane}', parameterName: 'Lane' },
            { kind: 'text', text: 'Ops' },
        ]);
    });

    test('accepts templated path segments that start with a template identifier', async () => {
        const document = await parseConfiguration(`configuration Demo
    {Lane}Ops
    {
    }
`);

        expect(checkDocumentValid(document)).toBeUndefined();

        const configuration = document.parseResult.value;
        const childConfiguration = configuration.elements[0]!;
        expect(isComponentConfiguration(childConfiguration)).toBe(true);
        const head = (childConfiguration as ComponentConfiguration).name!.head!;
        expect(isPatternPathNamedSegment(head)).toBe(true);
        expect((head as PatternPathNamedSegment).text).toBe('{Lane}Ops');
    });

    test('does not allow spaces inside templated configuration path segments', async () => {
        const document = await parseConfiguration(`configuration Demo
    Child {Lane}Ops
    {
    }
`);

        expect(document.parseResult.parserErrors).not.toHaveLength(0);
        expect(isConfiguration(document.parseResult.value)).toBe(true);
    });

    test('does not allow spaces after leading template identifiers in path segments', async () => {
        const document = await parseConfiguration(`configuration Demo
    {Lane} Ops
    {
    }
`);

        expect(document.parseResult.parserErrors).not.toHaveLength(0);
        expect(isConfiguration(document.parseResult.value)).toBe(true);
    });

    test('does not allow spaces inside templated link-base path segments', async () => {
        const document = await parseLinkBase(`link Demo
    Child {Lane}Ops
    {
    }
`);

        expect(document.parseResult.parserErrors).not.toHaveLength(0);
        expect(isLinkBase(document.parseResult.value)).toBe(true);
    });

    test('splits text after template identifiers in the identifier pattern service', () => {
        const pattern = services.shared.IdentifierPatternService.parseTextPattern('Child{Lane}Ops');

        expect(pattern?.parts).toEqual([
            { kind: 'text', text: 'Child' },
            { kind: 'template', text: '{Lane}', parameterName: 'Lane' },
            { kind: 'text', text: 'Ops' },
        ]);
    });
});

function checkDocumentValid(document: LangiumDocument): string | undefined {
    if (document.parseResult.parserErrors.length) {
        return document.parseResult.parserErrors.map(error => error.message).join('\n');
    }
    const root = document.parseResult.value;
    if (root === undefined) {
        return `ParseResult is 'undefined'.`;
    }
    if (!isConfiguration(root)) {
        const actualType = typeof root.$type === 'string' ? root.$type : '<unknown>';
        return `Root AST object is a ${actualType}, expected a 'Configuration'.`;
    }
    return undefined;
}
