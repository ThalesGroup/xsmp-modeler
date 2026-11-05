import { expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EsaCdkGenerator } from '@xsmp/profile-esa-cdk';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { TasMdkGenerator } from 'xsmp-tas-mdk';
import { setClangFormat } from '@xsmp/core/generator';
import { createProfileGeneratorTestContext, cleanupProfileGeneratorTestContext, parseProfileGeneratorFixture, generateProfileTree } from '../profile-generator-test-utils.js';

test.each([['xsmp-sdk', XsmpSdkGenerator], ['esa-cdk', EsaCdkGenerator], ['tas-mdk', TasMdkGenerator]] as const)('%s preserves string values containing trigraphs', async (_profile, Generator) => {
    const context = await createProfileGeneratorTestContext();
    try {
        const document = await parseProfileGeneratorFixture(context, 'trigraphs.xsmpcat');
        setClangFormat(false);
        const output = await generateProfileTree(context, new Generator(context.services.shared), document, 'cpp-trigraphs-');
        const header = fs.readFileSync(path.join(output, Generator === TasMdkGenerator ? 'include-gen/trigraphs/Text.h' : 'src-gen/trigraphs/Text.h'), 'utf8');
        expect(header).toContain(Generator === XsmpSdkGenerator
            ? '"??= ??/ ??\' ??( ??) ??! ??< ??> ??-"'
            : '"?\\?= ?\\?/ ?\\?\' ?\\?( ?\\?) ?\\?! ?\\?< ?\\?> ?\\?-"');
        expect(header).toContain('"backslash \\\\ and quoted \\"question?\\""');
    } finally {
        setClangFormat(true);
        await cleanupProfileGeneratorTestContext(context);
    }
});
