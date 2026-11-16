import { afterEach, expect, test } from 'vitest';
import { EmptyFileSystem, URI, type LangiumDocument } from 'langium';
import { parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach(directory => rmSync(directory, { recursive: true, force: true })));

test.each([
    { suffix: '', argument: undefined, child: 'Child' },
    { suffix: 'A', argument: undefined, child: 'ChildA' },
    { suffix: 'A', argument: '', child: 'Nested.Child' },
])('resolves instance paths with $suffix and override $argument', async ({ suffix, argument, child }) => {
    const services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
    const directory = mkdtempSync(join(tmpdir(), 'xsmp-empty-template-'));
    directories.push(directory);
    mkdirSync(join(directory, 'src'));
    const documents: LangiumDocument[] = [];
    const parse = async (language: 'xsmpproject' | 'xsmpcat' | 'xsmpasb' | 'xsmpsed', file: string, text: string) => {
        const document = await parseHelper(services[language])(text, { documentUri: URI.file(join(directory, file)).toString() });
        documents.push(document);
        return document;
    };
    await parse('xsmpproject', 'xsmp.project', 'project "Demo" using "ECSS_SMP_2025" source "src"');
    await parse('xsmpcat', 'src/types.xsmpcat', `catalogue Types namespace demo {
        /** @uuid 5612662f-7784-4c79-b14e-7f63ab20cbf2 */
        public model Child { public def void reset() }
        /** @uuid a85d5837-56b5-4fe6-a3b2-13b321724ab3 */
        public model Root { container Smp.IComponent* children }
    }`);
    await parse('xsmpasb', 'src/base.xsmpasb', `assembly <Suffix="${suffix}"> Base
        Root: demo.Root { children += Child{Suffix}: demo.Child }`);
    if (argument !== undefined) {
        await parse('xsmpasb', 'src/top.xsmpasb', `assembly Top
            Root: demo.Root { children += Nested: Base<Suffix="${argument}"> }`);
    }
    await parse('xsmpsed', 'src/tasks.xsmpsed', `schedule <Root="root"> Tasks
        task Main on ${argument === undefined ? 'Base' : 'Top'} { call ${child}.reset() }`);
    await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });
    for (const document of documents) {
        expect(document.parseResult.lexerErrors).toEqual([]);
        expect(document.parseResult.parserErrors).toEqual([]);
        expect(document.diagnostics).toEqual([]);
    }
});
