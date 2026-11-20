import { afterEach, describe, expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EmptyFileSystem, URI } from 'langium';
import { parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import type * as ast from '@xsmp/core/ast';
import { createXsmpStarterFileTemplate } from '@xsmp/core/wizard/templates';

const directories: string[] = [];
afterEach(() => {
    for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('starter file namespace identifiers', () => {
    test.each(['class', 'Int', 'Int_config', 'hello-world'])('creates mutually valid starter documents for %s', async fileStem => {
        const services = createXsmpServices(EmptyFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-wizard-keywords-'));
        directories.push(directory);
        fs.mkdirSync(path.join(directory, 'src'));
        const root = URI.file(directory);
        const project = await parseHelper<ast.Project>(services.xsmpproject)("project 'wizard' using 'ECSS_SMP_2025'\nsource 'src'", {
            documentUri: URI.file(`${root.fsPath}/xsmp.project`).toString(),
        });
        const options = { fileStem, author: 'test', date: '2026-11-16T12:00:00Z' };
        const catalogue = createXsmpStarterFileTemplate('catalogue', options);
        const configuration = createXsmpStarterFileTemplate('configuration', options);
        const assembly = createXsmpStarterFileTemplate('assembly', options);
        const uri = (fileName: string) => ({ documentUri: URI.file(`${root.fsPath}/src/${fileName}`).toString() });
        const documents = [
            project,
            await parseHelper<ast.Catalogue>(services.xsmpcat)(catalogue.content.replace('${uuid}', '58000000-0000-4000-8000-000000000001'), uri(catalogue.fileName)),
            await parseHelper<ast.Configuration>(services.xsmpcfg)(configuration.content, uri(configuration.fileName)),
            await parseHelper<ast.Assembly>(services.xsmpasb)(assembly.content, uri(assembly.fileName)),
        ];
        await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });
        for (const document of documents) {
            expect(document.parseResult.parserErrors).toEqual([]);
            expect(document.diagnostics?.filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
        }
    });
});
