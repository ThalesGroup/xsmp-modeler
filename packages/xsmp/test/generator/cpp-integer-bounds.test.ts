import { expect, test } from 'vitest';
import { URI } from 'langium';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { createProfileGeneratorTestContext, cleanupProfileGeneratorTestContext, generateProfileTree } from '../profile-generator-test-utils.js';
import { rebuildTestDocuments } from '../test-services.js';

async function parseCase(body: string, profile = 'xsmp-sdk') {
    const context = await createProfileGeneratorTestContext();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cpp-validation-'));
    context.tempDirs.push(directory);
    fs.mkdirSync(path.join(directory, 'src'));
    const project = await context.parseProject(`project 'validation' using 'ECSS_SMP_2025'\nsource 'src'\n${profile ? `profile '${profile}'` : ''}\n`, {
        documentUri: URI.file(path.join(directory, 'xsmp.project')).toString(),
    });
    const document = await context.parseCatalogue(`catalogue Validation\nnamespace checks { ${body} }`, {
        documentUri: URI.file(path.join(directory, 'src', 'validation.xsmpcat')).toString(),
    });
    context.documents.push(project, document);
    await rebuildTestDocuments(context.services, [project, document]);
    expect(project.parseResult.parserErrors).toHaveLength(0);
    expect(document.parseResult.parserErrors).toHaveLength(0);
    expect((project.diagnostics ?? []).filter(d => d.severity === 1)).toEqual([]);
    return { context, document, diagnostics: document.diagnostics ?? [] };
}

test.each(['xsmp-sdk', 'esa-cdk', 'tas-mdk'])('%s diagnoses UInt64 ranges the SMP registration API cannot represent', async profile => {
    const { context, document, diagnostics } = await parseCase(`
        /** @uuid 84000000-0000-4000-8000-000000000001 */ public integer Full extends UInt64
        /** @uuid 84000000-0000-4000-8000-000000000002 */ public integer High extends UInt64 in 0 ... 18446744073709551615UL
        /** @uuid 84000000-0000-4000-8000-000000000003 */ public integer Limited extends UInt64 in 0 ... 9223372036854775807UL
    `, profile);
    try {
        expect(diagnostics.filter(d => d.severity === 1 && d.message.includes('signed Int64 bounds'))).toHaveLength(2);
        await expect(generateProfileTree(context, new XsmpSdkGenerator(context.services.shared), document, 'unsupported-uint64-'))
            .rejects.toThrow('cannot represent this UInt64 range');
    } finally { await cleanupProfileGeneratorTestContext(context); }
});

test('preserves explicit representable UInt64 bounds and direct primitive fields', async () => {
    const { context, document, diagnostics } = await parseCase(`
        /** @uuid 84000000-0000-4000-8000-000000000004 */ public integer Limited extends UInt64 in 0 ... 9223372036854775807UL
        /** @uuid 84000000-0000-4000-8000-000000000005 */ public model Probe { field UInt64 value = 18446744073709551615UL }
    `);
    try {
        expect(diagnostics.filter(d => d.severity === 1)).toEqual([]);
        const output = await generateProfileTree(context, new XsmpSdkGenerator(context.services.shared), document, 'limited-uint64-');
        expect(fs.readFileSync(path.join(output, 'src-gen/checks/Limited.cpp'), 'utf8')).toContain('9223372036854775807');
        expect(fs.readFileSync(path.join(output, 'src-gen/checks/ProbeGen.cpp'), 'utf8')).toContain('18446744073709551615');
    } finally { await cleanupProfileGeneratorTestContext(context); }
});

test('allows an unbounded UInt64 alias for projects without C++ generation', async () => {
    const { context, diagnostics } = await parseCase(`
        /** @uuid 84000000-0000-4000-8000-000000000006 */ public integer Full extends UInt64
    `, '');
    try { expect(diagnostics.filter(d => d.severity === 1)).toEqual([]); }
    finally { await cleanupProfileGeneratorTestContext(context); }
});
