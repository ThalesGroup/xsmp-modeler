import { expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { setClangFormat } from '@xsmp/core/generator';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { EsaCdkGenerator } from '@xsmp/profile-esa-cdk';
import { TasMdkGenerator } from 'xsmp-tas-mdk';
import { createProfileGeneratorTestContext, cleanupProfileGeneratorTestContext, parseProfileGeneratorFixture, generateProfileTree } from '../profile-generator-test-utils.js';

test.each([['xsmp-sdk', XsmpSdkGenerator], ['esa-cdk', EsaCdkGenerator], ['tas-mdk', TasMdkGenerator]] as const)('%s preserves composite return defaults with the array storage braces', async (_profile, Generator) => {
    const context = await createProfileGeneratorTestContext();
    try {
        const document = await parseProfileGeneratorFixture(context, 'composite-return-defaults.xsmpcat');
        setClangFormat(false);
        const output = await generateProfileTree(context, new Generator(context.services.shared), document, 'composite-return-defaults-');
        const source = fs.readFileSync(path.join(output, 'src/defaults/Device.cpp'), 'utf8');
        for (const operation of ['pair', 'matrix', 'cube', 'hypercube', 'large']) {
            const expression = source.match(new RegExp(`Device::${operation}\\(\\)[\\s\\S]*?return ([^;]+);`))?.[1];
            expect(expression, operation).toBe('{}');
        }
        expect(source).toContain('return {{{/*.number = */0, /*.flag = */false}, {/*.number = */0, /*.flag = */false}}};');
        expect(source).toContain('return {/*.data = */{}};');
        expect(source).toContain('return {{::defaults::Choice::First, ::defaults::Choice::First}};');
        expect(source).toContain('return {{"", ""}};');
        // The million-element numeric array must not expand into a million literals.
        expect(source.length).toBeLessThan(10000);
    } finally {
        setClangFormat(true);
        await cleanupProfileGeneratorTestContext(context);
    }
});
