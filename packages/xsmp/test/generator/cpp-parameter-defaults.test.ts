import { expect, test } from 'vitest';
import { URI } from 'langium';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { TasMdkGenerator } from 'xsmp-tas-mdk';
import { setClangFormat } from '@xsmp/core/generator';
import { createProfileGeneratorTestContext, cleanupProfileGeneratorTestContext, generateProfileTree, parseProfileGeneratorFixture } from '../profile-generator-test-utils.js';
import { rebuildTestDocuments } from '../test-services.js';

async function parseCase(body: string, profile = 'xsmp-sdk') {
    const context = await createProfileGeneratorTestContext();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cpp-validation-'));
    context.tempDirs.push(directory);
    fs.mkdirSync(path.join(directory, 'src'));
    const project = await context.parseProject(`project 'validation' using 'ECSS_SMP_2025'\nsource 'src'\n${profile ? `profile '${profile}'` : ''}\n`, {
        documentUri: URI.file(path.join(directory, 'xsmp.project')).toString(),
    });
    const document = await context.parseCatalogue(`catalogue Validation\nnamespace checks { ${body} }`, {
        documentUri: URI.file(path.join(directory, 'src', 'validation.xsmpcat')).toString(),
    });
    context.documents.push(project, document);
    await rebuildTestDocuments(context.services, [project, document]);
    expect(project.parseResult.parserErrors).toHaveLength(0);
    expect(document.parseResult.parserErrors).toHaveLength(0);
    expect((project.diagnostics ?? []).filter(d => d.severity === 1)).toEqual([]);
    return { context, document, diagnostics: document.diagnostics ?? [] };
}

test('rejects defaults that cannot initialize C++ pointers and non-const references', async () => {
    const { context, document, diagnostics } = await parseCase(`
        /** @uuid 83000000-0000-4000-8000-000000000001 */ public model Invalid {
            def void pointer(@ByPointer in Int32 value = 7)
            def void reference(@ByReference in Int32 value = 7)
            def void output(out Int32 value = 7)
        }
    `);
    try {
        const errors = diagnostics.filter(d => d.severity === 1);
        expect(errors).toHaveLength(3);
        expect(errors.filter(d => d.message.includes('C++ pointer'))).toHaveLength(2);
        expect(errors.filter(d => d.message.includes('non-const C++ reference'))).toHaveLength(1);
        await expect(generateProfileTree(context, new XsmpSdkGenerator(context.services.shared), document, 'invalid-parameters-'))
            .rejects.toThrow('Cannot generate parameter');
    } finally { await cleanupProfileGeneratorTestContext(context); }
});

test('keeps scalar and const-reference defaults and renders zero pointer defaults as nullptr', async () => {
    const { context, document, diagnostics } = await parseCase(`
        /** @uuid 83000000-0000-4000-8000-000000000002 */ public model Valid {
            def void scalar(in Int32 value = 7)
            def void reference(@Const @ByReference in Int32 value = 7)
            def void pointer(@ByPointer in Int32 value = 1 - 1)
            def void nullPointer(@ByPointer in Int32 value = nullptr)
            def void parenthesizedNull(@ByPointer in Int32 value = ((nullptr)))
        }
    `);
    try {
        expect(diagnostics.filter(d => d.severity === 1)).toEqual([]);
        const output = await generateProfileTree(context, new XsmpSdkGenerator(context.services.shared), document, 'valid-parameters-');
        const header = fs.readFileSync(path.join(output, 'src-gen/checks/ValidGen.h'), 'utf8');
        expect(header).toMatch(/scalar\(::Smp::Int32 value = 7\)/);
        expect(header).toMatch(/reference\(const ::Smp::Int32\s*&value = 7\)/);
        expect(header).toMatch(/pointer\(::Smp::Int32\s*\*value = nullptr\)/);
        expect(header).toMatch(/nullPointer\(::Smp::Int32\s*\*value = nullptr\)/);
        expect(header).toMatch(/parenthesizedNull\(::Smp::Int32\s*\*value = nullptr\)/);
    } finally { await cleanupProfileGeneratorTestContext(context); }
});

test('does not apply C++ default restrictions to projects without a C++ profile', async () => {
    const { context, diagnostics } = await parseCase(`
        /** @uuid 83000000-0000-4000-8000-000000000003 */ public model Other {
            def void pointer(@ByPointer in Int32 value = 7)
        }
    `, '');
    try { expect(diagnostics.filter(d => d.severity === 1)).toEqual([]); }
    finally { await cleanupProfileGeneratorTestContext(context); }
});


test('does not treat a large unsigned value as a null pointer after signed conversion', async () => {
    const { context, diagnostics } = await parseCase(`
        /** @uuid 83000000-0000-4000-8000-000000000004 */ public model High {
            def void pointer(@ByPointer in UInt64 value = 18446744073709551615UL)
        }
    `);
    try { expect(diagnostics.filter(d => d.message.includes('C++ pointer'))).toHaveLength(1); }
    finally { await cleanupProfileGeneratorTestContext(context); }
});


test.each([['xsmp-sdk', XsmpSdkGenerator], ['tas-mdk', TasMdkGenerator]] as const)('%s preserves null defaults in request handlers for in/out/inout parameters', async (_profile, Generator) => {
    const context = await createProfileGeneratorTestContext();
    try {
        const document = await parseProfileGeneratorFixture(context, 'optional-pointer-parameters.xsmpcat');
        setClangFormat(false);
        const output = await generateProfileTree(context, new Generator(context.services.shared), document, 'optional-pointer-handlers-');
        const file = Generator === TasMdkGenerator ? 'include-gen/optional/ProbeGen.h' : 'src-gen/optional/ProbeGen.cpp';
        const source = fs.readFileSync(path.join(output, file), 'utf8');
        expect(source).toContain('const bool has_value = request->GetParameterIndex("value") >= 0;');
        expect(source).toContain('::Smp::Int32 p_value{};');
        expect(source).toContain('::Smp::AnySimple storage_value;');
        if (Generator === TasMdkGenerator) {
            expect(source).toContain('storage_value.GetType() != ::Smp::PrimitiveTypeKind::PTK_None');
            expect(source).toContain('PTK_String8, true');
        }
        expect(source).toContain('p_value = static_cast<::Smp::String8>(storage_value);');
        expect(source).toContain('ope_string(has_value ? &p_value : nullptr)');
        expect(source).not.toContain('static_cast<::Smp::String8>(request->GetParameterValue(');
        expect(source).toContain('ope_input(has_value ? &p_value : nullptr)');
        expect(source).toContain('ope_output(has_value ? &p_value : nullptr)');
        expect(source).toContain('ope_inout(has_value ? &p_value : nullptr)');
        expect(source).toMatch(/(?:const )?bool has_value_present/);
        expect(source).toContain('::Smp::Int32 p_value_present{};');
        expect(source).toMatch(/if \(has_value\) \{\s*::(?:Xsmp|TasMdk)::Request::set(?:Parameter)?\(/);
        expect(source).not.toContain('PTK_Int32, nullptr');
        expect(source).not.toContain('p_value{nullptr}');
    } finally {
        setClangFormat(true);
        await cleanupProfileGeneratorTestContext(context);
    }
});
