import { expect, test } from 'vitest';
import { URI } from 'langium';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { EsaCdkGenerator } from '@xsmp/profile-esa-cdk';
import { TasMdkGenerator } from 'xsmp-tas-mdk';
import { generateDocuments } from '../generation-test-utils.js';
import { createProfileGeneratorTestContext, cleanupProfileGeneratorTestContext, parseProfileGeneratorFixture } from '../profile-generator-test-utils.js';

test.each([['xsmp-sdk', XsmpSdkGenerator], ['esa-cdk', EsaCdkGenerator], ['tas-mdk', TasMdkGenerator]] as const)('%s defines operations on the actual declaring class', async (_profile, Generator) => {
    const context = await createProfileGeneratorTestContext();
    try {
        const document = await parseProfileGeneratorFixture(context, 'static-operations.xsmpcat');
        const output = fs.mkdtempSync(path.join(os.tmpdir(), 'static-operations-'));
        context.tempDirs.push(output);
        const userHeader = path.join(output, Generator === TasMdkGenerator ? 'include' : 'src', 'operations/GapValue.h');
        fs.mkdirSync(path.dirname(userHeader), { recursive: true });
        fs.writeFileSync(userHeader, '#include <operations/GapValueGen.h>\nnamespace operations { class GapValue: public GapValueGen { public: void ordinary() override; }; }\n');
        await generateDocuments(new Generator(context.services.shared), [document.parseResult.value], URI.file(output));
        const source = (name: string) => fs.readFileSync(path.join(output, `src/operations/${name}.cpp`), 'utf8');
        expect(source('Model')).toContain('ModelGen::shared()');
        expect(source('Model')).toContain('ModelGen::nonVirtual()');
        expect(source('Model')).toContain('Model::ordinary()');
        expect(source('Model')).toMatch(/ModelGen::self\(\)[\s\S]*?return nullptr;/);
        expect(source('Model')).toMatch(/ModelGen::nonVirtualSelf\(\)[\s\S]*?return nullptr;/);
        expect(source('Value')).toContain('Value::shared()');
        expect(source('Value')).not.toContain('ValueGen::');
        expect(source('GapValue')).toContain('GapValueGen::shared()');
        expect(source('GapValue')).toContain('GapValueGen::nonVirtual()');
        expect(source('GapValue')).toContain('GapValue::ordinary()');
        expect(fs.readFileSync(path.join(output, 'src-gen/operations/ModelGen.cpp'), 'utf8')).not.toContain('void ModelGen::shared()');
    } finally { await cleanupProfileGeneratorTestContext(context); }
});
