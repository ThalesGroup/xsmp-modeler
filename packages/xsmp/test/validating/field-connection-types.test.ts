import { expect, test } from 'vitest';
import { EmptyFileSystem, URI } from 'langium';
import { parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';

const declarations = [
    'public integer Count extends Smp.Int32 in 0 ... 10',
    'public enum Mode { Off = 0 }',
    'public array Pair = Smp.Int32[2]',
    'public array OtherPair = Count[2]',
    'public array Triple = Smp.Int32[3]',
    'public array Flags = Smp.Bool[2]',
    '@SimpleArray public array SimplePair = Smp.Int32[2]',
    'public struct Payload { field Pair values field Smp.Bool flag }',
    'public struct Equivalent { field OtherPair renamed field Smp.Bool other }',
    'public struct WrongShape { field Pair values }',
    'public struct WrongKind { field Pair values field Smp.Int32 flag }',
];

const cases: Array<[string, string, boolean]> = [
    ['Smp.Int32', 'Smp.Bool', false],
    ['Smp.Int32', 'Smp.Int32', true],
    ['Smp.Int32', 'Count', true],
    ['Mode', 'Smp.Int32', true],
    ['Smp.Int64', 'Smp.Duration', false],
    ['Pair', 'OtherPair', true],
    ['Pair', 'Triple', false],
    ['Pair', 'Flags', false],
    ['Pair', 'SimplePair', false],
    ['Payload', 'Equivalent', true],
    ['Payload', 'WrongShape', false],
    ['Payload', 'WrongKind', false],
    ['Payload', 'Pair', false],
];

test.each(cases)('checks %s -> %s in ASB, LNK and SED', async (from, to, compatible) => {
    const result = await validate(from, to);
    for (const document of result) {
        const errors = document.diagnostics?.filter(diagnostic => diagnostic.severity === 1) ?? [];
        expect(errors.map(error => error.message), document.uri.toString()).toEqual(compatible ? [] : ['Connected fields shall have equivalent types.']);
    }
});

test('preserves unsafe endpoint paths', async () => {
    const documents = await validate('Smp.Int32', 'Smp.Bool', true);
    expect(documents.flatMap(document => document.diagnostics?.filter(d => d.severity === 1) ?? [])).toEqual([]);
});

test('terminates when independently diagnosed invalid types are recursive', async () => {
    const documents = await validate('Cycle', 'OtherCycle', false, [
        'public array Cycle = Cycle[1]',
        'public array OtherCycle = OtherCycle[1]',
    ]);
    expect(documents.flatMap(document => document.diagnostics?.filter(d => d.severity === 1) ?? [])).toEqual([]);
});

async function validate(from: string, to: string, unsafe = false, invalidTypes: string[] = []) {
    const services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
    const project = await parseHelper(services.xsmpproject)('project "Demo" using "ECSS_SMP_2025" source "src"', {
        documentUri: URI.file('/field-compatibility/xsmp.project').toString(),
    });
    const catalogue = await parseHelper(services.xsmpcat)(`catalogue Types namespace demo {
        ${[...declarations, ...invalidTypes, `public model Root { output field ${from} source input field ${to} target }`].map((declaration, index) =>
        `/** @uuid 12345678-1234-4234-8234-${index.toString().padStart(12, '0')} */ ${declaration}`).join('\n')}
    }`, { documentUri: URI.file('/field-compatibility/src/types.xsmpcat').toString() });
    const connection = `${unsafe ? 'unsafe ' : ''}source -> target`;
    const assembly = await parseHelper(services.xsmpasb)(`assembly Runtime Root: demo.Root { field link ${connection} }`, {
        documentUri: URI.file('/field-compatibility/src/runtime.xsmpasb').toString(),
    });
    const links = await parseHelper(services.xsmplnk)(`link Connections for Runtime . { field link ${connection} }`, {
        documentUri: URI.file('/field-compatibility/src/connections.xsmplnk').toString(),
    });
    const schedule = await parseHelper(services.xsmpsed)(`schedule <Root="root"> Tasks task Main on demo.Root { transfer ${connection} }`, {
        documentUri: URI.file('/field-compatibility/src/tasks.xsmpsed').toString(),
    });
    const documents = [project, catalogue, assembly, links, schedule];
    await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });
    for (const document of documents) {
        expect(document.parseResult.lexerErrors).toEqual([]);
        expect(document.parseResult.parserErrors).toEqual([]);
    }
    const typeErrors = catalogue.diagnostics?.filter(d => d.severity === 1) ?? [];
    if (invalidTypes.length) {
        expect(typeErrors.length).toBeGreaterThan(0);
    } else {
        expect(typeErrors).toEqual([]);
    }
    return [assembly, links, schedule];
}
