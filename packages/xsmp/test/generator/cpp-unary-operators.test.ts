import { expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EsaCdkGenerator } from '@xsmp/profile-esa-cdk';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { TasMdkGenerator } from 'xsmp-tas-mdk';
import { setClangFormat } from '@xsmp/core/generator';
import { createProfileGeneratorTestContext, cleanupProfileGeneratorTestContext, parseProfileGeneratorFixture, generateProfileTree } from '../profile-generator-test-utils.js';

test.each([['xsmp-sdk', XsmpSdkGenerator], ['esa-cdk', EsaCdkGenerator], ['tas-mdk', TasMdkGenerator]] as const)('%s keeps adjacent unary operators separate', async (_profile, Generator) => {
    const context = await createProfileGeneratorTestContext();
    try {
        const document = await parseProfileGeneratorFixture(context, 'unary-operators.xsmpcat');
        setClangFormat(false);
        const output = await generateProfileTree(context, new Generator(context.services.shared), document, 'cpp-unary-operators-');
        const header = fs.readFileSync(path.join(output, Generator === TasMdkGenerator ? 'include-gen' : 'src-gen', 'unary/Values.h'), 'utf8');
        expect(header).toContain('DoubleMinus{-(-1)}');
        expect(header).toContain('TripleMinus{-(-(-1))}');
        expect(header).toContain('DoublePlus{+(+Base)}');
        expect(header).toContain('Mixed{-(+1)}');
        expect(header).toContain('value{+(+1)}');
        expect(header).toContain('Negative{-7}');
        expect(header).toContain('Negated{!false}');
    } finally {
        setClangFormat(true);
        await cleanupProfileGeneratorTestContext(context);
    }
});
