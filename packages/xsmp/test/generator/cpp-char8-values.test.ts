import { expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EmptyFileSystem } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import type { Catalogue } from '@xsmp/core/ast';
import { EsaCdkGenerator } from '@xsmp/profile-esa-cdk';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { TasMdkGenerator } from 'xsmp-tas-mdk';
import { setClangFormat } from '@xsmp/core/generator';
import { createProfileGeneratorTestContext, cleanupProfileGeneratorTestContext, parseProfileGeneratorFixture, generateProfileTree } from '../profile-generator-test-utils.js';

test.each(['256', '-1', '65535', String.raw`'\u0100'`, String.raw`'\U0001F600'`, "'ab'"])(
    'rejects a Char8 value outside one byte: %s', async expression => {
        const services = createXsmpServices(EmptyFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
        const document = await parseHelper<Catalogue>(services.xsmpcat)(`catalogue BadChar namespace bytes {
            /** @uuid 7c8e1d14-c579-43e1-9dc4-14834fe2db01 */ public interface Values {
                constant Char8 Value = ${expression}
            }
        }`);
        try {
            expect(document.parseResult.parserErrors).toEqual([]);
            await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
            expect(document.diagnostics?.filter(d => d.severity === 1)).toHaveLength(1);
        } finally {
            await clearDocuments(services.shared, [document]);
        }
    });

test.each([XsmpSdkGenerator, EsaCdkGenerator, TasMdkGenerator])('%s preserves byte values and complete arithmetic expressions', async Generator => {
    const context = await createProfileGeneratorTestContext();
    try {
        const document = await parseProfileGeneratorFixture(context, 'char8-values.xsmpcat');
        setClangFormat(false);
        const output = await generateProfileTree(context, new Generator(context.services.shared), document, 'char8-values-');
        const header = fs.readFileSync(path.join(output, Generator === TasMdkGenerator ? 'include-gen' : 'src-gen', 'bytes/Values.h'), 'utf8');
        expect(header).toContain('High{static_cast<::Smp::Char8>(255)}');
        expect(header).toContain('Computed{static_cast<::Smp::Char8>(255 / 2)}');
        expect(header).toContain('Alias{High}');
        expect(header).toContain(String.raw`Unicode{'\377'}`);
        expect(header).toContain(String.raw`Null{'\000'}`);
        expect(header).toContain(String.raw`Tab{'\011'}`);
        expect(header).toContain(String.raw`Quote{'\''}`);
        expect(header).toContain(String.raw`Slash{'\\'}`);
        expect(header).toContain("Ascii{'A'}");
        expect(header).toContain(String.raw`static_cast<::Smp::Char8>(128), static_cast<::Smp::Char8>(255), static_cast<::Smp::Char8>(255 / 2), '\377'`);
    } finally {
        setClangFormat(true);
        await cleanupProfileGeneratorTestContext(context);
    }
});
