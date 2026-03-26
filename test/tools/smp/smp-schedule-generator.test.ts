import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument, URI } from "langium";
import { expandToString as s } from "langium/generate";
import { clearDocuments, parseHelper } from "langium/test";
import { create as createXml } from 'xmlbuilder2';
import { createXsmpServices } from "../../../src/language/xsmp-module.js";
import { Catalogue, Project, Schedule, isSchedule } from "../../../src/language/generated/ast-partial.js";
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { SmpGenerator } from "../../../src/contributions/tools/smp/generator.js";
import { setGeneratedBy } from "../../../src/language/generator/generator.js";

let services: ReturnType<typeof createXsmpServices>;
let parse: ReturnType<typeof parseHelper<Schedule>>;
let parseProject: ReturnType<typeof parseHelper<Project>>;
let parseCatalogue: ReturnType<typeof parseHelper<Catalogue>>;
const documents: LangiumDocument[] = [];
const tempDirs: string[] = [];

const catalogueSource = `catalogue Demo

namespace demo
{
    public model Root
    {
        field Smp.Int32 countState

        public property Smp.Int32 count -> countState
        public def void apply(in Smp.Int32 nextCount, in Smp.Float64 nextRatio)
    }
}
`;

beforeAll(async () => {
  services = createXsmpServices(EmptyFileSystem);
  parse = parseHelper<Schedule>(services.xsmpsed);
  parseProject = parseHelper<Project>(services.xsmpproject);
  parseCatalogue = parseHelper<Catalogue>(services.xsmpcat);

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

describe('SMP schedule generator tests', () => {

  test('test schedule', async () => {

    const generator = new SmpGenerator(services.shared);
    const document = await parse(fs.readFileSync(path.resolve(__dirname, 'test.xsmpsed')).toString(), { documentUri: 'test.xsmpsed' });
    setGeneratedBy(false);

    const actualXml = checkDocumentValid(document) ??
      await generator.doGenerateSchedule(document.parseResult.value, undefined);

    expect(() => createXml(actualXml)).not.toThrow();

    const expectedPath = path.resolve(__dirname, 'test.smpsed');
    if (process.env.UPDATE_EXPECTATIONS === '1') {
      fs.writeFileSync(expectedPath, actualXml);
    }

    expect(actualXml).toBe(fs.readFileSync(expectedPath).toString());
  });

  test('writes schedule file to disk before returning', async () => {
    const generator = new SmpGenerator(services.shared);
    const document = await parse(fs.readFileSync(path.resolve(__dirname, 'test.xsmpsed')).toString(), { documentUri: 'write-test.xsmpsed' });
    setGeneratedBy(false);

    const parsed = checkDocumentValid(document);
    expect(parsed).toBeUndefined();

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-smp-schedule-'));
    try {
      const projectUri = URI.file(tmpDir);
      await generator.generateSchedule(document!.parseResult.value, projectUri, undefined);

      const schedulePath = path.join(tmpDir, 'smdl-gen', 'write-test.smpsed');
      expect(fs.existsSync(schedulePath)).toBe(true);
      expect(fs.readFileSync(schedulePath).toString()).toBe(fs.readFileSync(path.resolve(__dirname, 'test.smpsed')).toString());
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('preserves templated schedule paths in generated XML', async () => {
    const generator = new SmpGenerator(services.shared);
    const document = await parse(`schedule <Target = "child"> Demo

task Main on demo.Root
{
    call {Target}.reset()
}
`, { documentUri: 'templated-test.xsmpsed' });
    setGeneratedBy(false);

    const actualXml = checkDocumentValid(document) ??
      await generator.doGenerateSchedule(document.parseResult.value, undefined);

    expect(actualXml).toContain('<OperationPath>{Target}.reset</OperationPath>');
    expect(actualXml.includes('unsafe')).toBe(false);
  });

  test('serializes unsuffixed numeric values using the resolved schedule types', async () => {
    const generator = new SmpGenerator(services.shared);
    const document = await parseInProject(`schedule <Root = "root"> Demo

task Main on demo.Root
{
    property count = 2
    call apply(nextCount = 3, nextRatio = 1.5)
}
`);
    setGeneratedBy(false);

    const actualXml = checkDocumentValid(document) ??
      await generator.doGenerateSchedule(document.parseResult.value, undefined);

    expect(actualXml).toContain('<PropertyPath>count</PropertyPath>');
    expect(actualXml).toContain('<Value xsi:type="Types:Int32Value" Value="2"/>');
    expect(actualXml).toContain('<Parameter Parameter="nextCount">');
    expect(actualXml).toContain('<Value xsi:type="Types:Int32Value" Value="3"/>');
    expect(actualXml).toContain('<Parameter Parameter="nextRatio">');
    expect(actualXml).toContain('<Value xsi:type="Types:Float64Value" Value="1.5"/>');
  });
});

async function parseInProject(source: string): Promise<LangiumDocument<Schedule>> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-smp-schedule-project-'));
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
  const scheduleDocument = await parse(source, {
    documentUri: URI.file(path.join(tempDir, 'src', 'demo.xsmpsed')).toString(),
  });

  documents.push(projectDocument, catalogueDocument, scheduleDocument);
  expect(projectDocument.parseResult.parserErrors).toHaveLength(0);
  expect(catalogueDocument.parseResult.parserErrors).toHaveLength(0);
  expect(scheduleDocument.parseResult.parserErrors).toHaveLength(0);
  return scheduleDocument;
}

function checkDocumentValid(document: LangiumDocument): string | undefined {
  return document.parseResult.parserErrors.length && s`
        Parser errors:
          ${document.parseResult.parserErrors.map(e => e.message).join('\n  ')}
    `
    || document.parseResult.value === undefined && `ParseResult is 'undefined'.`
    || !isSchedule(document.parseResult.value) && `Root AST object is a ${document.parseResult.value.$type}, expected a '${Schedule}'.`
    || undefined;
}
