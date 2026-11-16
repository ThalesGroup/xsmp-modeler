import { expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EsaCdkGenerator } from '@xsmp/profile-esa-cdk';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { TasMdkGenerator } from 'xsmp-tas-mdk';
import { setClangFormat } from '@xsmp/core/generator';
import { createProfileGeneratorTestContext, cleanupProfileGeneratorTestContext, parseProfileGeneratorFixture, generateProfileTree } from '../profile-generator-test-utils.js';

test.each([['xsmp-sdk', XsmpSdkGenerator], ['esa-cdk', EsaCdkGenerator], ['tas-mdk', TasMdkGenerator]] as const)('%s distinguishes case, namespace boundaries, packages and generation-gap headers', async (_profile, Generator) => {
    const context = await createProfileGeneratorTestContext();
    try {
        const document = await parseProfileGeneratorFixture(context, 'header-guard-collisions.xsmpcat');
        setClangFormat(false);
        const generator = new Generator(context.services.shared);
        const output = await generateProfileTree(context, generator, document, 'cpp-header-guards-');
        const headers = fs.readdirSync(output, { recursive: true }).filter((file): file is string => typeof file === 'string' && file.endsWith('.h'));
        const guards = headers.map(file => {
            const header = fs.readFileSync(path.join(output, file), 'utf8');
            const guard = /^#ifndef (\S+)$/m.exec(header)?.[1];
            expect(guard, file).toBeDefined();
            expect(header).toContain(`#define ${guard}\n`);
            expect(header).toContain(`#endif // ${guard}`);
            return guard;
        });
        expect(headers).toHaveLength(8);
        expect(new Set(guards).size).toBe(headers.length);
        const regenerated = await generator.generatePackageHeader('guard_Item.h', document.parseResult.value, undefined);
        expect(regenerated).toContain(`#ifndef ${guards.find(guard => guard?.startsWith('XSMP_PACKAGE_'))}`);
    } finally {
        setClangFormat(true);
        await cleanupProfileGeneratorTestContext(context);
    }
});
