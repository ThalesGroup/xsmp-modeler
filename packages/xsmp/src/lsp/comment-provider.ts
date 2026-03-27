import { type AstNode, DefaultCommentProvider, isAstNodeWithComment, isJSDoc } from 'langium';
import { findDocumentationNode } from '../utils/xsmp-utils.js';

export class XsmpCommentProvider extends DefaultCommentProvider {

    override getComment(node: AstNode): string | undefined {
        if (isAstNodeWithComment(node) && node.$comment && isJSDoc(node.$comment)) {
            return node.$comment;
        }
        return findDocumentationNode(node.$cstNode)?.text;
    }
}
