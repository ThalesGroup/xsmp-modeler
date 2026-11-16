import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { EmptyFileSystem, URI } from 'langium';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createXsmpServices } from '@xsmp/core';
import { SmpImportService } from '@xsmp/core/smp';
import { assertXmlConformsToXsd, hasXmllint } from './xsd-test-utils.js';

let directory: string;
let importer: SmpImportService;

beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-xlink-identity-'));
    const services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
    importer = new SmpImportService(services.shared);
});
afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

function catalogue(name: string, namespace: string, types: string): string {
    return `<Catalogue:Catalogue xmlns:Catalogue="http://www.ecss.nl/smp/2025/Smdl/Catalogue" xmlns:Types="http://www.ecss.nl/smp/2025/Core/Types" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xlink="http://www.w3.org/1999/xlink" Id="${name}" Name="${name}"><Namespace Id="${namespace}" Name="${namespace}">${types}</Namespace></Catalogue:Catalogue>`;
}
function write(name: string, content: string): string {
    const input = path.join(directory, name);
    fs.writeFileSync(input, content);
    if (hasXmllint()) assertXmlConformsToXsd(input, 'catalogue', 'ECSS_SMP_2025');
    return input;
}
function model(fields: string): string {
    return `<Type xsi:type="Catalogue:Model" Id="local.Device" Name="Device" Uuid="33333333-3333-3333-3333-333333333333">${fields}</Type>`;
}
function field(name: string, href: string, value = ''): string {
    return `<Field Id="local.Device.${name}" Name="${name}"><Type xlink:href="${href}"/>${value}</Field>`;
}
async function render(input: string) {
    return importer.renderImportedDocument({ inputPath: input, outputUri: URI.file(path.join(directory, 'imported.xsmpcat')) });
}

describe('SMP external XLink identity', () => {
    test('resolves external IDs in their document and keeps fragment-only and self-file links local', async () => {
        write('foreign.smpcat', catalogue('Foreign', 'external', '<Type xsi:type="Types:String" Id="Shared" Name="LongText" Uuid="11111111-1111-1111-1111-111111111111" Length="32"/>'));
        const input = write('owner.smpcat', catalogue('Owner', 'local',
            '<Type xsi:type="Types:String" Id="Shared" Name="ShortText" Uuid="22222222-2222-2222-2222-222222222222" Length="2"/>' + model(
                field('externalValue', 'foreign.smpcat#Shared') + field('localValue', '#Shared') + field('selfValue', 'owner.smpcat#Shared'),
            )));
        const result = await render(input);
        expect(result.warnings).toEqual([]);
        expect(result.content).toContain('field external.LongText externalValue');
        expect(result.content).toContain('field ShortText localValue');
        expect(result.content).toContain('field local.ShortText selfValue');
    });

    test('uses the external enumeration definition when recovering a default literal', async () => {
        write('foreign.smpcat', catalogue('Foreign', 'external', '<Type xsi:type="Types:Enumeration" Id="Shared" Name="Mode" Uuid="11111111-1111-1111-1111-111111111111"><Literal Id="external.Mode.ExternalValue" Name="ExternalValue" Value="1"/></Type>'));
        const input = write('owner.smpcat', catalogue('Owner', 'local',
            '<Type xsi:type="Types:Enumeration" Id="Shared" Name="Mode" Uuid="22222222-2222-2222-2222-222222222222"><Literal Id="local.Mode.LocalValue" Name="LocalValue" Value="1"/></Type>' + model(
                field('externalValue', 'foreign.smpcat#Shared', '<Default xsi:type="Types:EnumerationValue" Value="1"/>') +
                field('localValue', '#Shared', '<Default xsi:type="Types:EnumerationValue" Value="1"/>'),
            )));
        const result = await render(input);
        expect(result.warnings).toEqual([]);
        expect(result.content).toContain('field external.Mode externalValue = external.Mode.ExternalValue');
        expect(result.content).toContain('field Mode localValue = Mode.LocalValue');
    });
});
