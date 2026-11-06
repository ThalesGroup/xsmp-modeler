import { generateDocuments } from '../../xsmp/test/generation-test-utils.js';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type AstNode, type LangiumDocument, URI } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import { SmpGenerator } from '@xsmp/tool-smp';
import * as ast from '@xsmp/core/ast';
import { assertXmlConformsToXsd, hasXmllint, type SmpStandard } from './xsd-test-utils.js';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

let services: ReturnType<typeof createXsmpServices>;
let parseProject: ReturnType<typeof parseHelper<ast.Project>>;
let parseCatalogue: ReturnType<typeof parseHelper<ast.Catalogue>>;
let parseConfiguration: ReturnType<typeof parseHelper<ast.Configuration>>;
let parseLinkBase: ReturnType<typeof parseHelper<ast.LinkBase>>;
let parseAssembly: ReturnType<typeof parseHelper<ast.Assembly>>;
let parseSchedule: ReturnType<typeof parseHelper<ast.Schedule>>;
const documents: LangiumDocument[] = [];

beforeAll(async () => {
  services = createXsmpServices(EmptyFileSystem);
  parseProject = parseHelper<ast.Project>(services.xsmpproject);
  parseCatalogue = parseHelper<ast.Catalogue>(services.xsmpcat);
  parseConfiguration = parseHelper<ast.Configuration>(services.xsmpcfg);
  parseLinkBase = parseHelper<ast.LinkBase>(services.xsmplnk);
  parseAssembly = parseHelper<ast.Assembly>(services.xsmpasb);
  parseSchedule = parseHelper<ast.Schedule>(services.xsmpsed);

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

        await generateDocuments(generator, [document.parseResult.value], projectUri);

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

        await generateDocuments(generator, [document.parseResult.value], projectUri);
        assertXmlConformsToXsd(path.join(tmpDir, 'smdl-gen', 'xsd-demo.smpcfg'), 'configuration', standard);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });
    test(`duration constants conform to the Level 1 XSD (${standard})`, async () => {
      const source = `catalogue Durations
namespace ns {
    /** @uuid 13000000-0000-4000-8000-000000000001 */
    public interface Values {
        constant Duration NegativeNano = "-PT0.000000001S"
        constant Duration WholeDay = "P1D"
        constant Duration NegativeDay = "-P1D"
        constant Duration Zero = "PT0S"
        constant Duration PositiveSecond = "PT1S"
    }
}`;
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-smp-duration-values-'));
      try {
        const { document, projectUri } = await parseInProject(parseCatalogue, source, 'durations.xsmpcat', standard, tmpDir);
        await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });
        expect(document.diagnostics?.filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
        await generateDocuments(new SmpGenerator(services.shared), [document.parseResult.value], projectUri);
        const output = path.join(tmpDir, 'smdl-gen', 'durations.smpcat');
        const xml = fs.readFileSync(output, 'utf8');
        for (const value of ['-PT0.000000001S', 'P1D', '-P1D', 'PT0S', 'PT1S']) {
          expect(xml).toContain(`<Value xsi:type="Types:DurationValue" Value="${value}"/>`);
        }
        assertXmlConformsToXsd(output, 'catalogue', standard);
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

  }

  test('generated link base file conforms to the Level 2 XSD', async () => {
    const source = `link Demo
/Root
{
    interface link svc.ref -> client:back
}
`;

    const generator = new SmpGenerator(services.shared);
    const document = await parseLinkBase(source, { documentUri: 'xsd-demo.xsmplnk' });
    assertParsed(document);

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-smp-xsd-linkbase-'));
    try {
      await generateDocuments(generator, [document.parseResult.value], URI.file(tmpDir));
      assertXmlConformsToXsd(path.join(tmpDir, 'smdl-gen', 'xsd-demo.smplnk'), 'linkbase');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('generated assembly file conforms to the Level 2 XSD', async () => {
    const source = `assembly <count = 1> Demo
configure child/path
{
    subscribe OnTick -> "Tick"
    property flag = true
    count = 1i32
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
      await generateDocuments(generator, [document.parseResult.value], URI.file(tmpDir));
      assertXmlConformsToXsd(path.join(tmpDir, 'smdl-gen', 'xsd-demo.smpasb'), 'assembly');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('generated schedule file conforms to the Level 2 XSD', async () => {
    const source = `schedule <count = 1> Demo epoch "2025-01-01T12:00:00Z" mission "2025-01-02T00:00:00Z"

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
      await generateDocuments(generator, [document.parseResult.value], URI.file(tmpDir));
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

async function parseInProject<T extends AstNode>(
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
