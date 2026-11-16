import { expect, test } from 'vitest';
import { EmptyFileSystem, URI } from 'langium';
import { parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';

const dateTimes: Array<[string, boolean]> = [
    ['2024-02-29T12:34:56.123456789Z', true], ['2000-02-29T00:00:00', true],
    ['2024-12-31T24:00:00Z', true], ['2024-01-01T00:00:00+14:00', true],
    ['2024-01-01T00:00:00-05:30', true], ['2024-02-31T00:00:00Z', false],
    ['1900-02-29T00:00:00Z', false], ['2024-01-01T24:00:00.1Z', false],
    ['2024-01-01T00:00:00+14:01', false], ['2024-01-01T00:00:00,1Z', false],
    ['2024-01-01', false], ['0000-01-01T00:00:00Z', false], ['not-a-date', false], ['', false],
];
const durations: Array<[string, boolean]> = [
    ['PT0S', true], ['-P1DT2H3M4.123456789S', true], ['P2D', true],
    ['not-a-duration', false], ['', false], ['PT', false], ['+P1D', false],
    ['P-1D', false], ['pt1s', false], ['PT1,5S', false],
];

test.each([
    ...dateTimes.map(([text, valid]) => ['DateTime', text, valid] as const),
    ...durations.map(([text, valid]) => ['Duration', text, valid] as const),
])('validates runtime %s %s', async (kind, value, valid) => {
    const services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
    const uri = (file: string) => URI.file(`/runtime-temporals/${file}`).toString();
    const project = await parseHelper(services.xsmpproject)('project "Demo" using "ECSS_SMP_2025" source "src"', {
        documentUri: uri('xsmp.project'),
    });
    const catalogue = await parseHelper(services.xsmpcat)(`catalogue Types namespace demo {
        /** @uuid 9436123a-301a-4ab1-ac97-123679609451 */
        public model Root { field Smp.${kind} value public property Smp.${kind} setting }
    }`, { documentUri: uri('src/types.xsmpcat') });
    const literal = `"${value}"${kind === 'DateTime' ? 'dt' : 'd'}`;
    const assembly = await parseHelper(services.xsmpasb)(`assembly Runtime Root: demo.Root { value = ${literal} }`, {
        documentUri: uri('src/runtime.xsmpasb'),
    });
    const config = await parseHelper(services.xsmpcfg)(`configuration Config /Root: demo.Root { value = ${literal} }`, {
        documentUri: uri('src/config.xsmpcfg'),
    });
    const time = kind === 'DateTime' ? `epoch "${value}"` : '';
    const event = kind === 'Duration' ? `event Main simulation "${value}"` : '';
    const schedule = await parseHelper(services.xsmpsed)(`schedule <Root="root"> Tasks ${time} task Main on demo.Root { property setting = ${literal} } ${event}`, {
        documentUri: uri('src/tasks.xsmpsed'),
    });
    const documents = [project, catalogue, assembly, config, schedule];
    await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });
    for (const document of documents) {
        expect(document.parseResult.lexerErrors).toEqual([]);
        expect(document.parseResult.parserErrors).toEqual([]);
    }
    expect(catalogue.diagnostics?.filter(d => d.severity === 1)).toEqual([]);
    for (const [document, count] of [[assembly, 1], [config, 1], [schedule, 2]] as const) {
        const errors = document.diagnostics?.filter(d => d.severity === 1) ?? [];
        expect(errors, document.uri.toString()).toHaveLength(valid ? 0 : count);
        for (const error of errors) expect(error.message).toContain(`valid ${kind}`);
    }
});
