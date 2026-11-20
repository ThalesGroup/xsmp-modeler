import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { URI } from 'langium';
import { EsaCdkGenerator } from '@xsmp/profile-esa-cdk';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { TasMdkGenerator } from 'xsmp-tas-mdk';
import { setClangFormat } from '@xsmp/core/generator';
import {
    cleanupProfileGeneratorTestContext,
    createProfileGeneratorTestContext,
    generateProfileTree,
    type ProfileGeneratorTestContext,
} from '../../xsmp/test/profile-generator-test-utils.js';
import { rebuildTestDocuments } from '../../xsmp/test/test-services.js';

let context: ProfileGeneratorTestContext;

beforeAll(async () => {
    context = await createProfileGeneratorTestContext();
});
afterEach(async () => {
    setClangFormat(true);
    await cleanupProfileGeneratorTestContext(context);
});

const source = `catalogue PartialDefaults
namespace partial {
    /** @uuid 10000000-0000-4000-8000-000000000001 */
    public struct Pair {
        field Smp.Int32 first = 1
        field Smp.Int32 second = 2
        field Smp.Int32 third
    }
    /** @uuid 10000000-0000-4000-8000-000000000002 */
    public struct Single { field Smp.Int32 value = 3 }
    /** @uuid 10000000-0000-4000-8000-000000000003 */
    public struct Plain { field Smp.Int32 first field Smp.Int32 second }
    /** @uuid 10000000-0000-4000-8000-000000000004 */
    public array Vector = Smp.Int32[2]
    /** @uuid 10000000-0000-4000-8000-000000000005 */
    public array Matrix = Vector[2]
    /** @uuid 10000000-0000-4000-8000-000000000006 */
    public string Label[16]
    /** @uuid 10000000-0000-4000-8000-000000000007 */
    public enum Mode { Off = 0, On = 1 }
    /** @uuid 10000000-0000-4000-8000-000000000008 */
    public struct Composite {
        constant Smp.Int32 DefaultCount = 17
        field Smp.Int32 first = 1
        field Pair pair = {3}
        field Vector vector = {4, 5}
        field Matrix matrix = {{6, 7}, {8, 9}}
        field Label label = "hello"
        field Mode mode = Mode.On
        field Smp.Int32 count = DefaultCount
        field Smp.Bool enabled = true
    }
    /** @uuid 10000000-0000-4000-8000-000000000009 */
    public struct Holder {
        field Pair empty = {}
        field Pair partial = {7}
        field Pair complete = {7, 8, 9}
        field Composite composite = {42}
    }
}`;

const profiles = [
    { name: 'tas-mdk', Generator: TasMdkGenerator, headers: 'include-gen' },
    { name: 'esa-cdk', Generator: EsaCdkGenerator, headers: 'src-gen' },
    { name: 'xsmp-sdk', Generator: XsmpSdkGenerator, headers: 'src-gen' },
];

describe.each(profiles)('$name structure initialization', ({ name, Generator, headers }) => {
    test.each(['2020', '2025'])('preserves omitted field defaults with SMP %s', async (standard) => {
        const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-partial-defaults-'));
        context.tempDirs.push(workspace);
        fs.mkdirSync(path.join(workspace, 'smdl'));
        const project = await context.parseProject(`project 'PartialDefaults' using 'ECSS_SMP_${standard}'\nsource 'smdl'\nprofile '${name}'`, {
            documentUri: URI.file(path.join(workspace, 'xsmp.project')).toString(),
        });
        const catalogue = await context.parseCatalogue(source, {
            documentUri: URI.file(path.join(workspace, 'smdl', 'PartialDefaults.xsmpcat')).toString(),
        });
        context.documents.push(project, catalogue);
        await rebuildTestDocuments(context.services, [project, catalogue]);
        for (const document of [project, catalogue]) {
            expect(document.parseResult.parserErrors).toEqual([]);
            expect(document.diagnostics?.filter(d => d.severity === 1)).toEqual([]);
        }
        setClangFormat(false);
        const output = await generateProfileTree(context, new Generator(context.services.shared), catalogue, 'xsmp-partial-defaults-output-');
        const header = (type: string) => fs.readFileSync(path.join(output, headers, 'partial', `${type}.h`), 'utf8');
        const pair = header('Pair');
        const single = header('Single');
        const composite = header('Composite');
        const holder = header('Holder');

        expect(holder).toContain('partial{ 7}');
        expect(holder).toContain('complete{ 7, 8, 9}');
        expect(header('Plain')).not.toMatch(/\n\s+Plain\(/);
        if (name === 'xsmp-sdk') {
            // C++17 aggregates already apply omitted member initializers.
            expect(pair).not.toMatch(/\n\s+Pair\(/);
            return;
        }
        expect(pair).toContain('Pair() = default;');
        expect(pair).toContain('Pair(::Smp::Int32 first, ::Smp::Int32 second = ::Smp::Int32{2}, ::Smp::Int32 third = ::Smp::Int32{})');
        expect(single).toContain('Single(::Smp::Int32 value)');
        expect(single).not.toContain('Single(::Smp::Int32 value =');
        expect(composite).toContain('::partial::Pair pair = ::partial::Pair{ 3}');
        expect(composite).toContain('::partial::Vector vector = ::partial::Vector{{ 4, 5}}');
        expect(composite).toContain('::partial::Matrix matrix = ::partial::Matrix{{ {{ 6, 7}}, {{ 8, 9}}}}');
        expect(composite).toContain('::partial::Label label = ::partial::Label{"hello"}');
        expect(composite).toContain('::partial::Mode mode = ::partial::Mode{::partial::Mode::On}');
        expect(composite).toContain('::Smp::Int32 count = ::Smp::Int32{DefaultCount}');
        expect(composite).toContain('::Smp::Bool enabled = ::Smp::Bool{true}');
    });
});
