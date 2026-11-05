import { expect, test } from 'vitest';
import { EmptyFileSystem, URI } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { createXsmpServices } from '@xsmp/core';
import type { Catalogue } from '@xsmp/core/ast';
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
        documentUri: URI.file(path.join(directory, 'src', 'Validation.xsmpcat')).toString(),
    });
    context.documents.push(project, document);
    await rebuildTestDocuments(context.services, [project, document]);
    expect(project.parseResult.parserErrors).toHaveLength(0);
    expect(document.parseResult.parserErrors).toHaveLength(0);
    expect((project.diagnostics ?? []).filter(d => d.severity === 1)).toEqual([]);
    return { context, document, diagnostics: document.diagnostics ?? [] };
}

test.each(['', 'xsmp-sdk', 'esa-cdk', 'tas-mdk'])('profile "%s" warns once per UInt64 upper bound above Int64_MAX without blocking generation', async profile => {
    const { context, document, diagnostics } = await parseCase(`
        /** @uuid 84000000-0000-4000-8000-000000000001 */ public integer Full extends UInt64
        /** @uuid 84000000-0000-4000-8000-000000000002 */ public integer High extends UInt64 in 0 ... 9223372036854775808UL
        /** @uuid 84000000-0000-4000-8000-000000000003 */ public integer Limited extends UInt64 in 0 ... 9223372036854775807UL
        /** @uuid 84000000-0000-4000-8000-000000000007 */ public integer Extreme extends UInt64 in 0 ... 18446744073709551615UL
        /** @uuid 84000000-0000-4000-8000-000000000008 */ public integer Computed extends UInt64 in 0 ... 9223372036854775807UL + 1UL
    `, profile);
    try {
        expect(diagnostics.filter(d => d.severity === 1)).toEqual([]);
        const warnings = diagnostics.filter(d => d.message.includes('upper bound exceeds Int64_MAX'));
        expect(warnings).toHaveLength(4);
        expect(warnings.every(d => d.severity === 2)).toBe(true);
        expect(warnings.map(d => document.textDocument.getText(d.range))).toEqual([
            'Full', '9223372036854775808UL', '18446744073709551615UL', '9223372036854775807UL + 1UL',
        ]);
        const output = await generateProfileTree(context, new XsmpSdkGenerator(context.services.shared), document, 'warn-uint64-');
        expect(fs.readFileSync(path.join(output, 'src-gen/checks/Full.cpp'), 'utf8')).toContain('numeric_limits<::Smp::UInt64>::max()');
        expect(fs.readFileSync(path.join(output, 'src-gen/checks/High.cpp'), 'utf8')).toContain('9223372036854775808');
    } finally { await cleanupProfileGeneratorTestContext(context); }
});

test('preserves explicit representable UInt64 bounds and direct primitive fields', async () => {
    const { context, document, diagnostics } = await parseCase(`
        /** @uuid 84000000-0000-4000-8000-000000000004 */ public integer Limited extends UInt64 in 0 ... 9223372036854775807UL
        /** @uuid 84000000-0000-4000-8000-000000000005 */ public model Probe { field UInt64 value = 18446744073709551615UL }
    `);
    try {
        expect(diagnostics.filter(d => d.severity === 1)).toEqual([]);
        expect(diagnostics.filter(d => d.message.includes('upper bound exceeds Int64_MAX'))).toEqual([]);
        const output = await generateProfileTree(context, new XsmpSdkGenerator(context.services.shared), document, 'limited-uint64-');
        expect(fs.readFileSync(path.join(output, 'src-gen/checks/Limited.cpp'), 'utf8')).toContain('9223372036854775807');
        expect(fs.readFileSync(path.join(output, 'src-gen/checks/ProbeGen.cpp'), 'utf8')).toContain('18446744073709551615');
    } finally { await cleanupProfileGeneratorTestContext(context); }
});

test('warns for the implicit UInt64 maximum with the core validator and no registered contributions', async () => {
    const services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
    const document = await parseHelper<Catalogue>(services.xsmpcat)(`catalogue NoContributions
namespace checks {
    /** @uuid 84000000-0000-4000-8000-000000000006 */ public integer Full extends UInt64
}`, { documentUri: 'file:///integer-common-validation.xsmpcat' });
    try {
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
        expect(document.parseResult.parserErrors).toEqual([]);
        const errors = (document.diagnostics ?? []).filter(d => d.severity === 1);
        expect(errors).toHaveLength(0);
        const warnings = (document.diagnostics ?? []).filter(d => d.message.includes('upper bound exceeds Int64_MAX'));
        expect(warnings).toHaveLength(1);
        expect(warnings[0].severity).toBe(2);
    } finally { await clearDocuments(services.shared, [document]); }
});

test('does not add the UInt64 warning for other types, invalid maxima or a high minimum alone', async () => {
    const { context, diagnostics } = await parseCase(`
        /** @uuid 84000000-0000-4000-8000-000000000009 */ public integer Signed extends Int64
        /** @uuid 84000000-0000-4000-8000-00000000000a */ public integer Small extends UInt32
        /** @uuid 84000000-0000-4000-8000-00000000000b */ public integer BadText extends UInt64 in 0 ... "invalid"
        /** @uuid 84000000-0000-4000-8000-00000000000c */ public integer Negative extends UInt64 in 0 ... -1
        /** @uuid 84000000-0000-4000-8000-00000000000d */ public integer Overflow extends UInt64 in 0 ... 18446744073709551616UL
        /** @uuid 84000000-0000-4000-8000-00000000000e */ public integer Reversed extends UInt64 in 9223372036854775808UL ... 1
        /** @uuid 84000000-0000-4000-8000-00000000000f */ public integer BadSigned extends Int64 in 0 ... 9223372036854775808UL
    `, '');
    try {
        expect(diagnostics.filter(d => d.message.includes('upper bound exceeds Int64_MAX'))).toEqual([]);
        const errors = diagnostics.filter(d => d.severity === 1);
        expect(errors).toHaveLength(5);
        expect(errors.some(d => d.message === 'Minimum shall be less or equal than Maximum.')).toBe(true);
    } finally { await cleanupProfileGeneratorTestContext(context); }
});
