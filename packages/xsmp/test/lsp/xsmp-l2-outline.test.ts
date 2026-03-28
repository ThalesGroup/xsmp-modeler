import { EmptyFileSystem } from 'langium';
import { expectSymbols } from 'langium/test';
import { describe, expect, test } from 'vitest';
import { SymbolKind, SymbolTag, type DocumentSymbol } from 'vscode-languageserver';
import { createXsmpServices } from 'xsmp';

const services = createXsmpServices(EmptyFileSystem);
const expectCatalogueSymbols = expectSymbols(services.xsmpcat);
const expectAssemblySymbols = expectSymbols(services.xsmpasb);
const expectConfigurationSymbols = expectSymbols(services.xsmpcfg);
const expectLinkBaseSymbols = expectSymbols(services.xsmplnk);
const expectScheduleSymbols = expectSymbols(services.xsmpsed);

describe('L2 Outlines', () => {
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
