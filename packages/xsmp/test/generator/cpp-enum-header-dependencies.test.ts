import { expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EsaCdkGenerator } from '@xsmp/profile-esa-cdk';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { TasMdkGenerator } from 'xsmp-tas-mdk';
import { setClangFormat } from '@xsmp/core/generator';
import { createProfileGeneratorTestContext, cleanupProfileGeneratorTestContext, parseProfileGeneratorFixture, generateProfileTree } from '../profile-generator-test-utils.js';

test.each([['xsmp-sdk', XsmpSdkGenerator], ['esa-cdk', EsaCdkGenerator], ['tas-mdk', TasMdkGenerator]] as const)('%s includes the owners of constants used by enumerators', async (_profile, Generator) => {
    const context = await createProfileGeneratorTestContext();
    try {
        const document = await parseProfileGeneratorFixture(context, 'enum-header-dependencies.xsmpcat');
        setClangFormat(false);
        const output = await generateProfileTree(context, new Generator(context.services.shared), document, 'cpp-enum-header-dependencies-');
        const directory = path.join(output, Generator === TasMdkGenerator ? 'include-gen' : 'src-gen', 'enumdeps');
        const header = fs.readFileSync(path.join(directory, 'Mode.h'), 'utf8');
        expect(header.match(/#include <enumdeps\/Constants.h>/g)).toHaveLength(1);
        expect(header).toContain('Next = ::enumdeps::Constants::Base + 1');
        expect(header).not.toContain('#include <enumdeps/Mode.h>');
        expect(fs.readFileSync(path.join(directory, 'Independent.h'), 'utf8')).not.toContain('#include <enumdeps/Constants.h>');
    } finally {
        setClangFormat(true);
        await cleanupProfileGeneratorTestContext(context);
    }
});
