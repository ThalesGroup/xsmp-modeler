import { expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { EsaCdkGenerator } from '@xsmp/profile-esa-cdk';
import { TasMdkGenerator } from 'xsmp-tas-mdk';
import { createProfileGeneratorTestContext, cleanupProfileGeneratorTestContext, parseProfileGeneratorFixture, generateProfileTree } from '../profile-generator-test-utils.js';

test.each([['xsmp-sdk', XsmpSdkGenerator], ['esa-cdk', EsaCdkGenerator], ['tas-mdk', TasMdkGenerator]] as const)('%s preserves const signatures and returns this only when convertible', async (_profile, Generator) => {
    const context = await createProfileGeneratorTestContext();
    try {
        const document = await parseProfileGeneratorFixture(context, 'const-self-pointers.xsmpcat');
        const output = await generateProfileTree(context, new Generator(context.services.shared), document, 'const-self-pointers-');
        for (const name of ['Probe', 'Value']) {
            const source = fs.readFileSync(path.join(output, `src/selfPointers/${name}.cpp`), 'utf8');
            expect(source).toMatch(new RegExp(`${name}::mutableSelf\\(\\) const[^}]*return nullptr;`));
            expect(source).toMatch(new RegExp(`${name}::self\\(\\)[^}]*return this;`));
            expect(source).toMatch(new RegExp(`${name}::constantSelf\\(\\) const[^}]*return this;`));
            expect(source).toMatch(/::staticSelf\(\)[^}]*return nullptr;/);
            expect(source).toMatch(new RegExp(`const ::selfPointers::${name} ?\\*${name}::constantSelf`));
        }
    } finally { await cleanupProfileGeneratorTestContext(context); }
});
