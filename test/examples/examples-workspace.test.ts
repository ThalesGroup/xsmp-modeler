import { beforeAll, describe, expect, test } from 'vitest';
import { URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import * as path from 'node:path';
import { createXsmpServices } from '../../src/language/xsmp-module.js';

const exampleFolders = [
    '01-foundation',
    '02-avionics',
    '03-payload',
    '04-orbital-segment',
    '05-payload-segment',
    '06-mission-system',
];

const examplesRoot = path.resolve(__dirname, '../../examples');

describe('Examples workspace', () => {
    const services = createXsmpServices(NodeFileSystem);

    beforeAll(async () => {
        await services.shared.workspace.WorkspaceManager.initializeWorkspace(
            exampleFolders.map(folder => ({
                name: folder,
                uri: URI.file(path.join(examplesRoot, folder)),
            }))
        );
    });

    test('loads multi-root workspace without diagnostics', async () => {
        const documents = services.shared.workspace.LangiumDocuments.all.toArray()
            .filter(document => document.uri.scheme === 'file' && document.uri.fsPath.startsWith(examplesRoot))
            .sort((left, right) => left.uri.fsPath.localeCompare(right.uri.fsPath));

        const parserErrors = documents.flatMap(document =>
            document.parseResult.parserErrors.map(error => `${path.relative(examplesRoot, document.uri.fsPath)}: ${error.message}`)
        );
        const diagnostics = documents.flatMap(document =>
            (document.diagnostics ?? []).map(diagnostic =>
                `${path.relative(examplesRoot, document.uri.fsPath)}:${diagnostic.range.start.line + 1}: ${diagnostic.message}`
            )
        );

        expect(parserErrors).toEqual([]);
        expect(diagnostics).toEqual([]);
    });

    test('loads single examples folder without diagnostics', async () => {
        const singleRootServices = createXsmpServices(NodeFileSystem);
        await singleRootServices.shared.workspace.WorkspaceManager.initializeWorkspace([
            {
                name: 'examples',
                uri: URI.file(examplesRoot),
            }
        ]);

        const documents = singleRootServices.shared.workspace.LangiumDocuments.all.toArray()
            .filter(document => document.uri.scheme === 'file' && document.uri.fsPath.startsWith(examplesRoot))
            .sort((left, right) => left.uri.fsPath.localeCompare(right.uri.fsPath));

        const parserErrors = documents.flatMap(document =>
            document.parseResult.parserErrors.map(error => `${path.relative(examplesRoot, document.uri.fsPath)}: ${error.message}`)
        );
        const diagnostics = documents.flatMap(document =>
            (document.diagnostics ?? []).map(diagnostic =>
                `${path.relative(examplesRoot, document.uri.fsPath)}:${diagnostic.range.start.line + 1}: ${diagnostic.message}`
            )
        );

        expect(parserErrors).toEqual([]);
        expect(diagnostics).toEqual([]);
    });
});
