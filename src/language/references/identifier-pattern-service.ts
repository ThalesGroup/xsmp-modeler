import * as ast from '../generated/ast.js';
import type { XsmpSharedServices } from '../xsmp-module.js';

export interface IdentifierPatternPartView {
    kind: 'text' | 'template';
    text: string;
    parameterName?: string;
    suffix?: string;
    parameter?: ast.TemplateParameter;
}

export interface IdentifierPatternView {
    text: string;
    parts: readonly IdentifierPatternPartView[];
}

export type TemplateBindings = ReadonlyMap<string, string>;

export interface IdentifierMatchResult<T> {
    matches: readonly T[];
    segmentText: string;
    concreteText?: string;
}

export class IdentifierPatternService {
    constructor(_services: XsmpSharedServices) { }

    stringifyPattern(pattern: ast.IdentifierPattern | undefined): string | undefined {
        if (!pattern) {
            return undefined;
        }
        return pattern.parts.map(part => {
            if (ast.isIdentifierTextPart(part)) {
                return part.text;
            }
            return part.text;
        }).join('');
    }

    stringifyPatternView(pattern: IdentifierPatternView | undefined): string | undefined {
        return pattern?.text;
    }

    getViewFromPattern(pattern: ast.IdentifierPattern | undefined): IdentifierPatternView | undefined {
        if (!pattern) {
            return undefined;
        }
        const parts: IdentifierPatternPartView[] = [];
        for (const part of pattern.parts) {
            if (ast.isIdentifierTextPart(part)) {
                parts.push({ kind: 'text', text: part.text });
            } else {
                const parameterName = this.getTemplateParameterName(part.text);
                parts.push({
                    kind: 'template',
                    text: part.text,
                    parameterName,
                    suffix: this.getTemplateSuffix(part.text),
                });
            }
        }
        return {
            text: parts.map(part => part.text).join(''),
            parts,
        };
    }

    parseTextPattern(text: string | undefined): IdentifierPatternView | undefined {
        if (!text) {
            return undefined;
        }
        const parts: IdentifierPatternPartView[] = [];
        const regex = /\{([_a-zA-Z]\w*)\}(\w*)|([_a-zA-Z]\w*)/g;
        let lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
            if (match.index !== lastIndex) {
                parts.push({ kind: 'text', text: text.slice(lastIndex, match.index) });
            }
            if (match[1]) {
                parts.push({
                    kind: 'template',
                    text: match[0],
                    parameterName: match[1],
                    suffix: match[2],
                });
            } else {
                parts.push({
                    kind: 'text',
                    text: match[0],
                });
            }
            lastIndex = regex.lastIndex;
        }
        if (lastIndex < text.length) {
            parts.push({ kind: 'text', text: text.slice(lastIndex) });
        }
        return {
            text,
            parts,
        };
    }

    hasTemplate(pattern: ast.IdentifierPattern | IdentifierPatternView | string | undefined): boolean {
        const view = this.toView(pattern);
        return view ? view.parts.some(part => part.kind === 'template') : false;
    }

    getTemplateNames(pattern: ast.IdentifierPattern | IdentifierPatternView | string | undefined): string[] {
        const view = this.toView(pattern);
        if (!view) {
            return [];
        }
        return view.parts
            .filter((part): part is IdentifierPatternPartView & { parameterName: string } => part.kind === 'template' && Boolean(part.parameterName))
            .map(part => part.parameterName);
    }

    substitute(pattern: ast.IdentifierPattern | IdentifierPatternView | string | undefined, bindings: TemplateBindings | undefined): string | undefined {
        const view = this.toView(pattern);
        if (!view) {
            return undefined;
        }
        let result = '';
        for (const part of view.parts) {
            if (part.kind === 'text') {
                result += part.text;
                continue;
            }
            if (!bindings) {
                return undefined;
            }
            const value = bindings.get(part.parameterName ?? '');
            if (value === undefined) {
                return undefined;
            }
            result += value;
            if (part.suffix) {
                result += part.suffix;
            }
        }
        return result;
    }

    matches(
        left: ast.IdentifierPattern | IdentifierPatternView | string | undefined,
        right: ast.IdentifierPattern | IdentifierPatternView | string | undefined,
        bindings: TemplateBindings | undefined,
    ): boolean {
        const leftView = this.toView(left);
        const rightView = this.toView(right);
        if (!leftView || !rightView) {
            return false;
        }

        const concreteLeft = this.substitute(leftView, bindings);
        const concreteRight = this.substitute(rightView, bindings);
        if (concreteLeft !== undefined && concreteRight !== undefined) {
            return concreteLeft === concreteRight;
        }

        if (leftView.parts.length !== rightView.parts.length) {
            return false;
        }
        for (let index = 0; index < leftView.parts.length; index++) {
            const leftPart = leftView.parts[index];
            const rightPart = rightView.parts[index];
            if (leftPart.kind !== rightPart.kind) {
                return false;
            }
            if (leftPart.kind === 'text') {
                if (leftPart.text !== rightPart.text) {
                    return false;
                }
                continue;
            }
            if (leftPart.text !== rightPart.text) {
                return false;
            }
        }
        return true;
    }

    matchCandidates<T>(
        segment: ast.PathNamedSegment,
        candidates: readonly T[],
        getCandidateText: (candidate: T) => string | undefined,
        bindings: TemplateBindings | undefined,
    ): IdentifierMatchResult<T> {
        const segmentPattern = this.getSegmentPattern(segment);
        const segmentText = this.stringifyPatternView(segmentPattern) ?? '';
        const concreteText = this.substitute(segmentPattern, bindings);
        const matches = candidates.filter(candidate => this.matches(segmentPattern, getCandidateText(candidate), bindings));
        return { matches, segmentText, concreteText };
    }

    getSegmentPattern(segment: ast.PathNamedSegment): IdentifierPatternView | undefined {
        if (ast.isConcretePathNamedSegment(segment)) {
            const text = segment.reference?.ref?.name ?? segment.reference?.$refText;
            return this.parseTextPattern(text);
        }
        if (ast.isPatternPathNamedSegment(segment)) {
            return this.getViewFromPattern(segment.pattern);
        }
        return undefined;
    }

    getSegmentTemplateNames(segment: ast.PathNamedSegment): string[] {
        return this.getTemplateNames(this.getSegmentPattern(segment));
    }

    getTemplateParameterName(text: string | undefined): string | undefined {
        return this.parseTemplateToken(text)?.parameterName;
    }

    getTemplateSuffix(text: string | undefined): string | undefined {
        return this.parseTemplateToken(text)?.suffix;
    }

    protected toView(pattern: ast.IdentifierPattern | IdentifierPatternView | string | undefined): IdentifierPatternView | undefined {
        if (!pattern) {
            return undefined;
        }
        if (typeof pattern === 'string') {
            return this.parseTextPattern(pattern);
        }
        if ('text' in pattern && 'parts' in pattern) {
            return pattern as IdentifierPatternView;
        }
        return this.getViewFromPattern(pattern as ast.IdentifierPattern);
    }

    protected parseTemplateToken(text: string | undefined): { parameterName: string; suffix: string } | undefined {
        if (!text) {
            return undefined;
        }
        const match = /^\{([_a-zA-Z]\w*)\}(\w*)$/.exec(text);
        if (!match) {
            return undefined;
        }
        return {
            parameterName: match[1],
            suffix: match[2],
        };
    }
}
