import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast';
import { createXsmpStarterFileTemplate, getXsmpStarterFileDefaultStem } from '@xsmp/core/wizard/templates';
import { SmpGenerator } from '@xsmp/tool-smp';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { generateDocuments } from '../../xsmp/test/generation-test-utils.js';
import { assertXmlConformsToXsd, hasXmllint } from './xsd-test-utils.js';

let services: ReturnType<typeof createXsmpServices>;
const documents: LangiumDocument[] = [];
let directory: string;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

afterEach(async () => {
    await clearDocuments(services.shared, documents.splice(0));
    fs.rmSync(directory, { recursive: true, force: true });
});

describe.each([undefined, 'ECSS_SMP_2020', 'ECSS_SMP_2025'])('schedule starters with standard %s', standard => {
    test.each([
        [getXsmpStarterFileDefaultStem('schedule'), 'helloWorld'],
        ['mission-control-schedule', 'missionControl'],
    ])('%s validates and exports the root of its companion assembly', async (fileStem, expectedRoot) => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-wizard-schedule-root-'));
        fs.mkdirSync(path.join(directory, 'src'));
        documents.push(await parseHelper(services.xsmpproject)(
            `project 'Starter' ${standard ? `using '${standard}'` : ''}\nsource 'src'`,
            { documentUri: URI.file(path.join(directory, 'xsmp.project')).toString() },
        ));
        for (const [kind, language] of [['catalogue', 'xsmpcat'], ['assembly', 'xsmpasb'], ['schedule', 'xsmpsed']] as const) {
            const template = createXsmpStarterFileTemplate(kind, { fileStem, author: 'tester', date: '2026-11-16T12:00:00Z' });
            documents.push(await parseHelper(services[language])(
                template.content.replace('${uuid}', '58000000-0000-4000-8000-000000000001'),
                { documentUri: URI.file(path.join(directory, 'src', template.fileName)).toString() },
            ));
        }
        await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });
        for (const document of documents) {
            expect(document.parseResult.lexerErrors).toEqual([]);
            expect(document.parseResult.parserErrors).toEqual([]);
            expect(document.diagnostics).toEqual([]);
        }
        const schedule = documents.at(-1)!.parseResult.value;
        const assembly = documents[2].parseResult.value;
        if (!ast.isSchedule(schedule) || !ast.isAssembly(assembly)) throw new Error('Expected companion starters.');
        expect(schedule.parameters).toHaveLength(1);
        expect(schedule.parameters[0]).toMatchObject({ $type: 'StringParameter', name: 'Root', value: expectedRoot });
        expect(assembly.model.name).toBe(expectedRoot);
        expect(schedule.elements.find(ast.isTask)?.context?.ref).toBe(assembly.model.implementation?.ref);

        await generateDocuments(new SmpGenerator(services.shared), [schedule], URI.file(directory));
        const output = path.join(directory, 'smdl-gen', `${fileStem}.smpsed`);
        const xml = fs.readFileSync(output, 'utf8');
        expect(xml).toContain(`<Parameter xsi:type="Assembly:StringArgument" Name="Root" Value="${expectedRoot}"/>`);
        expect(xml).toContain('<EntryPoint>run</EntryPoint>');
        if (hasXmllint()) assertXmlConformsToXsd(output, 'schedule');
    });
});
