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
        documentUri: URI.file(path.join(directory, 'src', 'Validation.xsmpcat')).toString(),
    });
    context.documents.push(project, document);
    await rebuildTestDocuments(context.services, [project, document]);
    expect(project.parseResult.parserErrors).toHaveLength(0);
    expect(document.parseResult.parserErrors).toHaveLength(0);
    expect((project.diagnostics ?? []).filter(d => d.severity === 1)).toEqual([]);
    return { context, document, diagnostics: document.diagnostics ?? [] };
}

test.each(['', 'xsmp-sdk', 'esa-cdk', 'tas-mdk'])('validates pointer and reference defaults once, independently of profile %j', async profile => {
    const { context, document, diagnostics } = await parseCase(`
        /** @uuid 83000000-0000-4000-8000-000000000001 */ public interface Invalid {
            def void pointer(@ByPointer in Int32 value = 7)
            def void reference(@ByReference in Int32 value = 7)
            def void output(out Int32 value = 7)
        }
    `, profile);
    try {
        const errors = diagnostics.filter(d => d.severity === 1);
        expect(errors).toHaveLength(3);
        expect(errors.filter(d => d.message.includes('pointer parameter'))).toHaveLength(2);
        expect(errors.filter(d => d.message.includes('non-const reference'))).toHaveLength(1);
        await expect(generateProfileTree(context, new XsmpSdkGenerator(context.services.shared), document, 'invalid-parameters-'))
            .rejects.toThrow('Cannot generate parameter');
    } finally { await cleanupProfileGeneratorTestContext(context); }
});

test('keeps typed value defaults and accepts nullptr for primitive and composite pointers', async () => {
    const { context, document, diagnostics } = await parseCase(`
        /** @uuid 83000000-0000-4000-8000-000000000005 */ public array Row = Int32[2]
        /** @uuid 83000000-0000-4000-8000-000000000006 */ public struct Point { field Int32 x }
        /** @uuid 83000000-0000-4000-8000-000000000007 */ public interface Target {}
        /** @uuid 83000000-0000-4000-8000-00000000000a */ public using Pointer = Int32*
        /** @uuid 83000000-0000-4000-8000-000000000002 */ public model Valid {
            def void scalar(in Int32 value = 7)
            def void zero(in Int32 value = 0)
            def void reference(@Const @ByReference in Int32 value = 7)
            def void nullPointer(@ByPointer in Int32 value = nullptr)
            def void parenthesizedNull(@ByPointer in Int32 value = ((nullptr)))
            def void output(out Int32 value = nullptr)
            def void inputOutput(inout Int32 value = nullptr)
            def void arrayPointer(@ByPointer in Row value = nullptr)
            def void structurePointer(@ByPointer in Point value = nullptr)
            def void interfacePointer(inout Target value = nullptr)
            def void aliasPointer(in Pointer value = nullptr)
            def void aliasReference(@Const @ByReference in Pointer value = (nullptr))
            def void arrayValue(in Row value = {1, 2})
            def void structureValue(in Point value = {7})
            def void constArrayReference(@Const @ByReference in Row value = {1, 2})
        }
    `, '');
    try {
        expect(diagnostics.filter(d => d.severity === 1)).toEqual([]);
        const output = await generateProfileTree(context, new XsmpSdkGenerator(context.services.shared), document, 'valid-parameters-');
        const header = fs.readFileSync(path.join(output, 'src-gen/checks/ValidGen.h'), 'utf8');
        expect(header).toMatch(/scalar\(::Smp::Int32 value = 7\)/);
        expect(header).toMatch(/reference\(const ::Smp::Int32\s*&value = 7\)/);
        expect(header).toMatch(/nullPointer\(::Smp::Int32\s*\*value = nullptr\)/);
        expect(header).toMatch(/parenthesizedNull\(::Smp::Int32\s*\*value = nullptr\)/);
        expect(header).toMatch(/arrayPointer\(::checks::Row\s*\*value = nullptr\)/);
        expect(header).toMatch(/structurePointer\(::checks::Point\s*\*value = nullptr\)/);
    } finally { await cleanupProfileGeneratorTestContext(context); }
});

test('rejects every non-nullptr pointer default, including integral zero and computed zero', async () => {
    const defaults = ['0', '0U', '0L', '1 - 1', '(0)', 'false', '0.0', '"text"', '18446744073709551615UL'];
    const { context, diagnostics } = await parseCase(`
        /** @uuid 83000000-0000-4000-8000-000000000003 */ public model Other {
            ${defaults.map((value, index) => `def void pointer${index}(@ByPointer in Int32 value = ${value})`).join('\n')}
        }
    `, '');
    try {
        const errors = diagnostics.filter(d => d.severity === 1);
        expect(errors).toHaveLength(defaults.length);
        expect(errors.every(d => d.message === 'A pointer parameter default shall be nullptr.')).toBe(true);
    }
    finally { await cleanupProfileGeneratorTestContext(context); }
});

test('type-checks scalar, const-reference and aggregate defaults without a profile', async () => {
    const { context, diagnostics } = await parseCase(`
        /** @uuid 83000000-0000-4000-8000-000000000008 */ public array Row = Int32[2]
        /** @uuid 83000000-0000-4000-8000-000000000009 */ public struct Point { field Int32 x }
        /** @uuid 83000000-0000-4000-8000-00000000000b */ public interface Target {}
        /** @uuid 83000000-0000-4000-8000-00000000000c */ public using Pointer = Int32*
        /** @uuid 83000000-0000-4000-8000-000000000004 */ public model High {
            def void scalar(in Int32 value = "text")
            def void constReference(@Const @ByReference in Int32 value = "text")
            def void arrayValue(in Row value = {1, "text"})
            def void structureValue(in Point value = {"text"})
            def void nullScalar(in Int32 value = nullptr)
            def void parenthesizedNull(in Int32 value = ((nullptr)))
            def void nullExpression(in Int32 value = 1 + nullptr)
            def void nullArrayElement(in Row value = {1, nullptr})
            def void nullStructureField(in Point value = {nullptr})
            def void nullObjectReference(in Target value = nullptr)
            def void nullString(in String8 value = nullptr)
            def void zeroAlias(in Pointer value = 0)
            def void mutableAliasReference(@Const(false) @ByReference in Pointer value = nullptr)
        }
    `, '');
    try {
        const errors = diagnostics.filter(d => d.severity === 1);
        expect(errors).toHaveLength(13);
        expect(errors.filter(d => d.message.includes('String8 cannot be converted to Smp.Int32'))).toHaveLength(4);
        expect(errors.filter(d => d.message === 'The nullptr literal requires a pointer type.')).toHaveLength(7);
        expect(errors.filter(d => d.message === 'A pointer parameter default shall be nullptr.')).toHaveLength(1);
        expect(errors.filter(d => d.message.includes('non-const reference'))).toHaveLength(1);
    }
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
