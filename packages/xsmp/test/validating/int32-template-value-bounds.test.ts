import { expect, test } from 'vitest';
import { EmptyFileSystem, URI } from 'langium';
import { parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';

test.each([
    [-2147483649n, false], [-2147483648n, true], [-1n, true], [0n, true],
    [1n, true], [2147483647n, true], [2147483648n, false], [9007199254740993n, false],
])('validates Int32 parameter and argument %s in ASB and SED', async (value, valid) => {
    const services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
    const uri = (file: string) => URI.file(`/int32-template-bounds/${file}`).toString();
    const project = await parseHelper(services.xsmpproject)('project "Demo" using "ECSS_SMP_2025" source "src"', {
        documentUri: uri('xsmp.project'),
    });
    const catalogue = await parseHelper(services.xsmpcat)(`catalogue Types namespace demo {
        /** @uuid 2436123a-301a-4ab1-ac97-123679609451 */
        public model Root { container Smp.IComponent* children }
    }`, { documentUri: uri('src/types.xsmpcat') });
    const template = await parseHelper(services.xsmpasb)(`assembly <Count=${value}> Template Child: demo.Root`, {
        documentUri: uri('src/template.xsmpasb'),
    });
    const assembly = await parseHelper(services.xsmpasb)(`assembly Runtime Root: demo.Root { children += Child: Template<Count=${value}> }`, {
        documentUri: uri('src/runtime.xsmpasb'),
    });
    const schedule = await parseHelper(services.xsmpsed)(`schedule <Root="root", Count=${value}> Tasks task Worker {} task Main { execute Worker<Count=${value}> }`, {
        documentUri: uri('src/tasks.xsmpsed'),
    });
    const documents = [project, catalogue, template, assembly, schedule];
    await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });
    for (const document of documents) {
        expect(document.parseResult.lexerErrors).toEqual([]);
        expect(document.parseResult.parserErrors).toEqual([]);
    }
    expect(catalogue.diagnostics?.filter(d => d.severity === 1)).toEqual([]);
    for (const [document, count] of [[template, 1], [assembly, 1], [schedule, 2]] as const) {
        const errors = document.diagnostics?.filter(d => d.severity === 1) ?? [];
        expect(errors.map(d => d.message)).toEqual(Array(valid ? 0 : count).fill('An Int32 template value shall be between -2147483648 and 2147483647.'));
        for (const error of errors) {
            expect(document.textDocument.getText(error.range)).toBe(value.toString());
        }
    }
});
