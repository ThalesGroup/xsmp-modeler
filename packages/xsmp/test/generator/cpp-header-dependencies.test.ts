import { expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { createProfileGeneratorTestContext, cleanupProfileGeneratorTestContext, parseProfileGeneratorFixture, generateProfileTree } from '../profile-generator-test-utils.js';

test('operation signatures break include cycles while retaining transitive type definitions', async () => {
    const context = await createProfileGeneratorTestContext();
    try {
        const document = await parseProfileGeneratorFixture(context, 'header-dependencies.xsmpcat');
        const output = await generateProfileTree(context, new XsmpSdkGenerator(context.services.shared), document, 'cpp-headers-');
        for (const [current, other] of [['A', 'B'], ['B', 'A']]) {
            const header = fs.readFileSync(path.join(output, `src-gen/dependencies/${current}.h`), 'utf8');
            const source = fs.readFileSync(path.join(output, `src-gen/dependencies/${current}.cpp`), 'utf8');
            expect(header).toContain(`class ${other};`);
            expect(header).toContain(`#include <dependencies/${other}.h>`);
            expect(header.indexOf(`class ${other};`)).toBeLessThan(header.indexOf(`#include <dependencies/${other}.h>`));
            expect(source).toContain(`#include <dependencies/${other}.h>`);
        }
        expect(fs.readFileSync(path.join(output, 'src-gen/dependencies/Defaults.h'), 'utf8'))
            .toContain('#include <dependencies/Value.h>');
    } finally {
        await cleanupProfileGeneratorTestContext(context);
    }
});
