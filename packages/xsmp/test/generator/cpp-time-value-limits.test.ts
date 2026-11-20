import { expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EsaCdkGenerator } from '@xsmp/profile-esa-cdk';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { TasMdkGenerator } from 'xsmp-tas-mdk';
import { setClangFormat } from '@xsmp/core/generator';
import { createProfileGeneratorTestContext, cleanupProfileGeneratorTestContext, parseProfileGeneratorFixture, generateProfileTree } from '../profile-generator-test-utils.js';

test.each([XsmpSdkGenerator, EsaCdkGenerator, TasMdkGenerator])('%s emits the minimum temporal Int64 without an oversized positive literal', async Generator => {
    const context = await createProfileGeneratorTestContext();
    try {
        const document = await parseProfileGeneratorFixture(context, 'time-value-limits.xsmpcat');
        setClangFormat(false);
        const output = await generateProfileTree(context, new Generator(context.services.shared), document, 'time-value-limits-');
        const header = fs.readFileSync(path.join(output, Generator === TasMdkGenerator ? 'include-gen' : 'src-gen', 'timelimits/Values.h'), 'utf8');
        for (const name of ['MinimumDuration', 'MinimumDate', 'duration', 'date']) {
            expect(header).toContain(`${name}{(-9223372036854775807LL - 1LL)}`);
        }
        for (const name of ['AdjacentDuration', 'AdjacentDate']) expect(header).toContain(`${name}{-9223372036854775807L}`);
        for (const name of ['MaximumDuration', 'MaximumDate']) expect(header).toContain(`${name}{9223372036854775807L}`);
        expect(header).toContain('Zero{0L}');
        expect(header).not.toContain('-9223372036854775808L');
    } finally {
        setClangFormat(true);
        await cleanupProfileGeneratorTestContext(context);
    }
});
