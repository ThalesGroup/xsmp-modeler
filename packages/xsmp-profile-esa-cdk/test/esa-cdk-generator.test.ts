import { afterEach, beforeAll, describe, test } from 'vitest';
import * as path from 'node:path';
import { EsaCdkGenerator } from '@xsmp/profile-esa-cdk';
import { setClangFormat, setGeneratedBy } from 'xsmp/generator';
import {
    assertGeneratedTree,
    cleanupProfileGeneratorTestContext,
    createProfileGeneratorTestContext,
    generateProfileTree,
    parseProfileGeneratorFixture,
    type ProfileGeneratorTestContext,
} from '../../xsmp/test/profile-generator-test-utils.js';

let context: ProfileGeneratorTestContext;

beforeAll(async () => {
    context = await createProfileGeneratorTestContext();
});

afterEach(async () => {
    setClangFormat(true);
    setGeneratedBy(true);
    await cleanupProfileGeneratorTestContext(context);
});

describe('@xsmp/profile-esa-cdk generator', () => {
    test('generates the expected C++ tree', async () => {
        const document = await parseProfileGeneratorFixture(context);
        const generator = new EsaCdkGenerator(context.services.shared);
        setClangFormat(false);
        setGeneratedBy(false);

        const outputDir = await generateProfileTree(context, generator, document, 'esa-cdk-generator-');
        assertGeneratedTree(outputDir, path.resolve(__dirname, 'expected', 'generator-cpp'));
    });
});
