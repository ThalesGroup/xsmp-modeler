import type { AstNode, JSDocComment, JSDocParagraph, JSDocTag } from 'langium';
import { isAstNodeWithComment, isJSDoc, parseJSDoc, WorkspaceCache } from 'langium';
import * as ast from '../generated/ast-partial.js';
import { type XsmpSharedServices } from '../xsmp-module.js';
import { findDocumentationNode } from './xsmp-utils.js';

export class DocumentationHelper {
    protected readonly cache: WorkspaceCache<AstNode, JSDocComment | undefined>;
    constructor(services: XsmpSharedServices) {
        this.cache = new WorkspaceCache(services);
    }
    getJSDoc(element: AstNode): JSDocComment | undefined {
        return this.cache.get(element, () => {
            switch (element.$type) {
                case ast.BuiltInFunction:
                case ast.BuiltInConstant: {
                    const builtin = element as ast.BuiltInConstant;
                    switch (builtin.name) {
                        case 'PI': return parseJSDoc('/** The double value that is closer than any other to pi, the ratio of the circumference of a circle to its diameter. */');
                        case 'E': return parseJSDoc('/** The double value that is closer than any other to e, the base of the natural logarithms. */');
                        case 'cos': return parseJSDoc('/** Returns the trigonometric cosine of an angle. */');
                        case 'sin': return parseJSDoc('/** Returns the trigonometric sine of an angle. */');
                        case 'tan': return parseJSDoc('/** Returns the trigonometric tangent of an angle. */');
                        case 'acos': return parseJSDoc('/** Returns the arc cosine of a value; the returned angle is in the range 0.0 through pi. */');
                        case 'asin': return parseJSDoc('/** Returns the arc sine of a value; the returned angle is in the range -pi/2 through pi/2. */');
                        case 'atan': return parseJSDoc('/** Returns the arc tangent of a value; the returned angle is in the range -pi/2 through pi/2. */');
                        case 'cosh': return parseJSDoc('/** Returns the hyperbolic cosine of a double value. The hyperbolic cosine of x is defined to be (ex + e-x)/2 where e is Euler\'s number. */');
                        case 'sinh': return parseJSDoc('/** Returns the hyperbolic sine of a double value. The hyperbolic sine of x is defined to be (ex - e-x)/2 where e is Euler\'s number. */');
                        case 'tanh': return parseJSDoc('/** Returns the hyperbolic tangent of a double value. The hyperbolic tangent of x is defined to be (ex - e-x)/ (ex + e-x), in other words, sinh(x)/cosh(x). Note that the absolute value of the exact tanh is always less than 1. */');
                        case 'exp': return parseJSDoc('/** Returns Euler\'s number e raised to the power of a double value. */');
                        case 'log': return parseJSDoc('/** Returns the natural logarithm (base e) of a double value. */');
                        case 'log10': return parseJSDoc('/** Returns the base 10 logarithm of a double value. */');
                        case 'expm1': return parseJSDoc('/** Returns ex -1. Note that for values of x near 0, the exact sum of expm1(x) + 1 is much closer to the true result of ex than exp(x). */');
                        case 'log1p': return parseJSDoc('/** Returns the natural logarithm of the sum of the argument and 1. Note that for small values x, the result of log1p(x) is much closer to the true result of ln(1 + x) than the floating-point evaluation of log(1.0+x). */');
                        case 'sqrt': return parseJSDoc('/** Returns the correctly rounded positive square root of a double value. */');
                        case 'ceil': return parseJSDoc('/** Returns the smallest (closest to negative infinity) double value that is greater than or equal to the argument and is equal to a mathematical integer. */');
                        case 'floor': return parseJSDoc('/** Returns the largest (closest to positive infinity) double value that is less than or equal to the argument and is equal to a mathematical integer. */');
                        case 'abs': return parseJSDoc('/** Returns the absolute value of a double value. If the argument is not negative, the argument is returned. If the argument is negative, the negation of the argument is returned. */');
                        case 'cosf': return parseJSDoc('/** Returns the trigonometric cosine of an angle. */');
                        case 'sinf': return parseJSDoc('/** Returns the trigonometric sine of an angle. */');
                        case 'tanf': return parseJSDoc('/** Returns the trigonometric tangent of an angle. */');
                        case 'acosf': return parseJSDoc('/** Returns the arc cosine of a value; the returned angle is in the range 0.0 through pi. */');
                        case 'asinf': return parseJSDoc('/** Returns the arc sine of a value; the returned angle is in the range -pi/2 through pi/2. */');
                        case 'atanf': return parseJSDoc('/** Returns the arc tangent of a value; the returned angle is in the range -pi/2 through pi/2. */');
                        case 'coshf': return parseJSDoc('/** Returns the hyperbolic cosine of a float value. The hyperbolic cosine of x is defined to be (ex + e-x)/2 where e is Euler\'s number. */');
                        case 'sinhf': return parseJSDoc('/** Returns the hyperbolic sine of a float value. The hyperbolic sine of x is defined to be (ex - e-x)/2 where e is Euler\'s number. */');
                        case 'tanhf': return parseJSDoc('/** Returns the hyperbolic tangent of a float value. The hyperbolic tangent of x is defined to be (ex - e-x)/ (ex + e-x), in other words, sinh(x)/cosh(x). Note that the absolute value of the exact tanh is always less than 1. */');
                        case 'expf': return parseJSDoc('/** Returns Euler\'s number e raised to the power of a float value. */');
                        case 'logf': return parseJSDoc('/** Returns the natural logarithm (base e) of a float value. */');
                        case 'log10f': return parseJSDoc('/** Returns the base 10 logarithm of a float value. */');
                        case 'expm1f': return parseJSDoc('/** Returns ex -1. Note that for values of x near 0, the exact sum of expm1(x) + 1 is much closer to the true result of ex than exp(x). */');
                        case 'log1pf': return parseJSDoc('/** Returns the natural logarithm of the sum of the argument and 1. Note that for small values x, the result of log1p(x) is much closer to the true result of ln(1 + x) than the floating-point evaluation of log(1.0+x). */');
                        case 'sqrtf': return parseJSDoc('/** Returns the correctly rounded positive square root of a float value. */');
                        case 'ceilf': return parseJSDoc('/** Returns the smallest (closest to negative infinity) float value that is greater than or equal to the argument and is equal to a mathematical integer. */');
                        case 'floorf': return parseJSDoc('/** Returns the largest (closest to positive infinity) float value that is less than or equal to the argument and is equal to a mathematical integer. */');
                        case 'absf': return parseJSDoc('/** Returns the absolute value of a float value. If the argument is not negative, the argument is returned. If the argument is negative, the negation of the argument is returned. */');
                    }
                }
            }
            const comment = findDocumentationNode(element.$cstNode);
            if (comment && isJSDoc(comment)) {
                return parseJSDoc(comment);
            }
            if (isAstNodeWithComment(element) && element.$comment) {
                return parseJSDoc(element.$comment);
            }
            return undefined;
        });
    }

    private getTag(element: AstNode, tagName: string): JSDocParagraph | undefined {
        const tag = this.getJSDoc(element)?.getTag(tagName);
        return tag?.inline ? undefined : tag?.content;
    }

    private getTags(element: AstNode, tagName: string): JSDocParagraph[] | undefined {
        return this.getJSDoc(element)?.getTags(tagName).filter(t => !t.inline).map(t => t.content);
    }

    getUsages(element: ast.AttributeType): JSDocParagraph[] | undefined {
        return this.getTags(element, 'usage');
    }

    getId(element: ast.NamedElement | ast.ReturnParameter): string | undefined {
        return this.getTag(element, 'id')?.toString().trim();
    }
    getNativeType(element: ast.NativeType): string | undefined {
        return this.getTag(element, 'type')?.toString().trim();
    }
    getNativeNamespace(element: ast.NativeType): string | undefined {
        return this.getTag(element, 'namespace')?.toString().trim();
    }
    getNativeLocation(element: ast.NativeType): string | undefined {
        return this.getTag(element, 'location')?.toString().trim();
    }
    isMulticast(element: ast.EventSource): boolean {
        return this.getTag(element, 'singlecast') === undefined;
    }

    getPropertyCategory(element: ast.Property): string | undefined {
        return this.getTag(element, 'category')?.toString().trim();
    }
    getUnit(element: ast.Integer | ast.Float): string | undefined {
        return this.getTag(element, 'unit')?.toString().trim();
    }

    getTitle(element: ast.Document): string | undefined {
        return this.getTag(element, 'title')?.toString().trim();
    }
    getDate(element: ast.Document): JSDocParagraph | undefined {
        return this.getTag(element, 'date');
    }

    getCreator(element: ast.Document): string | undefined {
        return this.getTags(element, 'creator')?.map(e => e.toString().trim()).join(', ');
    }
    getVersion(element: ast.Document): string | undefined {
        return this.getTag(element, 'version')?.toString().trim();
    }

    getUuid(type: ast.Type): JSDocParagraph | undefined {
        return this.getTag(type, 'uuid');
    }

    getDeprecated(element: AstNode): JSDocParagraph | undefined {
        return this.getTag(element, 'deprecated');
    }

    IsDeprecated(element: AstNode): boolean {
        return this.getDeprecated(element) !== undefined;
    }

    getDescription(element: ast.NamedElement | ast.ReturnParameter): string | undefined {
        if (ast.Parameter === element.$type) {
            const regex = new RegExp(`^${element.name}\\s`);
            return this.getJSDoc(element.$container as AstNode)?.getTags('param').find(t => regex.test(t.content.toString()))?.content.toString().slice(element.name?.length).trim();
        }
        if (ast.ReturnParameter === element.$type) {
            return this.getJSDoc(element.$container)?.getTag('return')?.content.toString().trim();
        }
        const jsDoc = this.getJSDoc(element);
        if (!jsDoc) {
            return undefined;
        }

        const result: string[] = [];
        for (const e of jsDoc.elements) {
            if (typeof (e as JSDocTag).name === 'string' && !(e as JSDocTag).inline) {
                break;
            }
            result.push(e.toString());
        }
        return result.length > 0 ? result.join('\n').trim() : undefined;
    }
    allowMultiple(element: ast.AttributeType): boolean {
        return this.getTag(element, 'allowMultiple') !== undefined;
    }

}