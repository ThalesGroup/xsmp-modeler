import type { LangiumServices } from 'langium';
import { expectCompletion, type ParseHelperOptions } from 'langium/test';
import { InsertTextFormat, type CompletionItem, type CompletionList, type Position } from 'vscode-languageserver';

export type CompletionProbeInput = {
    sourceText: string;
    offset: number;
    parseOptions?: ParseHelperOptions;
};

export type CompletionProbeResult = {
    completion: CompletionList;
    items: CompletionItem[];
    sourceText: string;
};

const completionIndexMarker = '__LANGIUM_COMPLETION_CURSOR__';

export function createCompletionProbe(services: LangiumServices) {
    const expectLangiumCompletion = expectCompletion(services);
    return async (input: CompletionProbeInput): Promise<CompletionProbeResult> => {
        const text = `${input.sourceText.slice(0, input.offset)}${completionIndexMarker}${input.sourceText.slice(input.offset)}`;
        let result: CompletionProbeResult | undefined;

        await expectLangiumCompletion({
            text,
            index: 0,
            indexMarker: completionIndexMarker,
            parseOptions: input.parseOptions,
            disposeAfterCheck: true,
            assert: completion => {
                result = {
                    completion,
                    items: completion.items,
                    sourceText: input.sourceText,
                };
            },
        });

        if (!result) {
            throw new Error('Missing completion result.');
        }

        return result;
    };
}

export function labels(items: CompletionItem[]): string[] {
    return items.map(item => item.label.toString());
}

export function findSnippetItem(items: CompletionItem[], label: string): CompletionItem | undefined {
    return items.find(item => item.label === label && item.insertTextFormat === InsertTextFormat.Snippet);
}

export function applyCompletion(sourceText: string, item: CompletionItem): string {
    if (item.textEdit && 'range' in item.textEdit) {
        const start = offsetAt(sourceText, item.textEdit.range.start);
        const end = offsetAt(sourceText, item.textEdit.range.end);
        return `${sourceText.slice(0, start)}${item.textEdit.newText}${sourceText.slice(end)}`;
    }

    return `${sourceText}${item.insertText ?? ''}`;
}

function offsetAt(text: string, position: Position): number {
    let offset = 0;
    let currentLine = 0;

    while (currentLine < position.line) {
        const nextLineOffset = text.indexOf('\n', offset);
        if (nextLineOffset < 0) {
            return text.length;
        }
        offset = nextLineOffset + 1;
        currentLine += 1;
    }

    return Math.min(offset + position.character, text.length);
}
