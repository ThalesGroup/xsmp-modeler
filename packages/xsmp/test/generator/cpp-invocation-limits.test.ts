import { expect, test } from 'vitest';
import { AstUtils, URI, type LangiumDocument } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { parseHelper } from 'langium/test';
import * as ast from '@xsmp/core/ast';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { XsmpSdkGenerator } from '@xsmp/profile-xsmp-sdk';
import { TasMdkGenerator } from 'xsmp-tas-mdk';
import { createProfileGeneratorTestContext, cleanupProfileGeneratorTestContext, generateProfileTree } from '../profile-generator-test-utils.js';
import { createBuiltinTestXsmpServices, rebuildTestDocuments } from '../test-services.js';

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

test('preserves C++ APIs and diagnoses signatures that cannot be dynamically invoked', async () => {
    const { context, document, diagnostics } = await parseCase(`
        /** @uuid 85000000-0000-4000-8000-000000000001 */ public model Probe {
            @Constructor def void make(in Int32 value)
            @Constructor def void create(in Float64 value)
            def @ByPointer Int32 pointer()
            def Int32 calculate(in Int32 value)
            def Int32 calculate(in Float64 value)
            def Int32 normal(in Int32 value)
        }
    `);
    try {
        expect(diagnostics.filter(d => d.severity === 1)).toEqual([]);
        expect(diagnostics.filter(d => d.message.includes('not published for dynamic invocation'))).toHaveLength(3);
        const output = await generateProfileTree(context, new XsmpSdkGenerator(context.services.shared), document, 'invocation-limits-');
        const source = fs.readFileSync(path.join(output, 'src-gen/checks/ProbeGen.cpp'), 'utf8');
        const header = fs.readFileSync(path.join(output, 'src-gen/checks/ProbeGen.h'), 'utf8');
        const userHeader = fs.readFileSync(path.join(output, 'src/checks/Probe.h'), 'utf8');
        expect(source).not.toContain('component->make(');
        expect(source).not.toContain('component->pointer(');
        expect(source).not.toContain('op_calculate');
        expect(source).toContain('component->normal(');
        expect(source).toContain('pointer return values');
        expect(source).toContain('overloaded operation names');
        expect(header).toMatch(/Int32\s*\*pointer\(/);
        expect(header.match(/calculate\(/g)).toHaveLength(2);
        expect(userHeader.match(/using ProbeGen::ProbeGen;/g)).toHaveLength(1);
    } finally { await cleanupProfileGeneratorTestContext(context); }
});

test('detects inherited overloads without treating matching overrides as overloads', async () => {
    const { context, document, diagnostics } = await parseCase(`
        /** @uuid 85000000-0000-4000-8000-000000000002 */ public model Base { def Int32 calculate(in Int32 value) }
        /** @uuid 85000000-0000-4000-8000-000000000003 */ public model Overload extends Base { def Int32 calculate(in Float64 value) }
        /** @uuid 85000000-0000-4000-8000-000000000004 */ public model Override extends Base { def Int32 calculate(in Int32 value) }
    `);
    try {
        expect(diagnostics.filter(d => d.severity === 1)).toEqual([]);
        expect(diagnostics.filter(d => d.message.includes('overloaded operation names'))).toHaveLength(1);
        const output = await generateProfileTree(context, new XsmpSdkGenerator(context.services.shared), document, 'inherited-invocation-');
        const base = fs.readFileSync(path.join(output, 'src-gen/checks/BaseGen.cpp'), 'utf8');
        const derived = fs.readFileSync(path.join(output, 'src-gen/checks/OverloadGen.cpp'), 'utf8');
        expect(base).toContain('component->calculate(');
        expect(derived).not.toContain('component->calculate(');
        expect(derived).not.toContain('op_calculate');
    } finally { await cleanupProfileGeneratorTestContext(context); }
});


test('TASMDK applies invocation eligibility to its header-defined request handlers', async () => {
    const { context, document } = await parseCase(`
        /** @uuid 85000000-0000-4000-8000-000000000005 */ public model Probe {
            @Constructor def void make(in Int32 value)
            def @ByPointer Int32 pointer()
            def Int32 calculate(in Int32 value)
            def Int32 calculate(in Float64 value)
            def Int32 normal(in Int32 value)
        }
    `);
    try {
        const output = await generateProfileTree(context, new TasMdkGenerator(context.services.shared), document, 'tas-invocation-limits-');
        const header = fs.readFileSync(path.join(output, 'include-gen/checks/ProbeGen.h'), 'utf8');
        const source = fs.readFileSync(path.join(output, 'src-gen/checks/ProbeGen.cpp'), 'utf8');
        const userHeader = fs.readFileSync(path.join(output, 'include/checks/Probe.h'), 'utf8');
        expect(header).not.toContain('component.make(');
        expect(header).not.toContain('component.pointer(');
        expect(header).not.toContain('component.calculate(');
        expect(header).toContain('component.normal(');
        expect(source).not.toContain('op_calculate');
        expect(userHeader.match(/using ProbeGen::ProbeGen;/g)).toHaveLength(1);
    } finally { await cleanupProfileGeneratorTestContext(context); }
});


test('updates invocation eligibility when only an ancestor document changes', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cpp-invocation-update-'));
    fs.mkdirSync(path.join(directory, 'src'));
    const services = await createBuiltinTestXsmpServices(NodeFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
    const sources = {
        'xsmp.project': "project 'update' using 'ECSS_SMP_2025'\nsource 'src'\nprofile 'xsmp-sdk'\n",
        'src/base.xsmpcat': 'catalogue BaseCatalogue namespace bases { /** @uuid 85000000-0000-4000-8000-000000000006 */ public model Base { def Int32 calculate(in Int32 value) } }',
        'src/derived.xsmpcat': 'catalogue DerivedCatalogue namespace derived { /** @uuid 85000000-0000-4000-8000-000000000007 */ public model Derived extends bases.Base { def Int32 calculate(in Int32 value) } }',
    };
    const documents: LangiumDocument[] = [];
    try {
        for (const [name, source] of Object.entries(sources)) {
            const file = path.join(directory, name);
            fs.writeFileSync(file, source);
            const parse = parseHelper(name.endsWith('.project') ? services.xsmpproject : services.xsmpcat);
            documents.push(await parse(source, { documentUri: URI.file(file).toString() }));
        }
        await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });
        expect(documents.flatMap(doc => (doc.diagnostics ?? []).filter(d => d.severity === 1))).toEqual([]);
        class InspectableGenerator extends XsmpSdkGenerator {
            reason(operation: ast.Operation) { return this.getNotInvokableReason(operation); }
        }
        const generator = new InspectableGenerator(services.shared);
        const operation = () => AstUtils.streamAllContents(documents[2].parseResult.value).filter(ast.isOperation).head()!;
        const originalOperation = operation();
        expect(generator.reason(originalOperation)).toBeUndefined();
        fs.writeFileSync(path.join(directory, 'src/base.xsmpcat'), sources['src/base.xsmpcat'].replace('def Int32 calculate(in Int32 value)', 'def Int32 calculate(in Int32 value) def Int32 calculate(in Float64 value)'));
        await services.shared.workspace.DocumentBuilder.update([documents[1].uri], []);
        expect(operation()).toBe(originalOperation);
        expect(generator.reason(operation())).toContain('overloaded operation names');
        fs.writeFileSync(path.join(directory, 'src/base.xsmpcat'), sources['src/base.xsmpcat']);
        await services.shared.workspace.DocumentBuilder.update([documents[1].uri], []);
        expect(generator.reason(operation())).toBeUndefined();
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
