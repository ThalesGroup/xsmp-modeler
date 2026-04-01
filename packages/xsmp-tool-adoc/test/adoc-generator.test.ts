import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { Cancellation, EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { expandToString as s } from 'langium/generate';
import { clearDocuments, parseHelper } from 'langium/test';
import { DiagnosticSeverity } from 'vscode-languageserver-types';
import { createXsmpServices } from 'xsmp';
import * as ast from 'xsmp/ast';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ADocGenerator, xsmpContributionPackage } from '@xsmp/tool-adoc';
import { setGeneratedBy } from 'xsmp/generator';
import { rebuildTestDocuments } from '../../xsmp/test/test-services.js';

let services: ReturnType<typeof createXsmpServices>;
let parseProject: ReturnType<typeof parseHelper<ast.Project>>;
let parseCatalogue: ReturnType<typeof parseHelper<ast.Catalogue>>;
let parseConfiguration: ReturnType<typeof parseHelper<ast.Configuration>>;
let parseAssembly: ReturnType<typeof parseHelper<ast.Assembly>>;
let parseLinkBase: ReturnType<typeof parseHelper<ast.LinkBase>>;
let parseSchedule: ReturnType<typeof parseHelper<ast.Schedule>>;
const documents: LangiumDocument[] = [];
const tempDirs: string[] = [];

const projectSource = `project "Demo" using "ECSS_SMP_2025"
source "src"
`;

const catalogueSource = `/**
 * Demo catalogue used by adoc tests.
 * @title Demo Catalogue
 * @creator test-suite
 * @date 2026-03-27T08:00:00Z
 * @version 1.0
 */
catalogue Demo

namespace demo
{
    /** @uuid 10000000-0000-0000-0000-000000000001 */
    public event ModeEvent extends Smp.Bool

    /** @uuid 10000000-0000-0000-0000-000000000002 */
    public interface Logger
    {
        def void log(in Smp.String8 message)
    }

    /** @uuid 10000000-0000-0000-0000-000000000003 */
    public array IntPair = Smp.Int32[2]

    /** @uuid 10000000-0000-0000-0000-000000000004 */
    public struct NestedState
    {
        field Smp.Int32 count
    }

    /** @uuid 10000000-0000-0000-0000-000000000005 */
    public struct ComplexState
    {
        field NestedState nested
        field Smp.Bool enabled
        field IntPair values
    }

    /** @uuid 10000000-0000-0000-0000-000000000006 */
    public model Child implements demo.Logger
    {
        input field Smp.Int32 inValue
        output field Smp.Int32 outValue
        public property Smp.Int32 state -> outValue
        public def void reset()
        public def void log(in Smp.String8 message)
        entrypoint tick
        eventsink demo.ModeEvent inbound
        eventsource demo.ModeEvent outbound
        reference demo.Logger? backLogger
    }

    /** @uuid 10000000-0000-0000-0000-000000000007 */
    public model Root implements demo.Logger
    {
        field ComplexState state
        field Smp.Int32 countState
        input field Smp.Int32 inValue
        output field Smp.Int32 outValue
        public property Smp.Int32 count -> countState
        public def void apply(in Smp.Int32 nextCount, in Smp.Float64 nextRatio)
        public def void log(in Smp.String8 message)
        container Child child = demo.Child
        reference demo.Logger? logger
        entrypoint run
        eventsink demo.ModeEvent inbound
        eventsource demo.ModeEvent outbound
    }
}
`;

const includedConfigurationSource = `/** Included configuration reused by DemoConfig. */
configuration ChildPreset
`;

const configurationSource = `/**
 * Root configuration for the demo system.
 * @title Demo Configuration
 * @creator test-suite
 * @date 2026-03-27T08:05:00Z
 * @version 1.0
 */
configuration DemoConfig

/** Root component configuration. */
/root: demo.Root
{
    /** Shared child calibration. */
    include ChildPreset at child
    /** Complex structured state. */
    state = { nested = { count = 3 }, enabled = true, values = [1, 2] }
    /** Direct field override. */
    countState = 4
    /** Nested child configuration. */
    child: demo.Child
    {
        /** Output seed. */
        outValue = 7
    }
}
`;

const assemblySource = `/**
 * Demo assembly covering configure blocks, statements and links.
 * @title Demo Assembly
 * @creator test-suite
 * @date 2026-03-27T08:10:00Z
 * @version 1.0
 */
assembly DemoAssembly

/** Applies local child defaults before startup. */
configure Child
{
    /** Child output seed. */
    outValue = 1
    /** Local property initialization. */
    property state = 2
    /** Child reset call. */
    call reset()
    /** Child cycle subscription. */
    subscribe tick -> "CycleStart"
}

/** Root demo model instance. */
Root: demo.Root
{
    /** Initial state count. */
    countState = 4
    /** Child instance. */
    child += Child: demo.Child
    /** Public property initialization. */
    property count = 3
    /** Startup apply call. */
    call apply(nextCount = 5, nextRatio = 1.5)
    /** Root startup subscription. */
    subscribe run -> "MissionStart"
    /** Output field routing. */
    field link outValue -> Child.inValue
    /** Event propagation. */
    event link outbound -> Child.inbound
    /** Logger publication. */
    interface link logger -> Child:backLogger
}
`;

const linkBaseSource = `/**
 * Demo link base for the root model wiring.
 * @title Demo Link Base
 * @creator test-suite
 * @date 2026-03-27T08:15:00Z
 * @version 1.0
 */
link DemoLinks for DemoAssembly

/** Root link definitions. */
/
{
    /** Output field routing. */
    field link outValue -> Child.inValue
    /** Event propagation. */
    event link outbound -> Child.inbound
    /** Logger publication. */
    interface link logger -> Child:backLogger
}
`;

const scheduleSource = `/**
 * Demo schedule exercising all supported activity kinds.
 * @title Demo Schedule
 * @creator test-suite
 * @date 2026-03-27T08:20:00Z
 * @version 1.0
 */
schedule <root: string = "/Root"> DemoSchedule epoch "2025-01-01T00:00:00Z" mission "2025-01-01T00:00:00Z"

/** Root orchestration task. */
task Dispatch on demo.Root
{
    /** Property update. */
    property count = 2
    /** Apply call. */
    call apply(nextCount = 3, nextRatio = 1.5)
    /** Data transfer. */
    transfer outValue -> Child.inValue
    /** Root trigger. */
    trig run
    /** Child task execution. */
    execute ChildTick at Child
    /** Mission-ready emission. */
    async emit "MissionReady"
}

/** Child execution task. */
task ChildTick on demo.Child
{
    /** Child trigger. */
    trig tick
}

/** Mission-relative start. */
event Dispatch mission "PT15S"
/** Event-driven child follow-up. */
event ChildTick on "MissionReady" using epoch delay "PT10S" cycle "PT1M" repeat 2
/** Simulation-time child pulse. */
event ChildTick simulation "PT20S"
/** Absolute child pulse. */
event ChildTick zulu "2025-01-01T00:01:00Z"
`;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parseProject = parseHelper<ast.Project>(services.xsmpproject);
    parseCatalogue = parseHelper<ast.Catalogue>(services.xsmpcat);
    parseConfiguration = parseHelper<ast.Configuration>(services.xsmpcfg);
    parseAssembly = parseHelper<ast.Assembly>(services.xsmpasb);
    parseLinkBase = parseHelper<ast.LinkBase>(services.xsmplnk);
    parseSchedule = parseHelper<ast.Schedule>(services.xsmpsed);

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

describe('ADoc generator tests', () => {
    test('test catalogue', async () => {
        const generator = new ADocGenerator(services.shared);
        const document = await parseCatalogue(
            fs.readFileSync(path.resolve(__dirname, 'Test.xsmpcat')).toString(),
            { documentUri: 'Test.xsmpcat' },
        );
        setGeneratedBy(false);

        const actual = checkDocumentValid(document, ast.isCatalogue, ast.Catalogue.$type)
            ?? await generator.doGenerateCatalogue(document.parseResult.value);

        expect(actual).toBe(fs.readFileSync(path.resolve(__dirname, 'Test-gen.adoc')).toString());
    });

    test('test configuration', async () => {
        const generator = new ADocGenerator(services.shared);
        const fixture = await createFixtureDocuments({
            'demo.xsmpcat': catalogueSource,
            'child-preset.xsmpcfg': includedConfigurationSource,
            'config-doc.xsmpcfg': configurationSource,
        });
        const document = fixture['config-doc.xsmpcfg'] as LangiumDocument<ast.Configuration>;
        setGeneratedBy(false);

        const actual = checkDocumentValid(document, ast.isConfiguration, ast.Configuration.$type)
            ?? await generator.doGenerateConfiguration(document.parseResult.value);

        assertGolden('config-doc-gen.adoc', actual);
    });

    test('test assembly', async () => {
        const generator = new ADocGenerator(services.shared);
        const fixture = await createFixtureDocuments({
            'demo.xsmpcat': catalogueSource,
            'assembly-doc.xsmpasb': assemblySource,
        });
        const document = fixture['assembly-doc.xsmpasb'] as LangiumDocument<ast.Assembly>;
        setGeneratedBy(false);

        const actual = checkDocumentValid(document, ast.isAssembly, ast.Assembly.$type)
            ?? await generator.doGenerateAssembly(document.parseResult.value);

        assertGolden('assembly-doc-gen.adoc', actual);
    });

    test('test link base', async () => {
        const generator = new ADocGenerator(services.shared);
        const fixture = await createFixtureDocuments({
            'demo.xsmpcat': catalogueSource,
            'demo-assembly.xsmpasb': assemblySource,
            'links-doc.xsmplnk': linkBaseSource,
        });
        const document = fixture['links-doc.xsmplnk'] as LangiumDocument<ast.LinkBase>;
        setGeneratedBy(false);

        const actual = checkDocumentValid(document, ast.isLinkBase, ast.LinkBase.$type)
            ?? await generator.doGenerateLinkBase(document.parseResult.value);

        assertGolden('links-doc-gen.adoc', actual);
    });

    test('test schedule', async () => {
        const generator = new ADocGenerator(services.shared);
        const fixture = await createFixtureDocuments({
            'demo.xsmpcat': catalogueSource,
            'schedule-doc.xsmpsed': scheduleSource,
        });
        const document = fixture['schedule-doc.xsmpsed'] as LangiumDocument<ast.Schedule>;
        setGeneratedBy(false);

        const actual = checkDocumentValid(document, ast.isSchedule, ast.Schedule.$type)
            ?? await generator.doGenerateSchedule(document.parseResult.value);

        assertGolden('schedule-doc-gen.adoc', actual);
    });

    test('writes basename-based output files for every supported DSL', async () => {
        const generator = new ADocGenerator(services.shared);
        const fixture = await createFixtureDocuments({
            'demo.xsmpcat': catalogueSource,
            'child-preset.xsmpcfg': includedConfigurationSource,
            'config-doc.xsmpcfg': configurationSource,
            'assembly-doc.xsmpasb': assemblySource,
            'links-doc.xsmplnk': linkBaseSource,
            'schedule-doc.xsmpsed': scheduleSource,
        });
        setGeneratedBy(false);

        const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-adoc-output-'));
        tempDirs.push(outputDir);
        const projectUri = URI.file(outputDir);

        await generator.generateCatalogue((fixture['demo.xsmpcat'] as LangiumDocument<ast.Catalogue>).parseResult.value, projectUri);
        await generator.generateConfiguration((fixture['config-doc.xsmpcfg'] as LangiumDocument<ast.Configuration>).parseResult.value, projectUri);
        await generator.generateAssembly((fixture['assembly-doc.xsmpasb'] as LangiumDocument<ast.Assembly>).parseResult.value, projectUri);
        await generator.generateLinkBase((fixture['links-doc.xsmplnk'] as LangiumDocument<ast.LinkBase>).parseResult.value, projectUri);
        await generator.generateSchedule((fixture['schedule-doc.xsmpsed'] as LangiumDocument<ast.Schedule>).parseResult.value, projectUri);

        expect(fs.existsSync(path.join(outputDir, 'adoc-gen', 'demo-gen.adoc'))).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'adoc-gen', 'config-doc-gen.adoc'))).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'adoc-gen', 'assembly-doc-gen.adoc'))).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'adoc-gen', 'links-doc-gen.adoc'))).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'adoc-gen', 'schedule-doc-gen.adoc'))).toBe(true);
    });

    test('project generation produces one AsciiDoc output per supported source document', async () => {
        const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-adoc-workspace-'));
        tempDirs.push(workspaceDir);

        fs.mkdirSync(path.join(workspaceDir, 'src'), { recursive: true });
        fs.writeFileSync(path.join(workspaceDir, 'xsmp.project'), `${projectSource}tool "adoc"\n`);
        fs.writeFileSync(path.join(workspaceDir, 'src', 'demo.xsmpcat'), catalogueSource);
        fs.writeFileSync(path.join(workspaceDir, 'src', 'child-preset.xsmpcfg'), includedConfigurationSource);
        fs.writeFileSync(path.join(workspaceDir, 'src', 'config-doc.xsmpcfg'), configurationSource);
        fs.writeFileSync(path.join(workspaceDir, 'src', 'assembly-doc.xsmpasb'), assemblySource);
        fs.writeFileSync(path.join(workspaceDir, 'src', 'links-doc.xsmplnk'), linkBaseSource);
        fs.writeFileSync(path.join(workspaceDir, 'src', 'schedule-doc.xsmpsed'), scheduleSource);

        const workspaceServices = createXsmpServices(NodeFileSystem);
        const report = await workspaceServices.shared.ContributionRegistry.registerBuiltinPackages([xsmpContributionPackage]);
        expect(report.failures).toEqual([]);

        await workspaceServices.shared.workspace.WorkspaceManager.initializeWorkspace([
            { name: 'demo', uri: URI.file(workspaceDir).toString() },
        ]);

        const project = workspaceServices.shared.workspace.ProjectManager.getProjects().find(candidate => candidate.name === 'Demo');
        expect(project).toBeDefined();

        const generationReport = await workspaceServices.shared.DocumentGenerator.generateValidatedProject(
            project!,
            Cancellation.CancellationToken.None,
        );

        expect(generationReport.generatedProjects).toEqual(['Demo']);
        expect(generationReport.skippedProjects).toEqual([]);
        expect(fs.existsSync(path.join(workspaceDir, 'adoc-gen', 'demo-gen.adoc'))).toBe(true);
        expect(fs.existsSync(path.join(workspaceDir, 'adoc-gen', 'child-preset-gen.adoc'))).toBe(true);
        expect(fs.existsSync(path.join(workspaceDir, 'adoc-gen', 'config-doc-gen.adoc'))).toBe(true);
        expect(fs.existsSync(path.join(workspaceDir, 'adoc-gen', 'assembly-doc-gen.adoc'))).toBe(true);
        expect(fs.existsSync(path.join(workspaceDir, 'adoc-gen', 'links-doc-gen.adoc'))).toBe(true);
        expect(fs.existsSync(path.join(workspaceDir, 'adoc-gen', 'schedule-doc-gen.adoc'))).toBe(true);
    });
});

async function createFixtureDocuments(files: Record<string, string>): Promise<Record<string, LangiumDocument>> {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-adoc-fixture-'));
    tempDirs.push(tempDir);
    fs.mkdirSync(path.join(tempDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'xsmp.project'), projectSource);

    const parsed: Record<string, LangiumDocument> = {};
    const projectDocument = await parseProject(projectSource, {
        documentUri: URI.file(path.join(tempDir, 'xsmp.project')).toString(),
    });
    parsed['xsmp.project'] = projectDocument;

    for (const [fileName, content] of Object.entries(files)) {
        const parser = getParserForFile(fileName);
        fs.writeFileSync(path.join(tempDir, 'src', fileName), content);
        parsed[fileName] = await parser(content, {
            documentUri: URI.file(path.join(tempDir, 'src', fileName)).toString(),
        });
    }

    const parsedDocuments = Object.values(parsed);
    documents.push(...parsedDocuments);
    parsedDocuments.forEach(document => expect(document.parseResult.parserErrors).toHaveLength(0));
    await rebuildTestDocuments(services, parsedDocuments);
    parsedDocuments.forEach(document => {
        const errors = document.diagnostics?.filter(diagnostic => diagnostic.severity === DiagnosticSeverity.Error)
            .map(diagnostic => diagnostic.message) ?? [];
        expect(errors).toEqual([]);
    });

    return parsed;
}

function getParserForFile(fileName: string) {
    if (fileName.endsWith('.xsmpcat')) return parseCatalogue;
    if (fileName.endsWith('.xsmpcfg')) return parseConfiguration;
    if (fileName.endsWith('.xsmpasb')) return parseAssembly;
    if (fileName.endsWith('.xsmplnk')) return parseLinkBase;
    if (fileName.endsWith('.xsmpsed')) return parseSchedule;
    throw new Error(`Unsupported fixture file '${fileName}'.`);
}

function assertGolden(fileName: string, actual: string): void {
    const expectedPath = path.resolve(__dirname, fileName);
    if (process.env.UPDATE_EXPECTATIONS === '1') {
        fs.writeFileSync(expectedPath, actual);
    }
    expect(actual).toBe(fs.readFileSync(expectedPath).toString());
}

function checkDocumentValid<T extends AstNode>(
    document: LangiumDocument,
    predicate: (value: unknown) => value is T,
    expectedType: string,
): string | undefined {
    return document.parseResult.parserErrors.length && s`
        Parser errors:
          ${document.parseResult.parserErrors.map(error => error.message).join('\n  ')}
    `
        || document.parseResult.value === undefined && `ParseResult is 'undefined'.`
        || !predicate(document.parseResult.value) && `Root AST object is a ${document.parseResult.value.$type}, expected a '${expectedType}'.`
        || undefined;
}
