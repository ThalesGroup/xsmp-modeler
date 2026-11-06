import { expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { EsaCdkGenerator } from '@xsmp/profile-esa-cdk';
import { TasMdkGenerator } from 'xsmp-tas-mdk';
import { createProfileGeneratorTestContext, cleanupProfileGeneratorTestContext, parseProfileGeneratorFixture, generateProfileTree } from '../profile-generator-test-utils.js';

test.each([
    { profile: 'SDK', Generator: XsmpSdkGenerator, header: 'src', generatedHeader: 'src-gen' },
    { profile: 'ESA', Generator: EsaCdkGenerator, header: 'src', generatedHeader: 'src-gen' },
    { profile: 'TAS', Generator: TasMdkGenerator, header: 'include', generatedHeader: 'include-gen' },
])('$profile keeps const property setters compatible with their base declarations', async ({ Generator, header, generatedHeader }) => {
    const context = await createProfileGeneratorTestContext();
    try {
        const document = await parseProfileGeneratorFixture(context, 'const-property.xsmpcat');
        const output = await generateProfileTree(context, new Generator(context.services.shared), document, 'const-property-');
        const base = fs.readFileSync(path.join(output, generatedHeader, 'properties/ProbeGen.h'), 'utf8');
        const user = fs.readFileSync(path.join(output, header, 'properties/Probe.h'), 'utf8');
        const source = fs.readFileSync(path.join(output, 'src/properties/Probe.cpp'), 'utf8');
        expect(base).toMatch(/void set_value\(const ::Smp::Int32 value\)\s*=\s*0/);
        expect(user).toContain('void set_value(const ::Smp::Int32 value) override;');
        expect(source).toMatch(/void Probe::set_value\(const ::Smp::Int32 value\)\s*\{/);
        expect(user).toContain('get_read() const override;');
        expect(source).toMatch(/Probe::get_read\(\) const\s*\{/);
    } finally {
        await cleanupProfileGeneratorTestContext(context);
    }
});
