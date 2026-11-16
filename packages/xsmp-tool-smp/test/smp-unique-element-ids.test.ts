import { afterEach, beforeAll, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast';
import { SmpGenerator } from '@xsmp/tool-smp';
import { create } from 'xmlbuilder2';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { assertXmlConformsToXsd, hasXmllint, type SmpStandard } from './xsd-test-utils.js';

let services: ReturnType<typeof createXsmpServices>;
const documents: LangiumDocument[] = [];
const directories: string[] = [];
beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});
afterEach(async () => {
    await clearDocuments(services.shared, documents.splice(0));
    for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

for (const standard of ['ECSS_SMP_2020', 'ECSS_SMP_2025'] satisfies SmpStandard[]) {
    test(`${standard} keeps overloaded operations, parameters and metadata identities unique`, async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-unique-ids-'));
        directories.push(directory);
        fs.mkdirSync(path.join(directory, 'src'));
        const uri = (name: string) => URI.file(path.join(directory, name)).toString();
        documents.push(await parseHelper<ast.Project>(services.xsmpproject)(
            `project 'Identities' using '${standard}'
source 'src'`, { documentUri: uri('xsmp.project') },
        ));
        const document = await parseHelper<ast.Catalogue>(services.xsmpcat)(`catalogue Identities
namespace a {
    /** @uuid 55000000-0000-4000-8000-000000000001 */
    public integer T extends Int32
}
namespace b {
    /** @uuid 55000000-0000-4000-8000-000000000002 */
    public integer T extends Int32
}
namespace demo {
    /** @uuid 55000000-0000-4000-8000-000000000003
     * @usage Operation */
    public attribute Bool Tag = true
    /** @uuid 55000000-0000-4000-8000-000000000004 */
    public interface I {
        @Tag def void dispatch(in a.T p)
        @Tag def void dispatch(in b.T p)
        @Tag def void dispatch(in Int32 p)
        @Tag def void dispatch(@ByPointer in Int32 p)
        @Tag def void dispatch(@ByReference in Int32 p)
        @Tag def void dispatch(@Const @ByPointer in Int32 p)
        @Tag def void dispatch(@Const @ByReference in Int32 p)
        def void first(@ByPointer in Int32 p)
        def void second(@ByPointer in Int32 p)
        def @ByPointer Int32 getFirst()
        def @ByPointer Int32 getSecond()
        /** @id custom.operation */
        @Tag def void custom(@ByPointer in Int32 p)
        @Const def void constMethod()
    }
}`, { documentUri: uri('src/identities.xsmpcat') });
        documents.push(document);
        await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });
        for (const item of documents) {
            expect(item.parseResult.lexerErrors).toEqual([]);
            expect(item.parseResult.parserErrors).toEqual([]);
            expect(item.diagnostics?.filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
        }
        const xml = await new SmpGenerator(services.shared).doGenerateCatalogue(document.parseResult.value, undefined);
        const outputPath = path.join(directory, 'identities.smpcat');
        fs.writeFileSync(outputPath, xml);
        if (hasXmllint()) assertXmlConformsToXsd(outputPath, 'catalogue', standard);
        const root = create(xml).root().node as unknown as Element;
        const elements = [root, ...Array.from(root.getElementsByTagName('*'))];
        const ids = elements.map(element => element.getAttribute('Id')).filter(id => id !== null);
        expect(new Set(ids).size).toBe(ids.length);
        for (const element of elements) {
            if (element.tagName === 'Metadata' || element.tagName === 'Parameter') {
                expect(element.getAttribute('Id')?.startsWith(`${element.parentElement!.getAttribute('Id')}.`)).toBe(true);
            }
        }
        expect(ids).toContain('custom.operation');
        expect(ids).toContain('custom.operation.p');
        expect(ids).toContain('demo.I.constMethod--const-method');
        expect(ids).toContain('demo.I.dispatch-a.T');
        expect(ids).toContain('demo.I.dispatch-b.T');
    });
}
