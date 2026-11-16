import { expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { EsaCdkGenerator } from '@xsmp/profile-esa-cdk';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { TasMdkGenerator } from 'xsmp-tas-mdk';
import { setClangFormat } from '@xsmp/core/generator';
import { createProfileGeneratorTestContext, cleanupProfileGeneratorTestContext, parseProfileGeneratorFixture, generateProfileTree } from '../profile-generator-test-utils.js';

test.each([XsmpSdkGenerator, EsaCdkGenerator, TasMdkGenerator])('%s converts complete numeric enum expressions and preserves typed references', async Generator => {
    const context = await createProfileGeneratorTestContext();
    try {
        const document = await parseProfileGeneratorFixture(context, 'enum-expression-casts.xsmpcat');
        setClangFormat(false);
        const output = await generateProfileTree(context, new Generator(context.services.shared), document, 'cpp-enum-expressions-');
        const header = fs.readFileSync(path.join(output, Generator === TasMdkGenerator ? 'include-gen' : 'src-gen', 'enumexpressions/State.h'), 'utf8');
        const cast = 'static_cast<::enumexpressions::Mode>';
        expect(header).toContain(`Calculated{${cast}(Base - 1)}`);
        expect(header).toContain(`binary{${cast}(2 - 1)}`);
        expect(header).toContain(`unary{${cast}(-1)}`);
        expect(header).toContain(`parenthesized{${cast}((2 - 1))}`);
        expect(header).toContain(`numericReference{${cast}(Base)}`);
        expect(header).toContain('literal{::enumexpressions::Mode::One}');
        expect(header).toContain('enumReference{::enumexpressions::Mode::One}');
        expect(header).toContain('alias{Alias}');
        expect(header).toContain(`${cast}(2 - 1), ${cast}(-1)`);
        expect(header).toContain(`/* .value = */${cast}(2 - 1)`);
        expect(header).toContain('std::cos(M_PI)');
        expect(header).not.toContain('::Mode::Two -');
    } finally {
        setClangFormat(true);
        await cleanupProfileGeneratorTestContext(context);
    }
});
