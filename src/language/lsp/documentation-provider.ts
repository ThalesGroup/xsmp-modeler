import { type AstNode, JSDocDocumentationProvider } from 'langium';
import * as ast from '../generated/ast.js';
import { type DocumentationHelper } from '../utils/documentation-helper.js';
import { XsmpServices } from '../xsmp-module.js';

export class XsmpDocumentationProvider extends JSDocDocumentationProvider {

    protected readonly docHelper: DocumentationHelper;
    constructor(services: XsmpServices ) {
        super(services);
        this.docHelper = services.shared.DocumentationHelper;
    }

    override getDocumentation(node: AstNode): string | undefined {
        switch (node.$type) {
            case ast.Parameter: return this.docHelper.getDescription(node as ast.Parameter);
            case ast.ReturnParameter: return this.docHelper.getDescription(node as ast.ReturnParameter);
            default: {
                const parsedJSDoc = this.docHelper.getJSDoc(node);
                if (parsedJSDoc) {
                    return parsedJSDoc.toMarkdown({
                        renderLink: (link, display) => {
                            return this.documentationLinkRenderer(node, link, display);
                        },
                        renderTag: (tag) => {
                            return this.documentationTagRenderer(node, tag);
                        }
                    });
                }
                return undefined;
            }
        }
    }

}