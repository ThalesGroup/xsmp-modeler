import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI } from 'langium';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createXsmpServices } from '@xsmp/core';
import { renderImportedValue, SmpImportService } from '@xsmp/core/smp';
import { assertXmlConformsToXsd, hasXmllint } from './xsd-test-utils.js';

let importer: SmpImportService;
const directories: string[] = [];
beforeAll(async () => {
    const services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
    importer = new SmpImportService(services.shared);
});
afterEach(() => {
    for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

async function render(field: string) {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-implicit-array-'));
    directories.push(directory);
    const inputPath = path.join(directory, 'values.smpcfg');
    fs.writeFileSync(inputPath, `<Configuration:Configuration xmlns:Configuration="http://www.ecss.nl/smp/2025/Smdl/Configuration" xmlns:Types="http://www.ecss.nl/smp/2025/Core/Types" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" Id="Values" Name="Values"><Component Path=".">${field}</Component></Configuration:Configuration>`);
    if (hasXmllint()) assertXmlConformsToXsd(inputPath, 'configuration', 'ECSS_SMP_2025');
    const result = await importer.renderImportedDocument({ inputPath, outputUri: URI.file(path.join(directory, 'values.xsmpcfg')) });
    expect(result.warnings).toEqual([]);
    return result.content;
}

describe('implicit SMP simple array item types', () => {
    test.each([
        ['Bool', 'true', 'false', 'true, false'],
        ['Char8', 'a', 'b', "'a', 'b'"],
        ['String8', 'first', 'second', '"first", "second"'],
        ['DateTime', '2000-01-01T12:00:00Z', '2024-01-01T00:00:00Z', '"2000-01-01T12:00:00Z"dt, "2024-01-01T00:00:00Z"dt'],
        ['Duration', 'PT1S', 'PT2S', '"PT1S"d, "PT2S"d'],
        ['Enumeration', '5', '6', '5lit, 6lit'],
        ['Int8', '-5', '6', '-5i8, 6i8'],
        ['Int16', '-500', '600', '-500i16, 600i16'],
        ['Int32', '-50000', '60000', '-50000i32, 60000i32'],
        ['Int64', '-5000000000', '6000000000', '-5000000000i64, 6000000000i64'],
        ['UInt8', '250', '255', '250u8, 255u8'],
        ['UInt16', '50000', '60000', '50000u16, 60000u16'],
        ['UInt32', '3000000000', '4000000000', '3000000000u32, 4000000000u32'],
        ['UInt64', '18446744073709551614', '18446744073709551615', '18446744073709551614u64, 18446744073709551615u64'],
        ['Float32', '5', '6.5', '5.f32, 6.5f32'],
        ['Float64', '5e10', '6.5', '5e10f64, 6.5f64'],
    ])('imports %s items with or without redundant xsi:type', async (type, first, second, expected) => {
        const items = `<ItemValue Value="${first}"/><ItemValue xsi:type="Types:${type}Value" Value="${second}"/>`;
        const content = await render(`<FieldValue xsi:type="Types:${type}ArrayValue" Field="values"><StartIndex>2</StartIndex>${items}</FieldValue>`);
        expect(content).toContain(`values = [2: ${expected}]`);
    });

    test('preserves generic nested arrays and empty typed arrays', async () => {
        const content = await render(`<FieldValue xsi:type="Types:ArrayValue" Field="matrix">
            <ItemValue xsi:type="Types:Int32ArrayValue"><ItemValue Value="5"/><ItemValue Value="6"/></ItemValue>
            <ItemValue xsi:type="Types:Int32ArrayValue"><StartIndex>2</StartIndex></ItemValue>
        </FieldValue>`);
        expect(content).toContain('matrix = [[5i32, 6i32], [2:]]');
    });

    test('never overwrites an explicit item type with the parent fallback', () => {
        const warnings: string[] = [];
        const value = renderImportedValue({ '@xsi:type': 'Types:Int32ArrayValue', ItemValue: { '@xsi:type': 'Types:UInt32Value', '@Value': '7' } }, warnings);
        expect(value).toBe('[7u32]');
        expect(warnings).toEqual([]);
    });
});
