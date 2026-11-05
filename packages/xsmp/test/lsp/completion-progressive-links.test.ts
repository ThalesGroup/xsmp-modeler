import { afterEach, describe, expect, test, vi } from 'vitest';
import { Cancellation, EmptyFileSystem, OperationCancelled, URI, setInterruptionPeriod } from 'langium';
import { InsertTextFormat } from 'vscode-languageserver';
import { createXsmpServices } from '@xsmp/core';

type Language = 'xsmpasb' | 'xsmplnk' | 'xsmpsed';

afterEach(() => {
    vi.restoreAllMocks();
    setInterruptionPeriod(10);
});

describe('Progressive link completion', () => {
    test.each(['xsmpasb', 'xsmplnk', 'xsmpsed'] as const)('%s offers all endpoints with linear completion work', async language => {
        const results = [];
        for (const count of [10, 100]) {
            const fixture = await createFixture(language, '@@', count);
            const provider = fixture.provider as unknown as { createContextualValueItem: (...args: never[]) => unknown };
            const contextualItems = vi.spyOn(provider, 'createContextualValueItem');
            const completion = await fixture.complete();
            const items = completion.items;
            const snippet = items.find(item => item.label === (language === 'xsmpsed' ? 'Field Transfer' : 'Field Link'));
            expect(snippet?.insertTextFormat).toBe(InsertTextFormat.Snippet);
            const sourceChoices = getChoices(snippet!.insertText!, 1);
            const targetChoices = getChoices(snippet!.insertText!, 2);
            const copies = language === 'xsmplnk' ? 2 : 1;
            expect(sourceChoices).toHaveLength(count * copies);
            expect(targetChoices).toHaveLength(count * copies);
            for (let index = 0; index < count; index++) {
                expect(sourceChoices).toContain(`out${index}`);
                expect(targetChoices).toContain(`in${index}`);
                if (language === 'xsmplnk') {
                    expect(sourceChoices).toContain(`Child.out${index}`);
                    expect(targetChoices).toContain(`Child.in${index}`);
                }
            }
            expect(items.some(item => /^(?:field link|event link|transfer) /.test(item.label))).toBe(false);
            if (language !== 'xsmpsed') {
                const event = items.find(item => item.label === 'Event Link')!;
                expect(getChoices(event.insertText!, 1)).toHaveLength(count * copies);
                expect(getChoices(event.insertText!, 2)).toHaveLength(count * copies);
            }
            results.push({ bytes: JSON.stringify(completion).length, constructions: contextualItems.mock.calls.length });
        }
        expect(results[1].bytes).toBeLessThan(results[0].bytes * 12);
        expect(results[1].constructions).toBeLessThanOrEqual(results[0].constructions * 10 + 10);
    });

    test.each(['xsmpasb', 'xsmplnk', 'xsmpsed'] as const)('%s inserts a valid combination of independent choices', async language => {
        const fixture = await createFixture(language, '@@');
        const completion = await fixture.complete();
        const labels = language === 'xsmpsed' ? ['Field Transfer'] : ['Field Link', 'Event Link'];
        for (const label of labels) {
            const snippet = completion.items.find(item => item.label === label)!.insertText!;
            const source = getChoices(snippet, 1)[1];
            const targets = getChoices(snippet, 2);
            const target = targets[targets.length - 1];
            const selected = snippet.replace(/\$\{1\|[^|]*\|\}/, source).replace(/\$\{2\|[^|]*\|\}/, target);
            const completed = await createFixture(language, selected);
            expect(completed.document.parseResult.parserErrors).toEqual([]);
            expect(completed.document.references.flatMap(reference => reference.error ? [reference.error.message] : [])).toEqual([]);
        }
    });

    test.each(['xsmpasb', 'xsmplnk', 'xsmpsed'] as const)('%s leaves editable placeholders when no endpoints are available', async language => {
        const fixture = await createFixture(language, '@@', 0);
        const completion = await fixture.complete();
        const label = language === 'xsmpsed' ? 'Field Transfer' : 'Field Link';
        const snippet = completion.items.find(item => item.label === label)!.insertText!;
        expect(snippet).toBe(language === 'xsmpsed' ? 'transfer ${1:output} -> ${2:input}' : 'field link ${1:owner} -> ${2:client}');
    });

    test.each(['outputField', 'inputField'] as const)('keeps the other choices when no %s exists', async missing => {
        const fixture = await createFixture('xsmplnk', '@@');
        const resolver = fixture.services.shared.InstancePathResolver;
        const getMembers = resolver.getComponentMembersByKind.bind(resolver);
        vi.spyOn(resolver, 'getComponentMembersByKind').mockImplementation((component, kinds) =>
            kinds.includes(missing) ? [] : getMembers(component, kinds)
        );
        const snippet = (await fixture.complete()).items.find(item => item.label === 'Field Link')!.insertText!;
        expect(snippet).toContain(missing === 'outputField' ? '${1:owner}' : '${2:client}');
        expect(getChoices(snippet, missing === 'outputField' ? 2 : 1)).toHaveLength(6);
    });

    test.each(['xsmpasb', 'xsmplnk', 'xsmpsed'] as const)('%s keeps array fields selectable and accepts indexed endpoints', async language => {
        const fixture = await createFixture(language, '@@', 0, true);
        const completion = await fixture.complete();
        const label = language === 'xsmpsed' ? 'Field Transfer' : 'Field Link';
        const snippet = completion.items.find(item => item.label === label)!.insertText!;
        expect(getChoices(snippet, 1)).toContain('outArray');
        expect(getChoices(snippet, 2)).toContain('inArray');
        const keyword = language === 'xsmpsed' ? 'transfer' : 'field link';
        const target = language === 'xsmplnk' ? 'Child.inArray[0]' : 'inArray[0]';
        const completed = await createFixture(language, `${keyword} outArray[1] -> ${target}`, 0, true);
        expect(completed.document.parseResult.parserErrors).toEqual([]);
        expect(completed.document.references.flatMap(reference => reference.error ? [reference.error.message] : [])).toEqual([]);
    });

    test('escapes choices while preserving child paths and index notation', async () => {
        const fixture = await createFixture('xsmplnk', '@@');
        const resolver = fixture.services.shared.InstancePathResolver;
        const getChildren = resolver.getAssemblyChildComponentPathContexts.bind(resolver);
        vi.spyOn(resolver, 'getAssemblyChildComponentPathContexts').mockImplementation(context =>
            getChildren(context).map(child => ({ ...child, path: 'Child[0],branch|tail\\' }))
        );
        const snippet = (await fixture.complete()).items.find(item => item.label === 'Field Link')!.insertText!;
        expect(snippet).toContain(String.raw`Child[0]\,branch\|tail\\.out0`);
        expect(snippet).toContain(String.raw`Child[0]\,branch\|tail\\.in0`);
    });

    test('cancels while collecting choices without returning a partial snippet', async () => {
        const fixture = await createFixture('xsmplnk', '@@', 100);
        const cancellation = new Cancellation.CancellationTokenSource();
        const resolver = fixture.services.shared.InstancePathResolver;
        const getMembers = resolver.getComponentMembersByKind.bind(resolver);
        let timer: ReturnType<typeof setTimeout> | undefined;
        vi.spyOn(resolver, 'getComponentMembersByKind').mockImplementation((component, kinds) => {
            if (kinds.includes('outputField')) {
                timer ??= setTimeout(() => cancellation.cancel(), 0);
            }
            return getMembers(component, kinds);
        });
        setInterruptionPeriod(0);
        try {
            await expect(fixture.complete(cancellation.token)).rejects.toBe(OperationCancelled);
        } finally {
            clearTimeout(timer);
        }
    });
});

function getChoices(snippet: string, index: number): string[] {
    const match = snippet.match(new RegExp(`\\$\\{${index}\\|([^|]*)\\|\\}`));
    expect(match).not.toBeNull();
    return match![1].split(',');
}

async function createFixture(language: Language, line: string, count = 3, arrayFields = false) {
    const services = createXsmpServices(EmptyFileSystem);
    const factory = services.shared.workspace.LangiumDocumentFactory;
    const documents = services.shared.workspace.LangiumDocuments;
    const create = (text: string, name: string) => {
        const document = factory.fromString(text, URI.parse(`memory:///progressive-links/${name}`));
        documents.addDocument(document);
        return document;
    };
    create("project 'Completion' using 'ECSS_SMP_2025'\nsource '.'", 'xsmp.project');
    const members = Array.from({ length: count }, (_, index) => `
        input field Smp.Int32 in${index}
        output field Smp.Int32 out${index}
        eventsink Bench.Tick sink${index}
        eventsource Bench.Tick source${index}
    `).join('\n') + (arrayFields ? 'input field Bench.Values inArray output field Bench.Values outArray' : '');
    const catalogue = create(`catalogue Types
        namespace Smp { public primitive Int32 }
        namespace Bench {
            public event Tick
            public array Values = Smp.Int32[2]
            public model Child { ${members} }
            public model Root { ${members} container Bench.Child child }
        }
    `, 'types.xsmpcat');
    const assembly = 'assembly Assembly\nRoot: Bench.Root {\n child += Child: Bench.Child\n';
    if (language !== 'xsmpasb') {
        create(`${assembly}}`, 'assembly.xsmpasb');
    }
    const source = language === 'xsmpasb' ? `${assembly}    ${line}\n}`
        : language === 'xsmplnk' ? `link Wiring for Assembly\n/\n{\n    ${line}\n}`
        : `schedule Schedule\ntask Main on Assembly\n{\n    ${line}\n}`;
    const offset = source.indexOf('@@');
    const document = create(source.replace('@@', ''), `target.${language}`);
    await services.shared.workspace.DocumentBuilder.build(documents.all.toArray(), { validation: false });
    expect(catalogue.parseResult.parserErrors).toEqual([]);
    expect(catalogue.references.flatMap(reference => reference.error ? [reference.error.message] : [])).toEqual([]);
    const provider = services[language].lsp.CompletionProvider!;
    const complete = async (token?: Cancellation.CancellationToken) => {
        const completion = await provider.getCompletion(document, {
            textDocument: { uri: document.uri.toString() },
            position: document.textDocument.positionAt(offset),
        }, token);
        if (!completion) {
            throw new Error('Missing completion result.');
        }
        return completion;
    };
    return { services, document, provider, complete };
}
