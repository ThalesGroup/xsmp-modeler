import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { clearDocuments, parseHelper, type ParseHelperOptions } from 'langium/test';
import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { createXsmpServices } from '../../src/language/xsmp-module.js';
import { Catalogue, LinkBase, Project, isLinkBase } from '../../src/language/generated/ast.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let services: ReturnType<typeof createXsmpServices>;
let parseProject: ReturnType<typeof parseHelper<Project>>;
let parseCatalogue: ReturnType<typeof parseHelper<Catalogue>>;
let parseLinkBase: ReturnType<typeof parseHelper<LinkBase>>;
const documents: LangiumDocument[] = [];
const tempDirs: string[] = [];

const catalogueSource = `catalogue Demo

namespace demo
{
    public event FlagEvent extends Smp.Bool

    public model Child
    {
        input field Smp.Int32 inValue
        output field Smp.Int32 outValue

        eventsink demo.FlagEvent inbound
        eventsource demo.FlagEvent outbound
    }

    public model Root
    {
        field Smp.Bool enabledState
        output field Smp.Int32 outValue
        input field Smp.Int32 inValue
        container Child child = demo.Child

        public property Smp.Bool enabled -> enabledState

        eventsink demo.FlagEvent inbound
        eventsource demo.FlagEvent outbound
    }
}
`;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parseProject = parseHelper<Project>(services.xsmpproject);
    parseCatalogue = parseHelper<Catalogue>(services.xsmpcat);
    const doParseLinkBase = parseHelper<LinkBase>(services.xsmplnk);
    parseLinkBase = (input: string, options?: ParseHelperOptions) => doParseLinkBase(input, { validation: true, ...options });

    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

afterEach(async () => {
    if (documents.length > 0) {
        await clearDocuments(services.shared, documents.splice(0));
    }
    while (tempDirs.length > 0) {
        fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
});

describe('Validating Xsmplnk', () => {
    test('validates typed component link bases and link endpoints and honors unsafe', async () => {
        const document = await parseInProject(`link Demo

/: demo.Root
{
    field link outValue -> child.outValue
    field link unsafe outValue -> unsafe child.outValue
    event link outbound -> child.inbound

    enabled: demo.Child
    {
        event link outbound -> inbound
    }
}
`);

        const messages = getMessages(document);
        expect(messages).toEqual(expect.arrayContaining([
            "The path segment 'outValue' shall resolve to a Field marked as Input of the current Component.",
            "The path segment 'enabled' shall resolve to a Container or Reference of the current Component.",
        ]));
        expect(messages.some(message => message.includes('unsafe'))).toBe(false);
    });

    test('keeps unanchored link bases in text mode', async () => {
        const document = await parseInProject(`link Demo

Unanchored
{
    field link missing -> missing
}
`);

        expect(getMessages(document)).toEqual([]);
    });
});

async function parseInProject(source: string): Promise<LangiumDocument<LinkBase>> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmplnk-validating-'));
    tempDirs.push(tempDir);

    const projectDocument = await parseProject(
        `project "Demo" using "ECSS_SMP_2025"
source "src"
`,
        { documentUri: URI.file(path.join(tempDir, 'xsmp.project')).toString() }
    );
    const catalogueDocument = await parseCatalogue(catalogueSource, {
        documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmpcat')).toString(),
    });
    const linkBaseDocument = await parseLinkBase(source, {
        documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmplnk')).toString(),
    });

    documents.push(projectDocument, catalogueDocument, linkBaseDocument);
    expect(projectDocument.parseResult.parserErrors).toHaveLength(0);
    expect(catalogueDocument.parseResult.parserErrors).toHaveLength(0);
    expect(linkBaseDocument.parseResult.parserErrors).toHaveLength(0);

    return linkBaseDocument;
}

function getMessages(document: LangiumDocument<LinkBase>): string[] {
    expect(isLinkBase(document.parseResult.value)).toBe(true);
    return document.diagnostics?.map(diagnostic => diagnostic.message) ?? [];
}
