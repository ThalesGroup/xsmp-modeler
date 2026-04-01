import { beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { parseHelper } from 'langium/test';
import { createXsmpServices } from 'xsmp';
import { ComponentConfiguration, type Configuration, PatternPathNamedSegment, isComponentConfiguration, isConfiguration, isIdentifierTemplatePart, isIdentifierTextPart, isPatternPathNamedSegment } from 'xsmp/ast-partial';

let services: ReturnType<typeof createXsmpServices>;
let parseConfiguration: ReturnType<typeof parseHelper<Configuration>>;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parseConfiguration = parseHelper<Configuration>(services.xsmpcfg);

    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

describe('Template identifier pattern parsing', () => {
    test('splits text before and after template identifiers in parsed paths', async () => {
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

        const pattern = (head as PatternPathNamedSegment).pattern;
        expect(pattern?.parts).toHaveLength(3);
        expect(isIdentifierTextPart(pattern?.parts[0])).toBe(true);
        expect(pattern?.parts[0]?.text).toBe('Child');
        expect(isIdentifierTemplatePart(pattern?.parts[1])).toBe(true);
        expect(pattern?.parts[1]?.text).toBe('{Lane}');
        expect(isIdentifierTextPart(pattern?.parts[2])).toBe(true);
        expect(pattern?.parts[2]?.text).toBe('Ops');
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
