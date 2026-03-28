import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, URI, type LangiumDocument } from "langium";
import { expandToString as s } from "langium/generate";
import { parseHelper, ParseHelperOptions } from "langium/test";
import type { Diagnostic } from "vscode-languageserver-types";
import { Project, isProject, } from 'xsmp/ast-partial';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createBuiltinTestXsmpServices } from '../test-services.js';

let services: Awaited<ReturnType<typeof createBuiltinTestXsmpServices>>;
let parse: ReturnType<typeof parseHelper<Project>>;
let document: LangiumDocument<Project> | undefined;

beforeAll(async () => {
    services = await createBuiltinTestXsmpServices(EmptyFileSystem);
    const doParse = parseHelper<Project>(services.xsmpproject);
    parse = (input: string, options?: ParseHelperOptions) => doParse(input, { validation: true, ...options});

    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

describe('Validating Xsmpproject', () => {

    test('check no errors', async () => {
        document = await parse(`
            project "test"

            profile "xsmp-sdk"


            tool "smp"
            tool "adoc"

        `, { documentUri: 'xsmp.project' });


        expect(checkDocumentValid(document) ?? document.diagnostics?.map(diagnosticToString)?.join('\n')).toHaveLength(0)


    });

    test('With errors', async () => {
        document = await parse(`
            project "project-name"

            profile "org.eclipse.xsmp.profile.xsmp-sdk"
            profile "org.eclipse.xsmp.profile.xsmp-sdk"

            tool "org.eclipse.xsmp.tool.smp"
            tool "adoc"
            tool "adoc"
            tool "unknown"

            source "smdl"
            source "../"

            dependency "project-name"
            dependency "project-name"
            dependency "dep"
        `, { documentUri: 'test/ns/xsmp.project'});

        expect(
            checkDocumentValid(document) ?? document.diagnostics?.map(diagnosticToString)?.join('\n')
        ).toBe(s`
            [9:17..9:26]: Could not resolve reference to Tool named 'unknown'.
            [16:23..16:28]: Could not resolve reference to Project named 'dep'.
            [3:20..3:55]: Deprecated: Use the "xsmp-sdk" profile instead.
            [4:20..4:55]: Deprecated: Use the "xsmp-sdk" profile instead.
            [4:20..4:55]: A profile is already defined.
            [6:17..6:44]: Deprecated: Use the "smp" tool instead.
            [8:17..8:23]: Duplicated tool 'adoc'.
            [11:19..11:25]: Source path 'smdl' does not exist.
            [12:19..12:24]: Source path '../' is not contained within the project directory.
            [14:23..14:37]: Cyclic dependency detected 'project-name'.
            [15:23..15:37]: Cyclic dependency detected 'project-name'.
            [15:23..15:37]: Duplicated dependency 'project-name'.
        `);
    });

    test('Source paths enforce directory boundaries', async () => {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-project-validating-'));
        try {
            const projectDir = path.join(tmpDir, 'project');
            fs.mkdirSync(path.join(projectDir, 'smdl'), { recursive: true });
            fs.mkdirSync(path.join(tmpDir, 'project2', 'smdl'), { recursive: true });

            document = await parse(`
                project "project"

                source "../project2/smdl"
            `, {
                documentUri: URI.file(path.join(projectDir, 'xsmp.project')).toString()
            });

            expect(
                document.diagnostics?.map(diagnosticToString).join('\n')
            ).toContain(`Source path '../project2/smdl' is not contained within the project directory.`);
        } finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });
});

function checkDocumentValid(document: LangiumDocument): string | undefined {
    return document.parseResult.parserErrors.length && s`
        Parser errors: ${document.parseResult.parserErrors.map(e => e.message).join('\n  ')}
    `
        || document.parseResult.value === undefined && `ParseResult is 'undefined'.`
        || !isProject(document.parseResult.value) && `Root AST object is a ${document.parseResult.value.$type}, expected a '${Project}'.`
        || undefined;
}

function diagnosticToString(d: Diagnostic) {
    return `[${d.range.start.line}:${d.range.start.character}..${d.range.end.line}:${d.range.end.character}]: ${d.message}`;
}
