import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { URI } from 'langium';
import { setClangFormat, setGeneratedBy } from '@xsmp/core/generator';
import type { Component } from '@xsmp/core/ast';
import { TasMdkGenerator, TasMdkPythonGenerator } from 'xsmp-tas-mdk';
import { generateDocuments } from '../../xsmp/test/generation-test-utils.js';
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

describe('xsmp-tas-mdk generators', () => {
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

    test('skips existing wrapper rendering and removes only owned Python outputs after a restart', async () => {
        class ObservedGenerator extends TasMdkPythonGenerator {
            wrapperRenders = 0;
            protected override generateWrapper(type: Component, notice: string | undefined, libName: string) {
                this.wrapperRenders++;
                return super.generateWrapper(type, notice, libName);
            }
        }
        const document = await parseProfileGeneratorFixture(context);
        const first = new ObservedGenerator(context.services.shared);
        const outputDir = await generateProfileTree(context, first, document, 'tas-mdk-python-lifecycle-');
        expect(first.wrapperRenders).toBeGreaterThan(0);
        const wrapper = path.join(outputDir, 'helpers/test_utils/demo/support/RootModel/wrapper.py');
        const userCode = path.join(outputDir, 'helpers/builder/demo/support/RootModel/user_code.py');
        const unknown = path.join(outputDir, 'helpers/user_module.py');
        fs.writeFileSync(wrapper, '# customized wrapper\n');
        fs.writeFileSync(userCode, '# customized user code\n');
        fs.writeFileSync(unknown, '# unrelated module\n');

        const fresh = new ObservedGenerator(context.services.shared);
        await generateDocuments(fresh, [document.parseResult.value], URI.file(outputDir));
        expect(fresh.wrapperRenders).toBe(0);
        expect(fs.readFileSync(wrapper, 'utf8')).toBe('# customized wrapper\n');

        // All declarations disappear. A fresh writer must load the ownership inventory.
        await generateDocuments(new ObservedGenerator(context.services.shared), [], URI.file(outputDir));
        expect(fs.existsSync(path.join(outputDir, 'helpers/builder/demo/support/RootModel/generated_info.py'))).toBe(false);
        expect(fs.existsSync(path.join(outputDir, 'helpers/builder/demo/support/RootModel/generated_icd.py'))).toBe(false);
        expect(fs.readFileSync(wrapper, 'utf8')).toBe('# customized wrapper\n');
        expect(fs.readFileSync(userCode, 'utf8')).toBe('# customized user code\n');
        expect(fs.readFileSync(unknown, 'utf8')).toBe('# unrelated module\n');
    });

    test('creates shared namespace initializers despite duplicate requests across catalogues', async () => {
        const document = await parseProfileGeneratorFixture(context);
        const first = await context.parseCatalogue(`catalogue First
namespace shared { /** @uuid 11111111-1111-1111-1111-111111111111 */ public model One {} }`, {
            documentUri: URI.file(path.join(path.dirname(document.uri.fsPath), 'First.xsmpcat')).toString(),
        });
        const second = await context.parseCatalogue(`catalogue Second
namespace shared { /** @uuid 22222222-2222-2222-2222-222222222222 */ public model Two {} }`, {
            documentUri: URI.file(path.join(path.dirname(document.uri.fsPath), 'Second.xsmpcat')).toString(),
        });
        context.documents.push(first, second);
        expect(first.parseResult.parserErrors).toEqual([]);
        expect(second.parseResult.parserErrors).toEqual([]);
        const generator = new TasMdkPythonGenerator(context.services.shared);
        const outputDir = fs.mkdtempSync(path.join(path.dirname(path.dirname(document.uri.fsPath)), 'python-shared-'));
        await generateDocuments(generator, [first.parseResult.value, second.parseResult.value], URI.file(outputDir));
        expect(fs.existsSync(path.join(outputDir, 'helpers/builder/shared/__init__.py'))).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'helpers/builder/shared/One/generated_info.py'))).toBe(true);
        expect(fs.existsSync(path.join(outputDir, 'helpers/builder/shared/Two/generated_info.py'))).toBe(true);
    });
});
