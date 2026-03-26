import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, URI, type LangiumDocument } from "langium";
import { expandToString as s } from "langium/generate";
import { clearDocuments, parseHelper } from "langium/test";
import { createXsmpServices } from "../../src/language/xsmp-module.js";
import { ExecuteTask, Project, Schedule, isExecuteTask, isProject, isSchedule } from "../../src/language/generated/ast.js";
import * as ast from "../../src/language/generated/ast.js";
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let services: ReturnType<typeof createXsmpServices>;
let parseProject: ReturnType<typeof parseHelper<Project>>;
let parse: ReturnType<typeof parseHelper<Schedule>>;
let documents: LangiumDocument[] = [];
let tmpDir: string | undefined;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parseProject = parseHelper<Project>(services.xsmpproject);
    parse = parseHelper<Schedule>(services.xsmpsed);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

afterEach(async () => {
    if (documents.length > 0) {
        await clearDocuments(services.shared, documents);
        documents = [];
    }
    if (tmpDir) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        tmpDir = undefined;
    }
});

describe('Linking tests', () => {

    test('linking of schedules respects project visibility', async () => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-sed-linking-'));

        documents.push(await parseProjectDocument(path.join(tmpDir, 'dep'), 'dep'));
        documents.push(await parseDocument(path.join(tmpDir, 'dep', 'src', 'hidden.xsmpsed'), `
            schedule Hidden

            task Child
            {
            }
        `));

        documents.push(await parseProjectDocument(path.join(tmpDir, 'app'), 'app', 'dep'));
        const dependentDocument = await parseDocument(path.join(tmpDir, 'app', 'src', 'visible.xsmpsed'), `
            schedule Visible

            task Main
            {
                execute Hidden.Child
            }
        `);
        documents.push(dependentDocument);

        documents.push(await parseProjectDocument(path.join(tmpDir, 'isolated'), 'isolated'));
        const isolatedDocument = await parseDocument(path.join(tmpDir, 'isolated', 'src', 'visible.xsmpsed'), `
            schedule Visible

            task Main
            {
                execute Hidden.Child
            }
        `);
        documents.push(isolatedDocument);

        expect(
            checkScheduleDocumentValid(dependentDocument)
            ?? checkScheduleDocumentValid(isolatedDocument)
            ?? s`
            Dependent:
                ${getExecuteTask(dependentDocument).task.ref?.name ?? '<unresolved>'}
            Isolated:
                ${getExecuteTask(isolatedDocument).task.ref?.name ?? '<unresolved>'}
        `
        ).toBe(s`
            Dependent:
                Child
            Isolated:
                <unresolved>
        `);
    });
});

async function parseProjectDocument(projectDir: string, name: string, dependency?: string): Promise<LangiumDocument<Project>> {
    fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
    const document = await parseProject(`
        project "${name}" using "ECSS_SMP_2020"
        ${dependency ? `dependency "${dependency}"` : ''}
        source "src"
    `, {
        documentUri: URI.file(path.join(projectDir, 'xsmp.project')).toString(),
    });
    expect(checkProjectDocumentValid(document)).toBeUndefined();
    return document;
}

async function parseDocument(documentPath: string, input: string): Promise<LangiumDocument<Schedule>> {
    return parse(input, {
        documentUri: URI.file(documentPath).toString(),
    });
}

function getExecuteTask(document: LangiumDocument<Schedule>): ExecuteTask {
    const schedule = document.parseResult.value;
    const task = schedule.elements.find(ast.isTask);
    const activity = task?.elements.find(isExecuteTask);
    expect(activity).toBeDefined();
    return activity as ExecuteTask;
}

function checkScheduleDocumentValid(document: LangiumDocument): string | undefined {
    return document.parseResult.parserErrors.length && s`
        Parser errors:
          ${document.parseResult.parserErrors.map(e => e.message).join('\n  ')}
    `
        || document.parseResult.value === undefined && `ParseResult is 'undefined'.`
        || !isSchedule(document.parseResult.value) && `Root AST object is a ${document.parseResult.value.$type}, expected a '${Schedule}'.`
        || undefined;
}

function checkProjectDocumentValid(document: LangiumDocument): string | undefined {
    return document.parseResult.parserErrors.length && s`
        Parser errors:
          ${document.parseResult.parserErrors.map(e => e.message).join('\n  ')}
    `
        || document.parseResult.value === undefined && `ParseResult is 'undefined'.`
        || !isProject(document.parseResult.value) && `Root AST object is a ${document.parseResult.value.$type}, expected a '${Project}'.`
        || undefined;
}
