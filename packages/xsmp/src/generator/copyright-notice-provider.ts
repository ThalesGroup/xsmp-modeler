
import { CstUtils, isJSDoc, isLeafCstNode, type LangiumDocument } from 'langium';

export function getCopyrightNotice(document: LangiumDocument | undefined, prefix: string = ''): string | undefined {
    if (!document) {
        return undefined;
    }
    const notice = computeCopyrightNotice(document);
    if (prefix.length === 0) {
        return notice;
    }
    if (notice) {
        return prefix + notice.replaceAll(/\r?\n/g, `\n${prefix}`);
    }
    return undefined;
}

const slPattern = /^\/\/ ?/;

function computeCopyrightNotice(document: LangiumDocument): string | undefined {

    const rootNode = document.parseResult.value.$cstNode?.root;

    if (!rootNode)
        return undefined;

    for (const node of rootNode.content) {
        if (!node.hidden) {
            break;
        }
        if (!isLeafCstNode(node)) {
            continue;
        }

        if (node.tokenType.name === 'ML_COMMENT') {
            const commentNode = CstUtils.findCommentNode(document.parseResult.value.$cstNode, ['ML_COMMENT']);
            if (commentNode === node && isJSDoc(commentNode)) {
                return undefined;
            }

            return processVariables(
                stripMultilineComment(node.text).trim()
            );
        }
        if (node.tokenType.name === 'SL_COMMENT') {
            let comment = node.text.replace(slPattern, '');
            let sibling = CstUtils.getNextNode(node);
            while (isLeafCstNode(sibling) && sibling.tokenType.name === 'SL_COMMENT') {
                comment += '\n' + sibling.text.replace(slPattern, '');
                sibling = CstUtils.getNextNode(sibling);
            }
            return processVariables(comment.trim());
        }

    }
    return undefined;
}

function processVariables(input: string): string {
    const now = new Date(Date.now());
    return input.replaceAll('${year}', now.getUTCFullYear().toString())
        .replaceAll('${user}', process.env.USER ?? 'unknown')
        .replaceAll('${time}', now.toTimeString())
        .replaceAll('${date}', now.toDateString());
}

function stripMultilineComment(input: string): string {
    const lines = input
        .replaceAll('\r\n', '\n')
        .replaceAll('\r', '\n')
        .split('\n');

    if (lines.length === 0) {
        return '';
    }

    lines[0] = stripMultilineCommentStart(lines[0]);
    lines[lines.length - 1] = stripMultilineCommentEnd(lines[lines.length - 1]);

    return lines.map((line, index) => index === 0 ? line : stripMultilineCommentBody(line)).join('\n');
}

function stripMultilineCommentStart(line: string): string {
    if (!line.startsWith('/*')) {
        return line;
    }
    let index = 2;
    while (index < line.length && line[index] === '*') {
        index++;
    }
    if (line[index] === ' ') {
        index++;
    }
    return line.slice(index);
}

function stripMultilineCommentEnd(line: string): string {
    if (!line.endsWith('*/')) {
        return line;
    }
    let end = line.length - 2;
    while (end > 0 && line[end - 1] === '*') {
        end--;
    }
    if (end > 0 && line[end - 1] === ' ') {
        end--;
    }
    return line.slice(0, end);
}

function stripMultilineCommentBody(line: string): string {
    let index = 0;
    while (index < line.length && line[index] === ' ') {
        index++;
    }
    if (line[index] === '*') {
        index++;
        if (line[index] === ' ') {
            index++;
        }
    }
    return line.slice(index);
}
