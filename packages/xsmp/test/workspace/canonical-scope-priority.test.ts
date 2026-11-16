import { afterEach, beforeEach, expect, test } from 'vitest';
import { AstUtils, URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast-partial';
import { fqn } from '@xsmp/core/utils';

let directory: string;
beforeEach(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-canonical-scope-')); });
afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); });

test.each([
    ['Smp', false], ['Smp', true], ['Attributes', false], ['Attributes', true],
] as const)('keeps canonical names over %s aliases with reverse order %s', async (prefix, reverse) => {
    const definitions = [definition('Canonical', 'demo', 1), definition('Implicit', `${prefix}::demo`, 2)];
    if (reverse) definitions.reverse();
    expect(await resolveTypes(definitions, ['demo.Shared', `${prefix}.demo.Shared`])).toEqual([
        'demo.Shared', `${prefix}.demo.Shared`,
    ]);
});

test.each(['Smp', 'Attributes'])('keeps unshadowed %s aliases available', async prefix => {
    expect(await resolveTypes([definition('Implicit', `${prefix}::demo`, 1)], ['demo.Shared'])).toEqual([
        `${prefix}.demo.Shared`,
    ]);
});

test.each([false, true])('preserves precedence between aliases with reverse order %s', async reverse => {
    const definitions = [definition('SmpTypes', 'Smp::demo', 1), definition('AttributeTypes', 'Attributes::demo', 2)];
    if (reverse) definitions.reverse();
    expect(await resolveTypes(definitions, ['demo.Shared'])).toEqual([
        reverse ? 'Smp.demo.Shared' : 'Attributes.demo.Shared',
    ]);
});

function definition(name: string, namespace: string, id: number): string {
    return `catalogue ${name} namespace ${namespace} {
        /** @uuid af220000-0000-4000-8000-${String(id).padStart(12, '0')} */
        public struct Shared {}
    }`;
}

async function resolveTypes(definitions: string[], references: string[]): Promise<(string | undefined)[]> {
    const services = createXsmpServices(NodeFileSystem);
    const workspace = services.shared.workspace;
    const sources = [
        "project 'scopes' using 'ECSS_SMP_2025' source '.'",
        ...definitions,
        `catalogue Consumer namespace consumer {
            /** @uuid af220000-0000-4000-8000-000000000003 */
            public struct Consumer { ${references.map((type, index) => `field ${type} value${index}`).join('\n')} }
        }`,
    ];
    const documents = sources.map((source, index) => {
        const document = workspace.LangiumDocumentFactory.fromString(source,
            URI.file(path.join(directory, index === 0 ? 'xsmp.project' : `catalogue${index}.xsmpcat`)));
        workspace.LangiumDocuments.addDocument(document);
        return document;
    });
    await workspace.DocumentBuilder.build(documents, { validation: true });
    expect(documents.flatMap(document => document.parseResult.parserErrors)).toEqual([]);
    expect(documents.flatMap(document => (document.diagnostics ?? []).filter(diagnostic => diagnostic.severity === 1))).toEqual([]);
    return AstUtils.streamAllContents(documents.at(-1)!.parseResult.value).filter(ast.isField)
        .map(field => field.type?.ref ? fqn(field.type.ref) : undefined).toArray();
}
