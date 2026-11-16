import { afterAll, afterEach, beforeAll, expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { EmptyFileSystem, type LangiumDocument, URI } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { createBuiltinTestXsmpServices } from '../test-services.js';

let services: Awaited<ReturnType<typeof createBuiltinTestXsmpServices>>;
const documents: LangiumDocument[] = [];
let root: string;
beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'attached-wrapper-references-'));
    fs.mkdirSync(path.join(root, 'model'));
    services = await createBuiltinTestXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});
afterEach(async () => clearDocuments(services.shared, documents.splice(0)));
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

async function validate(profile: string, type: string | null, field: string, property: string, extra = '') {
    const project = await parseHelper(services.xsmpproject)(`project 'Wrappers' using 'ECSS_SMP_2025'
        source 'model' ${profile ? `profile '${profile}'` : ''}`, { documentUri: URI.file(`${root}/xsmp.project`).toString() });
    const name = field.includes('output') ? 'out_storage' : field.includes('input') ? 'inp_storage' : 'fea_storage';
    const document = await parseHelper(services.xsmpcat)(`catalogue Wrappers
        namespace TasMdk {
            /** @uuid 86000000-0000-4000-8000-000000000601 */ public model Model {}
        }
        namespace wrappers {
            /** @uuid 86000000-0000-4000-8000-000000000602 */ public struct Pair { field Int32 value }
            /** @uuid 86000000-0000-4000-8000-000000000603 */ public array Values = Int32[2]
            /** @uuid 86000000-0000-4000-8000-000000000604 */ @SimpleArray public array Flat = Int32[2]
            ${extra}
            /** @uuid 86000000-0000-4000-8000-000000000605 */
            public model Probe ${profile === 'tas-mdk' ? 'extends TasMdk.Model' : ''} {
                /** Backing storage. */ ${field} field ${type ?? ','} ${name}
                ${property} property ${type ?? 'Int32'} value -> ${name}
            }
        }`, { documentUri: URI.file(`${root}/model/Wrappers.xsmpcat`).toString() });
    documents.push(project, document);
    await services.shared.workspace.DocumentBuilder.build(documents, { validation: true });
    expect(project.diagnostics?.filter(diagnostic => diagnostic.severity === 1) ?? []).toEqual([]);
    expect(document.parseResult.lexerErrors).toEqual([]);
    if (type !== null) expect(document.parseResult.parserErrors).toEqual([]);
    return document;
}

const temporary = 'The XSMP SDK field wrapper converts to a value; an attached Property getter cannot return a reference to it.';
const readOnly = 'The XSMP SDK field wrapper provides only a const reference; the attached Property getter cannot return a non-const reference.';
const tasTemporary = 'The TAS MDK field wrapper converts to a value; an attached Property getter cannot return a reference to it.';

test.each([
    ['xsmp-sdk', 'Int32', 'output', '@ByReference', readOnly],
    ['xsmp-sdk', 'Int32', '@Mutable output', '@ByReference', readOnly],
    ['xsmp-sdk', 'Int32', 'output', '@ByReference @Const(false)', readOnly],
    ['xsmp-sdk', 'Int32', 'output', '@ByReference @Const @ConstGetter', undefined],
    ['xsmp-sdk', 'Int32', '@Forcible', '@ByReference', readOnly],
    ['xsmp-sdk', 'Int32', '@Forcible', '@ByReference @Const', undefined],
    ['xsmp-sdk', 'Int32', '@Failure', '@ByReference', undefined],
    ['xsmp-sdk', 'Int32', '@Mutable @Failure', '@ByReference @ConstGetter', undefined],
    ['xsmp-sdk', 'Int32', 'input', '@ByReference', undefined],
    ['xsmp-sdk', 'Int32', '@Forcible(false) @Failure(false)', '@ByReference', undefined],
    ['xsmp-sdk', 'Flat', 'output', '@ByReference', readOnly],
    ['xsmp-sdk', 'Flat', 'output', '@ByReference @Const @ConstGetter', undefined],
    ['xsmp-sdk', 'Flat', '@Failure', '@ByReference', undefined],
    ['xsmp-sdk', 'Values', 'output', '@ByReference @Const', temporary],
    ['xsmp-sdk', 'Values', '@Mutable output', '@ByReference @Const @ConstGetter', temporary],
    ['xsmp-sdk', 'Pair', 'output', '@ByReference @Const', temporary],
    ['xsmp-sdk', 'Pair', 'output', '@ByReference', temporary],
    ['xsmp-sdk', 'Pair', '@Static output', '@ByReference', undefined],
    ['xsmp-sdk', 'Values', '', '@ByReference @Const', undefined],
    ['xsmp-sdk', 'Values', 'output', '@ByReference writeOnly', undefined],
    ['xsmp-sdk', 'Pair', 'output', '@ByReference(false)', undefined],
    ['tas-mdk', 'Int32', 'output', '@ByReference', tasTemporary],
    ['tas-mdk', 'Int32', 'output', '@ByReference @Const', tasTemporary],
    ['tas-mdk', 'Int32', 'input', '@ByReference @Const @ConstGetter', tasTemporary],
    ['tas-mdk', 'Values', 'output', '@ByReference @Const', tasTemporary],
    ['tas-mdk', 'Flat', 'output', '@ByReference @Const', tasTemporary],
    ['tas-mdk', 'Pair', '@Mutable input', '@ByReference @Const @ConstGetter', tasTemporary],
    ['tas-mdk', 'Int32', '@Static output', '@ByReference', undefined],
    ['tas-mdk', 'Pair', '', '@ByReference @Const', undefined],
    ['tas-mdk', 'Values', 'output', '@ByReference writeOnly', undefined],
    ['tas-mdk', 'Int32', 'output', '@ByReference(false)', undefined],
    ['', 'Values', 'output', '@ByReference @Const', undefined],
    ['esa-cdk', 'Values', 'output', '@ByReference @Const', undefined],
] as const)('checks attached references for %s: %s %s / %s', async (profile, type, field, property, issue) => {
    const document = await validate(profile, type, field, property);
    const errors = document.diagnostics?.filter(diagnostic => diagnostic.severity === 1) ?? [];
    expect(errors.map(diagnostic => diagnostic.message)).toEqual(issue ? [issue] : []);
    if (issue) expect(document.textDocument.getText(errors[0].range)).toMatch(/^(out|inp|fea)_storage$/);
});

test.each(['xsmp-sdk', 'tas-mdk'])('terminates on invalid cyclic array types with %s', async profile => {
    const document = await validate(profile, 'Cycle', '', '@ByReference @Const',
        '/** @uuid 86000000-0000-4000-8000-000000000606 */ public array Cycle = Cycle[1]');
    const errors = document.diagnostics?.filter(diagnostic => diagnostic.severity === 1).map(diagnostic => diagnostic.message) ?? [];
    expect(errors).toContain('Recursive Array Type.');
    expect(errors.some(message => message.includes('validation'))).toBe(false);
});

test.each(['xsmp-sdk', 'tas-mdk'])('handles missing and unresolved field types during editing with %s', async profile => {
    for (const type of [null, 'UnknownType']) {
        const document = await validate(profile, type, 'output', '@ByReference');
        const errors = document.diagnostics?.filter(diagnostic => diagnostic.severity === 1) ?? [];
        expect(errors.length).toBeGreaterThan(0);
        expect(errors.some(diagnostic => /validation|field wrapper/.test(diagnostic.message))).toBe(false);
        if (type === null) expect(document.parseResult.parserErrors.length).toBeGreaterThan(0);
        await clearDocuments(services.shared, documents.splice(0));
    }
});
