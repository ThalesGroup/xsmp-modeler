import { ValueConverter, type LangiumDocument } from 'langium';
import { DefaultRenameProvider } from 'langium/lsp';
import { ErrorCodes, ResponseError, type PrepareRenameResult, type Range, type RenameParams, type TextDocumentPositionParams, type WorkspaceEdit } from 'vscode-languageserver';

export class XsmpprojectRenameProvider extends DefaultRenameProvider {
    override async prepareRename(document: LangiumDocument, params: TextDocumentPositionParams): Promise<Range | undefined> {
        const range = await super.prepareRename(document, params);
        if (!range) return undefined;
        const result = {
            range,
            placeholder: ValueConverter.convertString(document.textDocument.getText(range)),
        } satisfies PrepareRenameResult;
        // Langium 4.4 types this as Range only, but LSP also supports a logical-name placeholder.
        return result as unknown as Range;
    }

    override async rename(document: LangiumDocument, params: RenameParams): Promise<WorkspaceEdit | undefined> {
        const name = params.newName;
        // The project STRING terminal has no escape syntax for its delimiter.
        if (name.includes('"') && name.includes("'")) {
            throw new ResponseError(ErrorCodes.InvalidParams, 'A project name cannot contain both single and double quotes.');
        }
        const quote = name.includes('"') ? "'" : '"';
        const newName = quote + name.replaceAll('\\', '\\\\') + quote;
        return super.rename(document, { ...params, newName });
    }
}
