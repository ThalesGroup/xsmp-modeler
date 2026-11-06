import { expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { EsaCdkGenerator } from '@xsmp/profile-esa-cdk';
import { TasMdkGenerator } from 'xsmp-tas-mdk';
import { createProfileGeneratorTestContext, cleanupProfileGeneratorTestContext, parseProfileGeneratorFixture, generateProfileTree } from '../profile-generator-test-utils.js';

test.each([XsmpSdkGenerator, EsaCdkGenerator, TasMdkGenerator])('%s defines static associations on their declaring class', async Generator => {
    const context = await createProfileGeneratorTestContext();
    try {
        const document = await parseProfileGeneratorFixture(context, 'static-associations.xsmpcat');
        const output = await generateProfileTree(context, new Generator(context.services.shared), document, 'static-associations-');
        const source = fs.readFileSync(path.join(output, 'src-gen/associations/ProbeGen.cpp'), 'utf8');
        expect(source).toMatch(/::associations::Target\s*\*\s*ProbeGen::shared\s*\{\s*\};/);
        expect(source).toMatch(/const ::associations::Target\s*\*\s*ProbeGen::constShared\s*\{\s*\};/);
        expect(source).toMatch(/::Smp::Int32 ProbeGen::count\s*\{\s*\};/);
        expect(source.match(/ProbeGen::shared/g)).toHaveLength(1);
        expect(source).not.toContain('ProbeGen::instance');
        expect(source).toMatch(/instance\s*\{\s*\}/);
        const valueSource = fs.readFileSync(path.join(output, 'src-gen/associations/Value.cpp'), 'utf8');
        expect(valueSource).toMatch(/::Smp::Int32 Value::count\s*\{\s*\};/);
    } finally {
        await cleanupProfileGeneratorTestContext(context);
    }
});
