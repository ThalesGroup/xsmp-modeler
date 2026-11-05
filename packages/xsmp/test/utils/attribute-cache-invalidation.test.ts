import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { AstUtils, Cancellation, DocumentState, OperationCancelled, type LangiumDocument, URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast-partial';
import { AttributeHelper } from '@xsmp/core/utils';

let directory: string;

beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-attribute-cache-'));
});

afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
});

class CountingAttributeHelper extends AttributeHelper {
    evaluations = 0;
    override isAttributeTrue(attribute: ast.Attribute | undefined): boolean | undefined {
        this.evaluations++;
        return super.isAttributeTrue(attribute);
    }
}

describe('Attribute cache invalidation', () => {
    test('refreshes external attribute values and diagnostics while retaining unrelated cache entries', async () => {
        const initial = `catalogue Flags namespace config {
            /** @uuid 11111111-1111-4111-8111-111111111111 */
            public struct Flags { constant Bool Enabled = false }
        }`;
        write('app/xsmp.project', "project 'app' using 'ECSS_SMP_2025' source 'src'");
        write('app/src/flags.xsmpcat', initial);
        write('app/src/consumer.xsmpcat', `catalogue Consumer namespace app {
            /** @uuid 22222222-2222-4222-8222-222222222222 */
            public model Consumer {
                @Static(config.Flags.Enabled) field Int32 counter
                def void compute(@ByPointer(config.Flags.Enabled) in Int32 value = 7)
            }
        }`);
        write('other/xsmp.project', "project 'other' using 'ECSS_SMP_2025' source 'src'");
        write('other/src/other.xsmpcat', `catalogue Other namespace other {
            /** @uuid 33333333-3333-4333-8333-333333333333 */
            public struct Other { field Int32 value }
        }`);
        const services = await loadWorkspace();
        const consumer = document(services, 'app/src/consumer.xsmpcat');
        const consumerAst = consumer.parseResult.value;
        const parameter = AstUtils.streamAllContents(consumerAst).find(ast.isParameter)!;
        const field = AstUtils.streamAllContents(consumerAst).find(ast.isField)!;
        const helper = services.shared.AttributeHelper;
        expect(helper.isStatic(field)).toBe(false);
        expect(helper.isByPointer(parameter)).toBe(false);
        expect(errors(consumer)).toEqual([]);

        const unrelated = AstUtils.streamAllContents(document(services, 'other/src/other.xsmpcat').parseResult.value).find(ast.isField)!;
        const counting = new CountingAttributeHelper(services.shared);
        counting.isMutable(unrelated);
        counting.isMutable(unrelated);
        expect(counting.evaluations).toBe(1);

        write('app/src/flags.xsmpcat', initial.replace('= false', '= true'));
        await services.shared.workspace.DocumentBuilder.update([uri('app/src/flags.xsmpcat')], []);
        expect(consumer.parseResult.value).toBe(consumerAst);
        expect(helper.isStatic(field)).toBe(true);
        expect(helper.isByPointer(parameter)).toBe(true);
        expect(errors(consumer)).toContain('A pointer parameter default shall be nullptr.');
        const fresh = await loadWorkspace();
        expect(errors(consumer)).toEqual(errors(document(fresh, 'app/src/consumer.xsmpcat')));
        counting.isMutable(unrelated);
        expect(counting.evaluations).toBe(1);

        const cancellation = new Cancellation.CancellationTokenSource();
        const builder = services.shared.workspace.DocumentBuilder;
        const cancelAfterIndexing = builder.onBuildPhase(DocumentState.IndexedContent, () => cancellation.cancel());
        write('app/src/flags.xsmpcat', initial);
        await expect(builder.update([uri('app/src/flags.xsmpcat')], [], cancellation.token)).rejects.toBe(OperationCancelled);
        cancelAfterIndexing.dispose();
        expect(consumer.state).toBe(DocumentState.ComputedScopes);
        // Resume without listing the consumer as changed: its retained AST cache must already be empty.
        await builder.update([], []);
        expect(helper.isStatic(field)).toBe(false);
        expect(helper.isByPointer(parameter)).toBe(false);
        expect(errors(consumer)).toEqual([]);
    }, 15000);

    test('refreshes implicit passing modes when the referenced type changes', async () => {
        const initial = `catalogue Types namespace types {
            /** @uuid 44444444-4444-4444-8444-444444444444 */
            public struct Item {}
        }`;
        write('app/xsmp.project', "project 'app' using 'ECSS_SMP_2025' source 'src'");
        write('app/src/types.xsmpcat', initial);
        write('app/src/consumer.xsmpcat', `catalogue Consumer namespace app {
            /** @uuid 55555555-5555-4555-8555-555555555555 */
            public model Consumer { def void compute(in types.Item value) }
        }`);
        const services = await loadWorkspace();
        const consumer = document(services, 'app/src/consumer.xsmpcat');
        const consumerAst = consumer.parseResult.value;
        const parameter = AstUtils.streamAllContents(consumerAst).find(ast.isParameter)!;
        const oldType = parameter.type?.ref;
        const helper = services.shared.AttributeHelper;
        expect(helper.isConst(parameter)).toBe(false);
        expect(helper.isByReference(parameter)).toBe(false);

        write('app/src/types.xsmpcat', initial.replace('struct Item', 'interface Item'));
        await services.shared.workspace.DocumentBuilder.update([uri('app/src/types.xsmpcat')], []);
        expect(consumer.parseResult.value).toBe(consumerAst);
        expect(parameter.type?.ref).not.toBe(oldType);
        expect(helper.isConst(parameter)).toBe(true);
        expect(helper.isByReference(parameter)).toBe(true);
        expect(errors(consumer)).toEqual([]);
        const fresh = await loadWorkspace();
        const freshParameter = AstUtils.streamAllContents(document(fresh, 'app/src/consumer.xsmpcat').parseResult.value).find(ast.isParameter)!;
        expect(helper.isConst(parameter)).toBe(fresh.shared.AttributeHelper.isConst(freshParameter));
        expect(helper.isByReference(parameter)).toBe(fresh.shared.AttributeHelper.isByReference(freshParameter));
    });
});

function uri(name: string): URI {
    return URI.file(path.join(directory, name));
}

function write(name: string, text: string): void {
    const file = uri(name).fsPath;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, text);
}

async function loadWorkspace() {
    const services = createXsmpServices(NodeFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([{ name: 'test', uri: URI.file(directory).toString() }]);
    await services.shared.workspace.DocumentBuilder.build(services.shared.workspace.LangiumDocuments.all.toArray(), { validation: true });
    for (const doc of services.shared.workspace.LangiumDocuments.all) {
        expect(doc.parseResult.parserErrors).toEqual([]);
    }
    return services;
}

function document(services: Awaited<ReturnType<typeof loadWorkspace>>, name: string): LangiumDocument {
    return services.shared.workspace.LangiumDocuments.getDocument(uri(name))!;
}

function errors(document: LangiumDocument): string[] {
    return (document.diagnostics ?? []).filter(diagnostic => diagnostic.severity === 1).map(diagnostic => diagnostic.message).sort();
}
