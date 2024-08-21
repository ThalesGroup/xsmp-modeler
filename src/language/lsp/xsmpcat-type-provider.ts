import { type AstNode, AstUtils, GrammarUtils, type MaybePromise } from 'langium';
import { AbstractTypeDefinitionProvider } from 'langium/lsp';
import { type CancellationToken, LocationLink } from 'vscode-languageserver';
import * as ast from '../generated/ast.js';

export class XsmpcatTypeDefinitionProvider extends AbstractTypeDefinitionProvider {

    override collectGoToTypeLocationLinks(element: AstNode, _cancelToken: CancellationToken): MaybePromise<LocationLink[] | undefined> {
        if (ast.isType(element)) {
            return [LocationLink.create(AstUtils.getDocument(element).uri.toString(), element.$cstNode!.range, GrammarUtils.findNodeForProperty(element.$cstNode!, 'name')!.range)];
        }
        return undefined;
    }
}