import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { AstUtils, Cancellation, Deferred, DocumentState, EmptyFileSystem, URI } from 'langium';
import { createServerRequestHandler, WorkspaceState } from 'langium/lsp';
import { NodeFileSystem } from 'langium/node';
import { expectSymbols } from 'langium/test';
import { describe, expect, test } from 'vitest';
import { SymbolKind, SymbolTag, type DocumentSymbol, type DocumentSymbolParams } from 'vscode-languageserver';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast-partial';

const services = createXsmpServices(EmptyFileSystem);
const expectCatalogueSymbols = expectSymbols(services.xsmpcat);
const expectAssemblySymbols = expectSymbols(services.xsmpasb);
const expectConfigurationSymbols = expectSymbols(services.xsmpcfg);
const expectLinkBaseSymbols = expectSymbols(services.xsmplnk);
const expectScheduleSymbols = expectSymbols(services.xsmpsed);

describe('XSMP Outlines', () => {
    test('an outline request completes before a queued workspace write', async () => {
        const localServices = createXsmpServices(EmptyFileSystem);
        const { shared } = localServices;
        await shared.workspace.WorkspaceManager.initializeWorkspace([]);
        const document = shared.workspace.LangiumDocumentFactory.fromString('catalogue Demo', URI.parse('test:///outline.xsmpcat'));
        shared.workspace.LangiumDocuments.addDocument(document);
        await shared.workspace.DocumentBuilder.build([document]);

        const order: string[] = [];
        let update: Promise<void> | undefined;
        const handler = createServerRequestHandler<DocumentSymbolParams, DocumentSymbol[], never>(
            async (language, requestedDocument, params, token) => {
                // A change arrives while Langium holds the request's read lock.
                update = shared.workspace.WorkspaceLock.write(() => { order.push('write'); });
                const symbols = await language.lsp.DocumentSymbolProvider!.getSymbols(requestedDocument, params, token);
                order.push('outline');
                return symbols;
            },
            shared,
            WorkspaceState.Linked,
        );

        const symbols = await handler({ textDocument: { uri: document.uri.toString() } }, Cancellation.CancellationToken.None);
        await update;
        expect(symbols).toEqual([expect.objectContaining({ name: 'Demo' })]);
        expect(order).toEqual(['outline', 'write']);
    });

    test('outline signatures wait for linked attributes during an edit', async () => {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xsmp-outline-'));
        const resumed = new Deferred<void>();
        let update: Promise<void> | undefined;
        try {
            await fs.writeFile(path.join(directory, 'xsmp.project'), "project 'demo' using 'ECSS_SMP_2025' source '.'");
            const uri = URI.file(path.join(directory, 'demo.xsmpcat'));
            const text = 'catalogue Demo namespace demo { public struct Flags { constant Bool Enabled = true } public model M { def void op(in Int32 value) } }';
            await fs.writeFile(uri.fsPath, text);
            const { shared } = createXsmpServices(NodeFileSystem);
            await shared.workspace.WorkspaceManager.initializeWorkspace([{ name: 'demo', uri: URI.file(directory).toString() }]);
            const builder = shared.workspace.DocumentBuilder;
            const document = shared.workspace.LangiumDocuments.getDocument(uri)!;
            const paused = new Deferred<void>();
            const listener = builder.onBuildPhase(DocumentState.Parsed, async documents => {
                if (documents.includes(document)) {
                    listener.dispose();
                    paused.resolve();
                    await resumed.promise;
                }
            });
            await fs.writeFile(uri.fsPath, text.replace('in Int32', '@Const(demo.Flags.Enabled) @ByPointer(demo.Flags.Enabled) in Int32'));
            update = shared.workspace.WorkspaceLock.write(token => builder.update([uri], [], token));
            await paused.promise;

            let readState: DocumentState | undefined;
            const handler = createServerRequestHandler<DocumentSymbolParams, DocumentSymbol[], never>(
                (language, requestedDocument, params, token) => {
                    readState = requestedDocument.state;
                    return language.lsp.DocumentSymbolProvider!.getSymbols(requestedDocument, params, token);
                },
                shared,
                WorkspaceState.Linked,
            );
            const request = handler({ textDocument: { uri: uri.toString() } }, Cancellation.CancellationToken.None);
            // Let the real request handler reach its state wait before resuming the build.
            await new Promise<void>(resolve => setImmediate(resolve));
            resumed.resolve();
            const symbols = await request;
            await update;

            expect(readState).toBeGreaterThanOrEqual(DocumentState.Linked);
            expect(JSON.stringify(symbols)).toContain('op(const Smp.Int32*)');
            const parameter = AstUtils.streamAllContents(document.parseResult.value).find(ast.isParameter)!;
            expect(shared.AttributeHelper.isConst(parameter)).toBe(true);
            expect(shared.AttributeHelper.isByPointer(parameter)).toBe(true);
        } finally {
            resumed.resolve();
            await update;
            await fs.rm(directory, { recursive: true, force: true });
        }
    });

    test('Catalogue outline exposes details and deprecated markers for core named elements', async () => {
        await expectCatalogueSymbols({
            text: `
                catalogue Demo
                namespace demo
                {
                    public interface ILogger
                    {
                    }

                    /**
                     * Legacy implementation.
                     * @deprecated Use Sensor instead.
                     */
                    public model Legacy
                    {
                    }

                    public model Root
                    {
                        container demo.Legacy* sensors
                        reference demo.ILogger? logger
                    }
                }
            `,
            parseOptions: { documentUri: 'test.xsmpcat' },
            assert: (symbols) => {
                const legacy = findSymbol(symbols, 'Legacy');
                const sensors = findSymbol(symbols, 'sensors');
                const logger = findSymbol(symbols, 'logger');

                expect(legacy?.tags).toEqual([SymbolTag.Deprecated]);
                expect(sensors?.detail).toBe('demo.Legacy*');
                expect(logger?.detail).toBe('demo.ILogger?');
            }
        });
    });

    test('Assembly outline exposes configurations and nested instances', async () => {
        await expectAssemblySymbols({
            text: `
                assembly Demo
                configure child/path
                {
                    subscribe Start -> "Boot"
                }
                Root: "Impl"
                {
                    child += Child: "ChildImpl"
                    {
                        field link src.out -> dst.in
                    }
                }
            `,
            parseOptions: { documentUri: 'test.xsmpasb' },
            assert: (symbols) => {
                expect(renderSymbols(symbols)).toEqual([
                    'Package Demo',
                    '  Object configure child/path',
                    '    Event subscribe Start -> "Boot"',
                    '  Object Root',
                    '    Object child += Child',
                    '      Field field link src.out -> dst.in'
                ]);
            }
        });
    });

    test('Link base outline exposes nested component link bases and links', async () => {
        await expectLinkBaseSymbols({
            text: `
                link Demo
                /Root
                {
                    event link a -> b
                    child
                    {
                        field link local.out -> local.in
                    }
                }
            `,
            parseOptions: { documentUri: 'test.xsmplnk' },
            assert: (symbols) => {
                expect(renderSymbols(symbols)).toEqual([
                    'Package Demo',
                    '  Object /Root',
                    '    Event event link a -> b',
                    '    Object child',
                    '      Field field link local.out -> local.in'
                ]);
            }
        });
    });

    test('Schedule outline exposes activities and events', async () => {
        await expectScheduleSymbols({
            text: `
                schedule Demo
                task Main
                {
                    call op(a=1i32, b=2i32)
                    execute Other at child
                    async emit "Tick"
                }
                task Other
                {
                }
                event Main mission "PT1S"
                event Main on "Boot" until "Stop"
            `,
            parseOptions: { documentUri: 'test.xsmpsed' },
            assert: (symbols) => {
                expect(renderSymbols(symbols)).toEqual([
                    'Package Demo',
                    '  Method Main',
                    '    Method call op(a, b)',
                    '    Method execute Other at child',
                    '    Event async emit "Tick"',
                    '  Method Other',
                    '  Event event Main mission "PT1S"',
                    '  Event event Main on "Boot" until "Stop"'
                ]);
            }
        });
    });

    test('Configuration outline exposes component configurations and values', async () => {
        await expectConfigurationSymbols({
            text: `
                configuration Demo
                /local: pkg.Comp
                {
                    include Other at child
                    state = 1i32
                    child
                    {
                        value = 2i32
                    }
                }
            `,
            parseOptions: { documentUri: 'test.xsmpcfg' },
            assert: (symbols) => {
                expect(renderSymbols(symbols)).toEqual([
                    'Package Demo',
                    '  Object /local: pkg.Comp',
                    '    Module include Other at child',
                    '    Field state',
                    '    Object child',
                    '      Field value'
                ]);
            }
        });
    });
});

function renderSymbols(symbols: DocumentSymbol[], indent = 0): string[] {
    return symbols.flatMap(symbol => [
        `${'  '.repeat(indent)}${kindToString(symbol.kind)} ${symbol.name}`,
        ...renderSymbols(symbol.children ?? [], indent + 1)
    ]);
}

function kindToString(kind: SymbolKind): string {
    switch (kind) {
        case SymbolKind.Package: return 'Package';
        case SymbolKind.Object: return 'Object';
        case SymbolKind.Event: return 'Event';
        case SymbolKind.Method: return 'Method';
        case SymbolKind.Field: return 'Field';
        case SymbolKind.Module: return 'Module';
        default: return `Kind(${kind})`;
    }
}

function findSymbol(symbols: DocumentSymbol[], name: string): DocumentSymbol | undefined {
    for (const symbol of symbols) {
        if (symbol.name === name) {
            return symbol;
        }
        const nested = findSymbol(symbol.children ?? [], name);
        if (nested) {
            return nested;
        }
    }
    return undefined;
}
