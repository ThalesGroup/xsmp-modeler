import { describe, expect, test } from 'vitest';
import { AstUtils, DocumentState, EmptyFileSystem } from 'langium';
import { parseHelper } from 'langium/test';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast-partial';

async function build(source: string) {
    const services = createXsmpServices(EmptyFileSystem);
    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
    const document = await parseHelper<ast.Catalogue>(services.xsmpcat)(source);
    expect(document.parseResult.parserErrors).toEqual([]);
    await services.shared.workspace.DocumentBuilder.build([document], { validation: true });
    expect(document.diagnostics?.filter(d => d.severity === 1)).toEqual([]);
    return { services, document };
}

describe('Scopes across inherited diamonds', () => {
    test('enumerates a shared ancestor once and completes a valid deep diamond', async () => {
        let id = 0;
        const uuid = () => `/** @uuid 8bd4e6fd-aab3-4f37-8cac-${String(++id).padStart(12, '0')} */`;
        const declarations = [`${uuid()} public interface I0 { constant Int32 Root = 1 }`];
        for (let level = 1; level <= 12; level++) {
            const bases = level === 1 ? 'I0' : `I${level - 1}A, I${level - 1}B`;
            declarations.push(`${uuid()} public interface I${level}A extends ${bases} {}`);
            declarations.push(`${uuid()} public interface I${level}B extends ${bases} {}`);
        }
        declarations.push(`${uuid()} public interface Consumer extends I12A, I12B { constant Int32 Result = Root }`);
        const source = `catalogue Diamond namespace diamond { ${declarations.join('\n')} }`;
        const { services, document } = await build(source);
        const reference = AstUtils.streamAllContents(document.parseResult.value).find(ast.isNamedElementReference)!;
        const scope = services.xsmpcat.references.ScopeProvider.getScope({ container: reference, property: ast.NamedElementReference.value, reference: reference.value! });
        for (const elements of [scope.getElements('Root'), scope.getAllElements().filter(d => d.name === 'Root')]) {
            expect(elements.isEmpty()).toBe(false);
            expect(elements.toArray()).toHaveLength(1);
            expect(elements.toArray()).toHaveLength(1);
        }
        const offset = source.indexOf('Result = Root') + 'Result = Root'.length;
        const completion = await services.xsmpcat.lsp.CompletionProvider!.getCompletion(document, {
            textDocument: { uri: document.uri.toString() }, position: document.textDocument.positionAt(offset),
        });
        expect(completion?.items.some(item => item.label === 'Root')).toBe(true);
    });

    test('preserves branch and local shadowing during repeated and reentrant resolution', async () => {
        const { services, document } = await build(`catalogue Priority namespace priority {
            /** @uuid fbe9a5c2-5afd-4575-bb90-000000000001 */ public interface Base { constant Int32 Pick = 1 }
            /** @uuid fbe9a5c2-5afd-4575-bb90-000000000002 */ public interface Left extends Base { constant Int32 Pick = 2 }
            /** @uuid fbe9a5c2-5afd-4575-bb90-000000000003 */ public interface Right extends Base { constant Int32 Pick = 3 }
            /** @uuid fbe9a5c2-5afd-4575-bb90-000000000004 */ public interface First extends Left, Right { constant Int32 Result = Pick }
            /** @uuid fbe9a5c2-5afd-4575-bb90-000000000005 */ public interface Second extends Right, Left { constant Int32 Result = Pick }
            /** @uuid fbe9a5c2-5afd-4575-bb90-000000000006 */ public interface Local extends Left, Right { constant Int32 Pick = 4 constant Int32 Result = Pick }
        }`);
        const references = AstUtils.streamAllContents(document.parseResult.value).filter(ast.isNamedElementReference).toArray();
        const expected = ['Left', 'Right', 'Local'];
        for (let round = 0; round < 2; round++) {
            // Resolving Result must now resolve the base references reentrantly too.
            services.shared.workspace.DocumentBuilder.resetToState(document, DocumentState.ComputedScopes);
            for (const [index, reference] of references.entries()) {
                const scope = services.xsmpcat.references.ScopeProvider.getScope({ container: reference, property: ast.NamedElementReference.value, reference: reference.value! });
                expect((scope.getElement('Pick')?.node?.$container as ast.Interface)?.name).toBe(expected[index]);
                expect((reference.value!.ref!.$container as ast.Interface).name).toBe(expected[index]);
            }
        }
    });
});
