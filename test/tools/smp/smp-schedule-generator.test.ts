import { beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument, URI } from "langium";
import { expandToString as s } from "langium/generate";
import { parseHelper } from "langium/test";
import { create as createXml } from 'xmlbuilder2';
import { createXsmpServices } from "../../../src/language/xsmp-module.js";
import { Schedule, isSchedule } from "../../../src/language/generated/ast.js";
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { SmpGenerator } from "../../../src/language/tools/smp/generator.js";
import { setGeneratedBy } from "../../../src/language/generator/generator.js";

let services: ReturnType<typeof createXsmpServices>;
let parse: ReturnType<typeof parseHelper<Schedule>>;
let document: LangiumDocument<Schedule> | undefined;

beforeAll(async () => {
  services = createXsmpServices(EmptyFileSystem);
  parse = parseHelper<Schedule>(services.xsmpsed);

  await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

describe('SMP schedule generator tests', () => {

  test('test schedule', async () => {

    const generator = new SmpGenerator(services.shared);
    document = await parse(fs.readFileSync(path.resolve(__dirname, 'test.xsmpsed')).toString(), { documentUri: 'test.xsmpsed' });
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
    document = await parse(fs.readFileSync(path.resolve(__dirname, 'test.xsmpsed')).toString(), { documentUri: 'write-test.xsmpsed' });
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
});

function checkDocumentValid(document: LangiumDocument): string | undefined {
  return document.parseResult.parserErrors.length && s`
        Parser errors:
          ${document.parseResult.parserErrors.map(e => e.message).join('\n  ')}
    `
    || document.parseResult.value === undefined && `ParseResult is 'undefined'.`
    || !isSchedule(document.parseResult.value) && `Root AST object is a ${document.parseResult.value.$type}, expected a '${Schedule}'.`
    || undefined;
}
