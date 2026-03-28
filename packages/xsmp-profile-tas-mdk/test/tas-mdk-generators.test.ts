import { afterEach, beforeAll, describe, test } from 'vitest';
import * as path from 'node:path';
import { TasMdkGenerator, TasMdkPythonGenerator } from '@xsmp/profile-tas-mdk';
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

describe('@xsmp/profile-tas-mdk generators', () => {
    test('generates the expected C++ tree', async () => {
        const document = await parseProfileGeneratorFixture(context);
        const generator = new TasMdkGenerator(context.services.shared);
        setClangFormat(false);
        setGeneratedBy(false);

        const outputDir = await generateProfileTree(context, generator, document, 'tas-mdk-generator-cpp-');
        assertGeneratedTree(outputDir, path.resolve(__dirname, 'expected', 'generator-cpp'));
    });

    test('generates the expected Python helper tree', async () => {
        const document = await parseProfileGeneratorFixture(context);
        const generator = new TasMdkPythonGenerator(context.services.shared);
        setClangFormat(false);
        setGeneratedBy(false);

        const outputDir = await generateProfileTree(context, generator, document, 'tas-mdk-generator-python-');
        assertGeneratedTree(outputDir, path.resolve(__dirname, 'expected', 'generator-python'));
    });
});
