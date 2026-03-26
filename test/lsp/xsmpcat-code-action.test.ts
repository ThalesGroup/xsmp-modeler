import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { clearDocuments, parseHelper } from 'langium/test';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { CodeActionKind, type CodeAction } from 'vscode-languageserver';
import type { CodeActionParams } from 'vscode-languageserver-protocol';
import { createXsmpServices } from '../../src/language/xsmp-module.js';
import { type Catalogue } from '../../src/language/generated/ast-partial.js';

let services: ReturnType<typeof createXsmpServices>;
let parseCatalogue: ReturnType<typeof parseHelper<Catalogue>>;
let document: LangiumDocument<Catalogue> | undefined;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    const doParseCatalogue = parseHelper<Catalogue>(services.xsmpcat);
    parseCatalogue = (input, options) => doParseCatalogue(input, { validation: true, ...options });

    await services.shared.workspace.WorkspaceManager.initializeWorkspace([]);
});

afterEach(async () => {
    if (document) {
        await clearDocuments(services.shared, [document]);
        document = undefined;
    }
});

describe('Xsmpcat code actions', () => {
    test('does not offer UUID quick fixes for duplicated type names', async () => {
        document = await parseCatalogue(`catalogue Demo

namespace demo
{
    /** @uuid 11111111-1111-1111-1111-111111111111 */
    public struct Value
    {
    }

    /** @uuid 22222222-2222-2222-2222-222222222222 */
    public struct Value
    {
    }
}
`);

        const duplicateName = document.diagnostics?.find(diagnostic => diagnostic.message === 'Duplicated Type name.');
        expect(duplicateName).toBeDefined();

        const actions = await getCodeActions(document);
        expect(actions.some(action => action.title === 'Generate new UUID.')).toBe(false);
    });
});

async function getCodeActions(document: LangiumDocument<Catalogue>): Promise<CodeAction[]> {
    const diagnostics = document.diagnostics ?? [];
    const params: CodeActionParams = {
        textDocument: {
            uri: document.textDocument.uri
        },
        range: diagnostics[0]?.range ?? {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 0 }
        },
        context: {
            diagnostics,
            only: [CodeActionKind.QuickFix],
            triggerKind: 1
        }
    };
    return (await services.xsmpcat.lsp.CodeActionProvider?.getCodeActions(document, params) ?? []) as CodeAction[];
}
