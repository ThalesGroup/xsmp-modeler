import { describe, expect, test, vi } from 'vitest';
import { AstUtils, EmptyFileSystem, URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { parseHelper } from 'langium/test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast-partial';
import { getValue, IntegralValue } from '@xsmp/core/utils';

describe('Constant evaluation lifetime', () => {
    test('evaluates a shared constant DAG without expanding every path', async () => {
        const services = createXsmpServices(EmptyFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
        const document = await parseHelper<ast.Catalogue>(services.xsmpcat)(`
            catalogue Dag namespace dag {
                /** @uuid 9212cd38-5874-447d-9727-226139768071 */ public interface Values {
                    constant Int32 C0 = 1
                    ${Array.from({ length: 16 }, (_, i) => `constant Int32 C${i + 1} = C${i} + C${i}`).join('\n')}
                }
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: false });
        const last = AstUtils.streamAllContents(document.parseResult.value).filter(ast.isConstant).toArray().at(-1)!;
        const additions = vi.spyOn(IntegralValue.prototype, 'add');
        try {
            expect(getValue(last.value)?.getValue()).toBe(65536n);
            expect(additions.mock.calls.length).toBeLessThanOrEqual(32);
        } finally {
            additions.mockRestore();
        }
    });

    test('keeps invalid initializers diagnosed and cyclic evaluations finite', async () => {
        const services = createXsmpServices(EmptyFileSystem);
        await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
        const document = await parseHelper<ast.Catalogue>(services.xsmpcat)(`
            catalogue Invalid namespace invalid {
                /** @uuid 9212cd38-5874-447d-9727-226139768072 */ public interface Values {
                    constant Int8 Invalid = 256
                    constant Int32 UsesInvalid = Invalid + Invalid
                    constant Int32 A = B
                    constant Int32 B = A
                }
            }
        `);
        await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
        expect(document.diagnostics?.filter(d => d.severity === 1).map(d => d.message))
            .toContain('Int32 cannot be converted to Smp.Int8.');
        const constants = AstUtils.streamAllContents(document.parseResult.value).filter(ast.isConstant).toArray();
        for (const constant of constants.slice(1)) {
            expect(getValue(constant.value)).toBeUndefined();
        }
    });

    test('does not keep cached values after a referenced document changes', async () => {
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-solver-cache-'));
        try {
            fs.writeFileSync(path.join(directory, 'xsmp.project'), "project 'cache'\nsource '.'");
            const sourcePath = path.join(directory, 'Source.xsmpcat');
            const source = `catalogue Source namespace cache {
                /** @uuid 9212cd38-5874-447d-9727-226139768073 */ public interface Source {
                    constant Int32 Value = 1
                }
            }`;
            fs.writeFileSync(sourcePath, source);
            const consumerUri = URI.file(path.join(directory, 'Consumer.xsmpcat'));
            fs.writeFileSync(consumerUri.fsPath, `catalogue Consumer namespace cache {
                /** @uuid 9212cd38-5874-447d-9727-226139768074 */ public interface Consumer {
                    constant Int32 Computed = cache.Source.Value + cache.Source.Value
                    constant Int32 Observed = Computed + Computed
                }
            }`);
            const services = createXsmpServices(NodeFileSystem);
            await services.shared.workspace.WorkspaceManager.initializeWorkspace([{ name: 'cache', uri: URI.file(directory).toString() }]);
            const document = services.shared.workspace.LangiumDocuments.getDocument(consumerUri)!;
            const observed = AstUtils.streamAllContents(document.parseResult.value).filter(ast.isConstant).toArray().at(-1)!;
            expect(getValue(observed.value)?.getValue()).toBe(4n);
            fs.writeFileSync(sourcePath, source.replace('Value = 1', 'Value = 2'));
            await services.shared.workspace.DocumentBuilder.update([URI.file(sourcePath)], []);
            expect(AstUtils.streamAllContents(document.parseResult.value).filter(ast.isConstant).toArray().at(-1)).toBe(observed);
            expect(getValue(observed.value)?.getValue()).toBe(8n);
        } finally {
            fs.rmSync(directory, { recursive: true, force: true });
        }
    });
});
