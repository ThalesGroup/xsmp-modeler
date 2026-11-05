import { afterEach, describe, expect, test, vi } from 'vitest';
import { Cancellation, EmptyFileSystem, OperationCancelled, URI, setInterruptionPeriod, type AstNodeDescription } from 'langium';
import { createXsmpServices } from '@xsmp/core';
import { isType } from '@xsmp/core/ast-partial';
import { applyCompletion } from './completion-test-utils.js';

afterEach(() => {
    vi.restoreAllMocks();
    setInterruptionPeriod(10);
});

describe('Completion request work', () => {
    test('builds parser contexts once and reuses reference items within the request', async () => {
        const fixture = await createFixture(20);
        const provider = fixture.provider as unknown as {
            buildContexts: (...args: never[]) => unknown;
            createReferenceCompletionItem: (description: AstNodeDescription) => unknown;
        };
        const contexts = vi.spyOn(provider, 'buildContexts');
        const parse = vi.spyOn(fixture.services.xsmpcat.parser.CompletionParser, 'parse');
        const references = vi.spyOn(provider, 'createReferenceCompletionItem');
        const completion = await fixture.complete('');

        expect(contexts).toHaveBeenCalledTimes(1);
        expect(parse.mock.calls.length).toBeGreaterThan(0);
        expect(parse.mock.calls.length).toBeLessThanOrEqual(3);
        expect(completion.items.map(item => item.label)).toEqual(expect.arrayContaining([
            'Int32', 'Smp.Int32', 'Type00000Value', 'Bench.Type00000Value', 'Type00019Value', 'Bench.Type00019Value',
        ]));
        expect(references.mock.calls.length).toBe(completion.items.length);

        const firstRequestCalls = references.mock.calls.length;
        await fixture.complete('');
        expect(contexts).toHaveBeenCalledTimes(2);
        expect(references.mock.calls.length).toBe(firstRequestCalls * 2);
    });

    test.each([false, true])('filters before building documentation and replaces the complete reference (qualified: %s)', async qualified => {
        const fixture = await createFixture(80, qualified);
        const documentation = vi.spyOn(fixture.services.xsmpcat.documentation.DocumentationProvider, 'getDocumentation');
        const label = `${qualified ? 'Bench.' : ''}Type00079Value`;
        const completion = await fixture.complete(label.slice(0, -4));

        expect(completion.items.map(item => item.label)).toEqual([label]);
        expect(documentation.mock.calls.filter(([node]) => isType(node))).toHaveLength(1);
        expect(completion.items[0].documentation).toEqual(expect.objectContaining({ value: expect.stringContaining('Documentation for Type00079Value') }));
        expect(applyCompletion(fixture.document.textDocument.getText(), completion.items[0])).toBe(fixture.document.textDocument.getText());
    });

    test('keeps fuzzy matching for abbreviated names', async () => {
        const fixture = await createFixture(20, false, 'T00019V');
        const completion = await fixture.complete('T00019V');
        expect(completion.items.map(item => item.label)).toContain('Type00019Value');
    });

    test('rejects an already cancelled request before parsing or creating items', async () => {
        const fixture = await createFixture(20);
        const parse = vi.spyOn(fixture.services.xsmpcat.parser.CompletionParser, 'parse');
        const documentation = vi.spyOn(fixture.services.xsmpcat.documentation.DocumentationProvider, 'getDocumentation');
        const cancellation = new Cancellation.CancellationTokenSource();
        cancellation.cancel();

        await expect(fixture.complete('', cancellation.token)).rejects.toBe(OperationCancelled);
        expect(parse).not.toHaveBeenCalled();
        expect(documentation).not.toHaveBeenCalled();
    });

    test('delivers cancellation during candidate enumeration and propagates it without logging an error', async () => {
        const fixture = await createFixture(100);
        const cancellation = new Cancellation.CancellationTokenSource();
        setInterruptionPeriod(0);
        const documentationProvider = fixture.services.xsmpcat.documentation.DocumentationProvider;
        const getDocumentation = documentationProvider.getDocumentation.bind(documentationProvider);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const documentation = vi.spyOn(documentationProvider, 'getDocumentation').mockImplementation(node => {
            timer ??= setTimeout(() => cancellation.cancel(), 0);
            return getDocumentation(node);
        });
        const errors = vi.spyOn(console, 'error');

        await expect(fixture.complete('', cancellation.token)).rejects.toBe(OperationCancelled);
        expect(documentation.mock.calls.length).toBeGreaterThan(0);
        expect(documentation.mock.calls.length).toBeLessThan(100);
        expect(errors).not.toHaveBeenCalled();
        clearTimeout(timer);

        const next = await fixture.complete('Type00099V');
        expect(next.items.map(item => item.label)).toEqual(['Type00099Value']);
    });

    test('isolates cancellation and results of concurrent requests', async () => {
        const fixture = await createFixture(20);
        const cancellation = new Cancellation.CancellationTokenSource();
        const documentationProvider = fixture.services.xsmpcat.documentation.DocumentationProvider;
        const getDocumentation = documentationProvider.getDocumentation.bind(documentationProvider);
        vi.spyOn(documentationProvider, 'getDocumentation').mockImplementation(node => {
            if ('name' in node && node.name === 'Type00000Value') {
                cancellation.cancel();
            }
            return getDocumentation(node);
        });

        const [cancelled, completed] = await Promise.allSettled([
            fixture.complete('', cancellation.token),
            fixture.complete('Type00019V'),
        ]);
        expect(cancelled).toEqual({ status: 'rejected', reason: OperationCancelled });
        expect(completed.status).toBe('fulfilled');
        if (completed.status === 'fulfilled') {
            expect(completed.value.items.map(item => item.label)).toEqual(['Type00019Value']);
        }
    });

    test('keeps UUID suggestions stable within a request and independent between concurrent requests', async () => {
        const fixture = await createFixture(0);
        const position = fixture.document.textDocument.positionAt(fixture.document.textDocument.getText().indexOf('namespace Bench {') + 'namespace Bench {\n'.length);
        const params = { textDocument: { uri: fixture.document.uri.toString() }, position };
        const [first, second] = await Promise.all([
            fixture.provider.getCompletion(fixture.document, params),
            fixture.provider.getCompletion(fixture.document, params),
        ]);
        const firstItems = first?.items.filter(item => item.label === 'Structure') ?? [];
        const secondItems = second?.items.filter(item => item.label === 'Structure') ?? [];
        expect(firstItems).toHaveLength(1);
        expect(secondItems).toHaveLength(1);
        expect(firstItems[0].insertText).not.toBe(secondItems[0].insertText);
    });
});

async function createFixture(count: number, qualified = false, partialType?: string) {
    const services = createXsmpServices(EmptyFileSystem);
    const factory = services.shared.workspace.LangiumDocumentFactory;
    const documents = services.shared.workspace.LangiumDocuments;
    const create = (text: string, name: string) => {
        const document = factory.fromString(text, URI.parse(`memory:///completion-work/${name}`));
        documents.addDocument(document);
        return document;
    };
    create("project 'Completion' using 'ECSS_SMP_2025'\nsource '.'", 'xsmp.project');
    const name = (index: number) => `Type${String(index).padStart(5, '0')}Value`;
    const definitions = Array.from({ length: count }, (_, index) => `
        /** Documentation for ${name(index)}. */
        public struct ${name(index)} { field Smp.Int32 number }
    `).join('\n');
    const targetType = partialType ?? (count === 0 ? 'Smp.Int32' : `${qualified ? 'Bench.' : ''}${name(count - 1)}`);
    const document = create(`catalogue Test
        namespace Smp { public primitive Int32 }
        namespace Bench {
            ${definitions}
            public model Target { field ${targetType} value }
        }
    `, 'types.xsmpcat');
    await services.shared.workspace.DocumentBuilder.build(documents.all.toArray(), { validation: false });
    expect(document.parseResult.parserErrors).toEqual([]);
    expect(document.references.flatMap(reference => reference.error ? [reference.error.message] : [])).toHaveLength(partialType ? 1 : 0);
    const provider = services.xsmpcat.lsp.CompletionProvider!;
    const offset = document.textDocument.getText().lastIndexOf('field ') + 'field '.length;
    const complete = async (prefix: string, token?: Cancellation.CancellationToken) => {
        const completion = await provider.getCompletion(document, {
            textDocument: { uri: document.uri.toString() },
            position: document.textDocument.positionAt(offset + prefix.length),
        }, token);
        if (!completion) {
            throw new Error('Missing completion result.');
        }
        return completion;
    };
    return { services, document, provider, complete };
}
