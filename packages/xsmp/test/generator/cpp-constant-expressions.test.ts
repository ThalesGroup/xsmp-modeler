import { expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { EsaCdkGenerator } from '@xsmp/profile-esa-cdk';
import { TasMdkGenerator } from 'xsmp-tas-mdk';
import { setClangFormat } from '@xsmp/core/generator';
import { createProfileGeneratorTestContext, cleanupProfileGeneratorTestContext, parseProfileGeneratorFixture, generateProfileTree } from '../profile-generator-test-utils.js';

test.each([['xsmp-sdk', XsmpSdkGenerator], ['esa-cdk', EsaCdkGenerator], ['tas-mdk', TasMdkGenerator]] as const)('%s evaluates math built-ins as C++ constant expressions', async (_profile, Generator) => {
    const context = await createProfileGeneratorTestContext();
    try {
        const document = await parseProfileGeneratorFixture(context, 'constant-expressions.xsmpcat');
        setClangFormat(false);
        const output = await generateProfileTree(context, new Generator(context.services.shared), document, 'cpp-math-');
        const header = fs.readFileSync(path.join(output, Generator === TasMdkGenerator ? 'include-gen/constants/MathValues.h' : 'src-gen/constants/MathValues.h'), 'utf8');
        expect(header).toContain('cosine{(-1.0)}');
        expect(header).toContain('squareRoot{(2.0f)}');
        expect(header).toContain('std::numeric_limits<double>::infinity()');
        expect(header).toContain('std::numeric_limits<double>::quiet_NaN()');
        expect(header).toContain('5.184705528587072e+21');
        expect(header).toContain('negatedCosine{-(-1.0)}');
        expect(header).toContain('negatedInfinity{-(-std::numeric_limits<double>::infinity())}');
        expect(header).toMatch(/negatedCosineFloat\{-\(-[0-9.]+f\)\}/);
        expect(header).not.toMatch(/\{--/);
        expect(header).not.toContain('std::cos(');
        expect(header).not.toContain('M_PI');
    } finally {
        setClangFormat(true);
        await cleanupProfileGeneratorTestContext(context);
    }
});
