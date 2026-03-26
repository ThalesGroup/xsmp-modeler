import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from '../../../src/language/xsmp-module.js';
import { SmpGenerator } from '../../../src/language/tools/smp/generator.js';
import {
  Assembly,
  Catalogue,
  Configuration,
  LinkBase,
  Project,
  Schedule,
} from '../../../src/language/generated/ast.js';
import { assertXmlConformsToXsd, hasXmllint, type SmpStandard } from './xsd-test-utils.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let services: ReturnType<typeof createXsmpServices>;
let parseProject: ReturnType<typeof parseHelper<Project>>;
let parseCatalogue: ReturnType<typeof parseHelper<Catalogue>>;
let parseConfiguration: ReturnType<typeof parseHelper<Configuration>>;
let parseLinkBase: ReturnType<typeof parseHelper<LinkBase>>;
let parseAssembly: ReturnType<typeof parseHelper<Assembly>>;
let parseSchedule: ReturnType<typeof parseHelper<Schedule>>;
const documents: LangiumDocument[] = [];

beforeAll(async () => {
  services = createXsmpServices(EmptyFileSystem);
  parseProject = parseHelper<Project>(services.xsmpproject);
  parseCatalogue = parseHelper<Catalogue>(services.xsmpcat);
  parseConfiguration = parseHelper<Configuration>(services.xsmpcfg);
  parseLinkBase = parseHelper<LinkBase>(services.xsmplnk);
  parseAssembly = parseHelper<Assembly>(services.xsmpasb);
  parseSchedule = parseHelper<Schedule>(services.xsmpsed);

  await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

afterEach(async () => {
  if (documents.length > 0) {
    await clearDocuments(services.shared, documents.splice(0));
  }
});

describe.skipIf(!hasXmllint())('SMP XSD conformance tests', () => {
  for (const standard of ['ECSS_SMP_2020', 'ECSS_SMP_2025'] as const) {
    test(`generated catalogue and package files conform to the Level 1 XSD (${standard})`, async () => {
      const source = `catalogue Demo

namespace ns
{
    /** @uuid 11111111-1111-1111-1111-111111111111 */
    public enum Mode
    {
        Off = 0,
        On = 1
    }
}
`;

      const generator = new SmpGenerator(services.shared);
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `xsmp-smp-xsd-catalogue-${standard}-`));
      try {
        const { document, projectUri } = await parseInProject(parseCatalogue, source, 'xsd-demo.xsmpcat', standard, tmpDir);

        await generator.generateCatalogue(document.parseResult.value, projectUri, undefined);
        await generator.generatePackage(document.parseResult.value, projectUri, undefined);

        assertXmlConformsToXsd(path.join(tmpDir, 'smdl-gen', 'xsd-demo.smpcat'), 'catalogue', standard);
        assertXmlConformsToXsd(path.join(tmpDir, 'smdl-gen', 'xsd-demo.smppkg'), 'package', standard);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    test(`generated configuration file conforms to the Level 1 XSD (${standard})`, async () => {
      const source = `configuration Demo
/Root
{
    flag = true
}
include Other at child
`;

      const generator = new SmpGenerator(services.shared);
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `xsmp-smp-xsd-configuration-${standard}-`));
      try {
        const { document, projectUri } = await parseInProject(parseConfiguration, source, 'xsd-demo.xsmpcfg', standard, tmpDir);

        await generator.generateConfiguration(document.parseResult.value, projectUri, undefined);
        assertXmlConformsToXsd(path.join(tmpDir, 'smdl-gen', 'xsd-demo.smpcfg'), 'configuration', standard);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  }

  test('generated link base file conforms to the Level 2 XSD', async () => {
    const source = `link Demo
/Root
{
    interface link svc: ref -> client: back
}
`;

    const generator = new SmpGenerator(services.shared);
    const document = await parseLinkBase(source, { documentUri: 'xsd-demo.xsmplnk' });
    assertParsed(document);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-smp-xsd-linkbase-'));
    try {
      await generator.generateLinkBase(document.parseResult.value, URI.file(tmpDir), undefined);
      assertXmlConformsToXsd(path.join(tmpDir, 'smdl-gen', 'xsd-demo.smplnk'), 'linkbase');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('generated assembly file conforms to the Level 2 XSD', async () => {
    const source = `assembly <count = 1> Demo
configure child/path
{
    property flag = true
}
Root: pkg.Comp
{
    field link src.out -> dst.in
    property flag = true
}
`;

    const generator = new SmpGenerator(services.shared);
    const document = await parseAssembly(source, { documentUri: 'xsd-demo.xsmpasb' });
    assertParsed(document);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-smp-xsd-assembly-'));
    try {
      await generator.generateAssembly(document.parseResult.value, URI.file(tmpDir), undefined);
      assertXmlConformsToXsd(path.join(tmpDir, 'smdl-gen', 'xsd-demo.smpasb'), 'assembly');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('generated schedule file conforms to the Level 2 XSD', async () => {
    const source = `schedule <count = 1> Demo

task Child
{
    trig /Sim/Comp.ep
}

task Main
{
    emit "Tick"
    execute Child<count = 2> at /AssemblyRoot
}

event Main mission "PT1S"
event Main on "BootCompleted" until "ShutdownRequested" using mission delay "PT5S" cycle "PT30S" repeat 4
`;

    const generator = new SmpGenerator(services.shared);
    const document = await parseSchedule(source, { documentUri: 'xsd-demo.xsmpsed' });
    assertParsed(document);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-smp-xsd-schedule-'));
    try {
      await generator.generateSchedule(document.parseResult.value, URI.file(tmpDir), undefined);
      assertXmlConformsToXsd(path.join(tmpDir, 'smdl-gen', 'xsd-demo.smpsed'), 'schedule');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

function assertParsed(document: LangiumDocument): void {
  expect(document.parseResult.parserErrors).toHaveLength(0);
  expect(document.parseResult.value).toBeDefined();
}

async function parseInProject<T>(
  parser: ReturnType<typeof parseHelper<T>>,
  source: string,
  fileName: string,
  standard: SmpStandard,
  projectRoot: string,
): Promise<{ document: LangiumDocument<T>; projectUri: URI }> {
  const projectDocument = await parseProject(
    `project "Demo" using "${standard}"
source "src"
`,
    { documentUri: URI.file(path.join(projectRoot, 'xsmp.project')).toString() }
  );
  documents.push(projectDocument);
  assertParsed(projectDocument);

  const document = await parser(source, {
    documentUri: URI.file(path.join(projectRoot, 'src', fileName)).toString(),
  });
  documents.push(document);
  assertParsed(document);

  return { document, projectUri: URI.file(projectRoot) };
}
