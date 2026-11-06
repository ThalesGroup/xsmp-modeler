import { expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { EsaCdkGenerator } from '@xsmp/profile-esa-cdk';
import { TasMdkGenerator } from 'xsmp-tas-mdk';
import { createProfileGeneratorTestContext, cleanupProfileGeneratorTestContext, parseProfileGeneratorFixture, generateProfileTree } from '../profile-generator-test-utils.js';

test.each([XsmpSdkGenerator, EsaCdkGenerator, TasMdkGenerator])('%s keeps documentation backslashes from continuing comments', async Generator => {
    const context = await createProfileGeneratorTestContext();
    try {
        const document = await parseProfileGeneratorFixture(context, 'comment-backslashes.xsmpcat');
        const output = await generateProfileTree(context, new Generator(context.services.shared), document, 'cpp-comments-');
        const directory = Generator === TasMdkGenerator ? 'include-gen' : 'src-gen';
        const header = fs.readFileSync(path.join(output, directory, 'comments/Doc.h'), 'utf8');
        expect(header).toContain('/// Path C:\\temp&#92;');
        expect(header).toContain('/// First line ends here &#92;');
        expect(header).toContain('/// Next line ends twice \\&#92;');
        expect(header).toContain('/// A backslash \\ inside a sentence is unchanged.');
        expect(header).not.toMatch(/\/\/\/[^\r\n]*\\[^\S\r\n]*(?:\r?\n|$)/);
        for (const field of ['first', 'second', 'third']) {
            expect(header).toContain(`::Smp::Int32 ${field};`);
        }
    } finally {
        await cleanupProfileGeneratorTestContext(context);
    }
});
