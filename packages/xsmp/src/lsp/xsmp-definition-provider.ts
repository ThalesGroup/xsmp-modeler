import { AstUtils, type CstNode, type LangiumDocument } from 'langium';
import { DefaultDefinitionProvider } from 'langium/lsp';
import { LocationLink, type DefinitionParams } from 'vscode-languageserver';
import { findTemplateParameter } from '../references/template-parameter-reference.js';
import type { XsmpServices } from '../xsmp-module.js';

interface TemplateAtOffset {
    name: string;
    start: number;
    end: number;
}

export class XsmpDefinitionProvider extends DefaultDefinitionProvider {
    protected readonly services: XsmpServices;

    constructor(services: XsmpServices) {
        super(services);
        this.services = services;
    }

    protected override collectLocationLinks(sourceCstNode: CstNode, params: DefinitionParams): LocationLink[] | undefined {
        const sourceDocument = AstUtils.getDocument(sourceCstNode.astNode);
        const offset = sourceDocument.textDocument.offsetAt(params.position);
        const template = this.getTemplateAtOffset(sourceCstNode.text, offset - sourceCstNode.offset);
        const parameter = template
            ? findTemplateParameter(this.services, sourceCstNode.astNode, template.name)
            : undefined;
        const targetNameNode = parameter ? this.nameProvider.getNameNode(parameter) : undefined;
        const targetDocument = parameter ? AstUtils.getDocument(parameter) : undefined;
        if (template && parameter?.$cstNode && targetNameNode && targetDocument) {
            return [this.createTemplateLocationLink(sourceCstNode, template, targetDocument, parameter.$cstNode, targetNameNode)];
        }
        return super.collectLocationLinks(sourceCstNode, params) as LocationLink[] | undefined;
    }

    protected createTemplateLocationLink(
        sourceCstNode: CstNode,
        template: TemplateAtOffset,
        targetDocument: LangiumDocument,
        targetCstNode: CstNode,
        targetNameNode: CstNode,
    ): LocationLink {
        const textDocument = AstUtils.getDocument(sourceCstNode.astNode).textDocument;
        const sourceSelectionRange = {
            start: textDocument.positionAt(sourceCstNode.offset + template.start),
            end: textDocument.positionAt(sourceCstNode.offset + template.end),
        };
        return LocationLink.create(
            targetDocument.textDocument.uri,
            targetCstNode.range,
            targetNameNode.range,
            sourceSelectionRange,
        );
    }

    protected getTemplateAtOffset(text: string, offset: number): TemplateAtOffset | undefined {
        const regex = /\{([_a-zA-Z]\w*)\}/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            if (offset >= match.index && offset <= match.index + match[0].length) {
                return {
                    name: match[1],
                    start: match.index,
                    end: match.index + match[0].length,
                };
            }
        }
        return undefined;
    }
}
