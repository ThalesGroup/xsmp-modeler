import { expect, test } from 'vitest';
import { URI } from 'langium';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { rebuildTestDocuments } from '../test-services.js';
import { createProfileGeneratorTestContext, cleanupProfileGeneratorTestContext } from '../profile-generator-test-utils.js';

test.each(['', 'xsmp-sdk', 'esa-cdk', 'tas-mdk'])('requires values for designated initializers with profile %s', async profile => {
    const context = await createProfileGeneratorTestContext();
    try {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-designated-values-'));
        context.tempDirs.push(directory);
        fs.mkdirSync(path.join(directory, 'src'));
        const project = await context.parseProject(`project 'DesignatedValues' using 'ECSS_SMP_2025'
source 'src'
${profile ? `profile '${profile}'` : ''}`, {
            documentUri: URI.file(path.join(directory, 'xsmp.project')).toString(),
        });
        const document = await context.parseCatalogue(`catalogue DesignatedValues namespace designated {
            /** @uuid 85000000-0000-4000-8000-000000000001 */
            public array Values = Int32[2]
            /** @uuid 85000000-0000-4000-8000-000000000002 */
            public struct Pair { field Int32 x field Int32 y }
            /** @uuid 85000000-0000-4000-8000-000000000003 */
            public struct Nested { field Pair pair field Values values }
            /** @uuid 85000000-0000-4000-8000-000000000004 */
            public struct Cases {
                field Pair missingScalar = { .x, .y = 2 }
                field Nested missingArray = { .pair = {}, .values }
                field Nested missingNested = { .pair = { .x, .y = 2 }, .values = {} }
                field Pair valid = { .x = 0, .y = 2 }
                field Pair partial = { .x = 0 }
                field Pair empty = {}
                field Nested validNested = { .pair = { .x = 0, .y = 2 }, .values = { 0, 1 } }
            }
        }`, { documentUri: URI.file(path.join(directory, 'src', 'DesignatedValues.xsmpcat')).toString() });
        context.documents.push(project, document);
        expect(document.parseResult.parserErrors).toEqual([]);
        await rebuildTestDocuments(context.services, [project, document]);
        expect(project.diagnostics?.filter(diagnostic => diagnostic.severity === 1)).toEqual([]);
        const errors = document.diagnostics?.filter(diagnostic => diagnostic.severity === 1) ?? [];
        expect(errors).toHaveLength(3);
        expect(errors.map(error => error.message)).toEqual(Array(3).fill('A designated initializer requires a value.'));
        expect(errors.map(error => error.data?.code)).toEqual(Array(3).fill('missing-value'));
        expect(errors.map(error => document.textDocument.getText(error.range))).toEqual(['.x', '.values', '.x']);
        expect(document.diagnostics?.filter(diagnostic => diagnostic.message.startsWith('Partial initialization'))).toHaveLength(1);
    } finally {
        await cleanupProfileGeneratorTestContext(context);
    }
});
