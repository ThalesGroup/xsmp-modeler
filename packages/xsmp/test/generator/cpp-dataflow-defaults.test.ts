import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { setClangFormat, setGeneratedBy } from '@xsmp/core/generator';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { TasMdkGenerator } from 'xsmp-tas-mdk';
import {
    cleanupProfileGeneratorTestContext,
    createProfileGeneratorTestContext,
    generateProfileTree,
    parseProfileGeneratorFixture,
    type ProfileGeneratorTestContext,
} from '../profile-generator-test-utils.js';

interface DefaultCase {
    name: string;
    type: string;
    value?: string;
}

// Each array aggregate has an outer pair of braces around its element storage.
// These spellings are also valid as complete raw-value initializers.
const cases: DefaultCase[] = [
    { name: 'scalar', type: 'Int32', value: '7' },
    { name: 'point', type: 'Point', value: '{1, 2}' },
    { name: 'packet', type: 'Packet', value: '{ {{1, 2}}, 3 }' },
    { name: 'row', type: 'Row', value: '{{1, 2}}' },
    { name: 'matrix', type: 'Matrix', value: '{ { {{1, 2}}, {{3, 4}} } }' },
    {
        name: 'cube', type: 'Cube',
        value: '{ { { { {{1, 2}}, {{3, 4}} } }, { { {{5, 6}}, {{7, 8}} } } } }',
    },
    {
        name: 'hypercube', type: 'Hypercube',
        value: `{
            {
                { { { { {{1, 2}}, {{3, 4}} } }, { { {{5, 6}}, {{7, 8}} } } } },
                { { { { {{9, 10}}, {{11, 12}} } }, { { {{13, 14}}, {{15, 16}} } } } }
            }
        }`,
    },
    { name: 'points', type: 'Points', value: '{ { {1, 2}, {3, 4} } }' },
    { name: 'packets', type: 'Packets', value: '{ { { {{1, 2}}, 3 }, { {{4, 5}}, 6 } } }' },
    { name: 'matrix_partial', type: 'Matrix', value: '{ { {{1}} } }' },
    { name: 'points_partial', type: 'Points', value: '{ { {1} } }' },
    { name: 'matrix_empty', type: 'Matrix', value: '{{}}' },
    { name: 'matrix_absent', type: 'Matrix' },
];

describe.each([
    { profile: 'tas-mdk', Generator: TasMdkGenerator, wrapsInputs: true },
    { profile: 'xsmp-sdk', Generator: XsmpSdkGenerator, wrapsInputs: false },
])('$profile dataflow field defaults', ({ profile, Generator, wrapsInputs }) => {
    let context: ProfileGeneratorTestContext;
    let source: string;

    beforeAll(async () => {
        context = await createProfileGeneratorTestContext();
        const document = await parseProfileGeneratorFixture(context, 'dataflow-defaults.xsmpcat');
        setClangFormat(false);
        setGeneratedBy(false);
        const outputDir = await generateProfileTree(
            context, new Generator(context.services.shared), document, `${profile}-dataflow-defaults-`,
        );
        source = fs.readFileSync(path.join(outputDir, 'src-gen', 'defaults', 'ProbeGen.cpp'), 'utf8');
    });

    afterAll(async () => {
        setClangFormat(true);
        setGeneratedBy(true);
        await cleanupProfileGeneratorTestContext(context);
    });

    test.each(cases)('initializes input/output $name fields', ({ name, type, value }) => {
        for (const direction of ['input', 'output']) {
            const field = `${direction === 'input' ? 'inp' : 'out'}_${name}`;
            let expected: string;
            if (direction === 'input' && !wrapsInputs) {
                expected = `${field}${type === 'Int32' ? `{${value}}` : value ?? '{}'}`;
            } else {
                const uuid = type === 'Int32' ? '::Smp::Uuids::Uuid_Int32' : `::defaults::Uuid_${type}`;
                const args = wrapsInputs
                    ? `"${field}", "", this, ::Smp::ViewKind::VK_All, type_registry, ${uuid}`
                    : `simulator->GetTypeRegistry(), ${uuid}, "${field}", "", this, ::Smp::ViewKind::VK_All`;
                expected = `${field}{${args}${value === undefined ? '' : `, ${value}`}}`;
            }
            expect(normalize(initializer(source, field)), field).toBe(normalize(expected));
        }
    });

    test('keeps ordinary composite array initializers unchanged', () => {
        expect(normalize(initializer(source, 'sta_matrix'))).toBe('sta_matrix{{{{1,2}},{{3,4}}}}');
        expect(normalize(initializer(source, 'sta_points'))).toBe('sta_points{{{1,2},{3,4}}}');
    });
});

function normalize(source: string): string {
    return source.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, '');
}

function initializer(source: string, field: string): string {
    const start = source.indexOf(`// Field ${field}\n`);
    expect(start, `Missing initializer for ${field}`).toBeGreaterThanOrEqual(0);
    const opening = source.indexOf('{', start);
    let depth = 0;
    for (let end = opening; end < source.length; end++) {
        if (source[end] === '{') depth++;
        else if (source[end] === '}' && --depth === 0) return source.slice(start, end + 1);
    }
    throw new Error(`Unterminated initializer for ${field}`);
}
