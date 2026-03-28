import { type AstNode, type LangiumDocument, type LangiumDocuments, type ReferenceDescription, type URI, AstUtils, CstUtils } from 'langium';
import { DefaultRenameProvider } from 'langium/lsp';
import type { RenameParams } from 'vscode-languageserver-protocol';
import { Location, TextEdit, type Range, type WorkspaceEdit } from 'vscode-languageserver-types';
import * as ast from '../generated/ast-partial.js';
import type { XsmpServices } from '../xsmp-module.js';

export class XsmpRenameProvider extends DefaultRenameProvider {

    protected readonly langiumDocuments: LangiumDocuments;

    constructor(services: XsmpServices) {
        super(services);
        this.langiumDocuments = services.shared.workspace.LangiumDocuments;
    }

    override async rename(document: LangiumDocument, params: RenameParams): Promise<WorkspaceEdit | undefined> {
        const changes: Record<string, TextEdit[]> = {};
        const rootNode = document.parseResult.value.$cstNode;
        if (!rootNode) return undefined;
        const offset = document.textDocument.offsetAt(params.position);
        const leafNode = CstUtils.findDeclarationNodeAtOffset(rootNode, offset, this.grammarConfig.nameRegexp);
        if (!leafNode) return undefined;
        const targetNode = this.references.findDeclarations(leafNode).at(0);
        if (!targetNode) return undefined;
        const location = this.getNodeLocation(targetNode);
        if (location) {
            const change = TextEdit.replace(location.range, params.newName);
            const uri = location.uri;
            if (uri) {
                if (uri in changes) {
                    changes[uri].push(change);
                } else {
                    changes[uri] = [change];
               }
            }
        }

        if (ast.isNamedElement(targetNode)) {
            const oldFqn = this.getFullyQualifiedName(targetNode);
            targetNode.name = params.newName;
            const newFqn = this.getFullyQualifiedName(targetNode);
            this.processNode(targetNode, changes, oldFqn, newFqn);
        }

        return { changes };
    }

    protected processNode(node: ast.NamedElement, changes: Record<string, TextEdit[]>, oldFqn: string, newFqn: string) {
        this.references.findReferences(node, {}).forEach(reference => {
            const refText = this.getReferenceText(reference.sourceUri, reference.segment.range);
            let oldName = oldFqn;
            let newName = newFqn;
            while (oldName !== newName) {
                if (refText === oldName) {
                    const nodeLocation = this.getRefLocation(reference);
                    const nodeChange = TextEdit.replace(nodeLocation.range, newName);
                    if (nodeLocation.uri in changes) {
                        changes[nodeLocation.uri].push(nodeChange);
                    } else {
                        changes[nodeLocation.uri] = [nodeChange];
                    }
                    break;
                }
                else {
                    if (oldName.indexOf('.') === -1)
                        break;
                    oldName = oldName.slice(oldName.indexOf('.') + 1);
                    newName = newName.slice(newName.indexOf('.') + 1);
                }
            }
        });

        for (const nested of AstUtils.streamContents(node)) {
            if (ast.isNamedElement(nested))
                this.processNode(nested, changes, `${oldFqn}.${nested.name}`, `${newFqn}.${nested.name}`);

        }
    }
    protected getReferenceText(uri: URI, range: Range): string | undefined {
        const langiumDoc = this.langiumDocuments.getDocument(uri);
        if (!langiumDoc) {
            return undefined;
        }
        return langiumDoc.textDocument.getText(range)
            .replaceAll(/\/\*[\s\S]*?\*\//g, '')
            .replaceAll(/\/\/[^\n\r]*/g, '')
            .replaceAll(/\s+/g, '');
    }

    getRefLocation(ref: ReferenceDescription): Location {
        return Location.create(
            ref.sourceUri.toString(),
            ref.segment.range
        );
    }

    getNodeLocation(targetNode: AstNode): Location | undefined {
        const nameNode = this.nameProvider.getNameNode(targetNode);
        if (nameNode) {
            const doc = AstUtils.getDocument(targetNode);
            return Location.create(
                doc.uri.toString(),
                CstUtils.toDocumentSegment(nameNode).range
            );
        }
        return undefined;
    }

    public getFullyQualifiedName(node: ast.NamedElement): string {
        let name = node.name;
        if (name === undefined || name.length === 0) {
            return '';
        }
        if (ast.isContainer(node) || ast.isReference(node)) {
            name = '$' + name;
        }

        const parent = AstUtils.getContainerOfType(node.$container, ast.isNamedElement);

        if (ast.isDocument(parent) || parent === undefined) {
            return name;
        }

        return this.getFullyQualifiedName(parent) + '.' + name;
    }
}
