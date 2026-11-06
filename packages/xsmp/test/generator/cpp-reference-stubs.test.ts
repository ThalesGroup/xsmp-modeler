import { expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { EsaCdkGenerator } from '@xsmp/profile-esa-cdk';
import { TasMdkGenerator } from 'xsmp-tas-mdk';
import { createProfileGeneratorTestContext, cleanupProfileGeneratorTestContext, parseProfileGeneratorFixture, generateProfileTree } from '../profile-generator-test-utils.js';

test.each([['xsmp-sdk', XsmpSdkGenerator], ['esa-cdk', EsaCdkGenerator], ['tas-mdk', TasMdkGenerator]] as const)('%s emits usable reference-return stubs without shared storage', async (_profile, Generator) => {
    const context = await createProfileGeneratorTestContext();
    try {
        const document = await parseProfileGeneratorFixture(context, 'reference-stubs.xsmpcat');
        const output = await generateProfileTree(context, new Generator(context.services.shared), document, 'reference-stubs-');
        const source = fs.readFileSync(path.join(output, 'src/references/Model.cpp'), 'utf8');
        expect(source).toContain('#include <stdexcept>');
        expect(source.match(/throw std::logic_error/g)).toHaveLength(8);
        expect(source).not.toMatch(/static\s+::/);
        expect(source).toMatch(/ModelGen::staticSelf\(\)[^}]*throw std::logic_error/);
        expect(source).toMatch(/ModelGen::nonVirtualSelf\(\)[^}]*throw std::logic_error/);
        expect(source).not.toMatch(/&\s*ret\s*\{/);
        expect(source).toMatch(/Model::self\(\)[\s\S]*?return \*this;/);
        expect(source).toMatch(/Model::pointer\(\)[\s\S]*?return nullptr;/);
        expect(source).toMatch(/Model::value\(\)[\s\S]*?return 0;/);
    } finally { await cleanupProfileGeneratorTestContext(context); }
});
