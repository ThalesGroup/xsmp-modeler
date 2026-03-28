import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import type { Diagnostic } from 'vscode-languageserver';
import { DiagnosticSeverity } from 'vscode-languageserver';
import { expect } from 'vitest';
import * as ast from 'xsmp/ast';
import type { Task, XsmpGenerator } from 'xsmp/generator';
import { createBuiltinTestXsmpServices, rebuildTestDocuments } from './test-services.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const fixtureRoot = path.resolve(__dirname, 'fixtures', 'profile-generators');
const fixtureCataloguePath = path.join(fixtureRoot, 'catalogue.xsmpcat');
const fixtureProjectSource = `project 'profile-generators' using 'ECSS_SMP_2025'\nsource 'src'\n`;

export interface ProfileGeneratorTestContext {
    services: Awaited<ReturnType<typeof createBuiltinTestXsmpServices>>;
    parseProject: ReturnType<typeof parseHelper<ast.Project>>;
    parseCatalogue: ReturnType<typeof parseHelper<ast.Catalogue>>;
    documents: LangiumDocument[];
    tempDirs: string[];
}

export async function createProfileGeneratorTestContext(): Promise<ProfileGeneratorTestContext> {
    const services = await createBuiltinTestXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
    return {
        services,
        parseProject: parseHelper<ast.Project>(services.xsmpproject),
        parseCatalogue: parseHelper<ast.Catalogue>(services.xsmpcat),
        documents: [],
        tempDirs: [],
    };
}

export async function cleanupProfileGeneratorTestContext(context: ProfileGeneratorTestContext): Promise<void> {
    if (context.documents.length > 0) {
        await clearDocuments(context.services.shared, context.documents.splice(0));
    }
    while (context.tempDirs.length > 0) {
        fs.rmSync(context.tempDirs.pop()!, { recursive: true, force: true });
    }
}

export async function parseProfileGeneratorFixture(
    context: ProfileGeneratorTestContext,
): Promise<LangiumDocument<ast.Catalogue>> {
    const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-profile-generator-fixture-'));
    context.tempDirs.push(workspaceDir);
    fs.mkdirSync(path.join(workspaceDir, 'src'), { recursive: true });

    const projectDocument = await context.parseProject(fixtureProjectSource, {
        documentUri: URI.file(path.join(workspaceDir, 'xsmp.project')).toString(),
    });
    const catalogueDocument = await context.parseCatalogue(fs.readFileSync(fixtureCataloguePath, 'utf-8'), {
        documentUri: URI.file(path.join(workspaceDir, 'src', path.basename(fixtureCataloguePath))).toString(),
    });
    context.documents.push(projectDocument, catalogueDocument);

    expect(projectDocument.parseResult.parserErrors).toHaveLength(0);
    expect(catalogueDocument.parseResult.parserErrors).toHaveLength(0);

    await rebuildTestDocuments(context.services, [projectDocument, catalogueDocument]);
    expect(getErrorMessages(projectDocument.diagnostics)).toEqual([]);
    expect(getErrorMessages(catalogueDocument.diagnostics)).toEqual([]);

    return catalogueDocument;
}

export async function generateProfileTree(
    context: ProfileGeneratorTestContext,
    generator: XsmpGenerator,
    document: LangiumDocument<ast.Catalogue>,
    prefix: string,
): Promise<string> {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    context.tempDirs.push(outputDir);

    const projectUri = URI.file(outputDir);
    generator.clean(projectUri);

    const tasks: Task[] = [];
    generator.generate(document.parseResult.value, projectUri, task => tasks.push(task));
    for (const task of tasks) {
        await task();
    }

    return outputDir;
}

export function assertGeneratedTree(actualRoot: string, expectedRoot: string): void {
    if (process.env.UPDATE_EXPECTATIONS === '1') {
        syncExpectedTree(actualRoot, expectedRoot);
    }

    expect(fs.existsSync(expectedRoot), `Missing expected tree at ${expectedRoot}`).toBe(true);

    const actualFiles = listRelativeFiles(actualRoot);
    const expectedFiles = listRelativeFiles(expectedRoot);
    expect(actualFiles).toEqual(expectedFiles);

    for (const relativePath of expectedFiles) {
        const actualContent = fs.readFileSync(path.join(actualRoot, relativePath), 'utf-8');
        const expectedContent = fs.readFileSync(path.join(expectedRoot, relativePath), 'utf-8');
        expect(actualContent).toBe(expectedContent);
    }
}

function getErrorMessages(diagnostics: Diagnostic[] | undefined): string[] {
    return diagnostics?.filter(diagnostic => diagnostic.severity === DiagnosticSeverity.Error)
        .map(diagnostic => diagnostic.message) ?? [];
}

function listRelativeFiles(root: string): string[] {
    if (!fs.existsSync(root)) {
        return [];
    }
    const entries: string[] = [];
    walk(root, root, entries);
    return entries.sort((left, right) => left.localeCompare(right));
}

function walk(root: string, current: string, entries: string[]): void {
    for (const dirent of fs.readdirSync(current, { withFileTypes: true })) {
        const absolutePath = path.join(current, dirent.name);
        if (dirent.isDirectory()) {
            walk(root, absolutePath, entries);
            continue;
        }
        entries.push(path.relative(root, absolutePath).split(path.sep).join('/'));
    }
}

function syncExpectedTree(actualRoot: string, expectedRoot: string): void {
    fs.rmSync(expectedRoot, { recursive: true, force: true });
    fs.mkdirSync(expectedRoot, { recursive: true });
    for (const dirent of fs.readdirSync(actualRoot, { withFileTypes: true })) {
        fs.cpSync(path.join(actualRoot, dirent.name), path.join(expectedRoot, dirent.name), { recursive: true });
    }
}
