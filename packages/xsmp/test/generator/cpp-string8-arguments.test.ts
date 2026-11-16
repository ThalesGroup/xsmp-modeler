import { expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { createProfileGeneratorTestContext, cleanupProfileGeneratorTestContext, parseProfileGeneratorFixture, generateProfileTree } from '../profile-generator-test-utils.js';

test('materializes String8 arguments while retaining their owner through invocation', async () => {
    const context = await createProfileGeneratorTestContext();
    try {
        const document = await parseProfileGeneratorFixture(context, 'string8-arguments.xsmpcat');
        const output = await generateProfileTree(context, new XsmpSdkGenerator(context.services.shared), document, 'string8-arguments-');
        const source = fs.readFileSync(path.join(output, 'src-gen/stringArguments/ProbeGen.cpp'), 'utf8');
        const ownerAndValue = /const auto storage_text =\s*request->GetParameterValue\(request->GetParameterIndex\("text"\)\);\s*auto p_text = static_cast<::Smp::String8>\(storage_text\);/g;
        expect(source.match(ownerAndValue)).toHaveLength(5);
        for (const name of ['value', 'reference', 'constReference']) {
            expect(source).toContain(`component->${name}(p_text);`);
        }
        for (const name of ['pointer', 'constPointer']) {
            expect(source).toContain(`component->${name}(&p_text);`);
        }
        expect(source).toContain('component->optionalPointer(has_text ? &p_text : nullptr);');
        expect(source).toContain('component->number(p_value);');
        expect(source).not.toContain('&static_cast<');
    } finally { await cleanupProfileGeneratorTestContext(context); }
});
