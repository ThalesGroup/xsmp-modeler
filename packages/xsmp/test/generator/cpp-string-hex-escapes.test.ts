import { expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EsaCdkGenerator } from '@xsmp/profile-esa-cdk';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { TasMdkGenerator } from 'xsmp-tas-mdk';
import { setClangFormat } from '@xsmp/core/generator';
import { createProfileGeneratorTestContext, cleanupProfileGeneratorTestContext, parseProfileGeneratorFixture, generateProfileTree } from '../profile-generator-test-utils.js';

test.each([XsmpSdkGenerator, EsaCdkGenerator, TasMdkGenerator])('%s preserves the two-digit extent and bytes of hex escapes', async Generator => {
    const context = await createProfileGeneratorTestContext();
    try {
        const document = await parseProfileGeneratorFixture(context, 'string-hex-escapes.xsmpcat');
        setClangFormat(false);
        const output = await generateProfileTree(context, new Generator(context.services.shared), document, 'string-hex-escapes-');
        const header = fs.readFileSync(path.join(output, Generator === TasMdkGenerator ? 'include-gen' : 'src-gen', 'stringescapes/Values.h'), 'utf8');
        expect(header).toContain(String.raw`Hex{"\10142"}`);
        expect(header).toContain(String.raw`Concatenated{"\101" "42"}`);
        expect(header).toContain(String.raw`NulDigit{"\0007"}`);
        expect(header).toContain(String.raw`Backslash{"\\x4142"}`);
        expect(header).toContain(String.raw`EscapedThenHex{"\\\10142"}`);
        expect(header).toContain(String.raw`HighByte{"\351"}`);
        expect(header).toContain(String.raw`Unicode{"\u00e9"}`);
        expect(header).toContain('Ascii{"abc"}');
        expect(header).toContain(String.raw`Quotes{"\"quoted\" and \\"}`);
    } finally {
        setClangFormat(true);
        await cleanupProfileGeneratorTestContext(context);
    }
});
