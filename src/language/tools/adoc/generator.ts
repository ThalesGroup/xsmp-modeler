import * as fs from 'fs';
import * as ast from '../../generated/ast.js';
import { type URI, UriUtils, type AstNode, type Reference, AstUtils, isReference } from 'langium';
import { type TaskAcceptor, type XsmpGenerator } from '../../generator/generator.js';
import { fqn, getLower, getNodeType, getRealVisibility, getUpper } from '../../utils/xsmp-utils.js';
import { VisibilityKind, VisibilityKinds } from '../../utils/visibility-kind.js';
import { expandToString as s } from 'langium/generate';
import { type DocumentationHelper } from '../../utils/documentation-helper.js';
import { type AttributeHelper } from '../../utils/attribute-helper.js';
import { type XsmpSharedServices } from '../../xsmp-module.js';
import * as Solver from '../../utils/solver.js';
import { ViewKind } from '../../utils/view_kind.js';

/**
 * AsciiDoc generator for XSMP Catalogues
 * Generates documentation from XSMP catalogue models
 */
export class ADocGenerator implements XsmpGenerator {
    protected readonly docHelper: DocumentationHelper;
    protected readonly attrHelper: AttributeHelper;
    constructor(services: XsmpSharedServices) {
        this.docHelper = services.DocumentationHelper;
        this.attrHelper = services.AttributeHelper;
    }

    static readonly defaultDocFolder = 'adoc-gen';

    generate(node: AstNode, projectUri: URI, acceptTask: TaskAcceptor): void {
        if (ast.isCatalogue(node)) {
            acceptTask(() => this.generateCatalogue(node, UriUtils.joinPath(projectUri, ADocGenerator.defaultDocFolder)));
        }
    }

    clean(projectUri: URI): void {
        fs.rmSync(UriUtils.joinPath(projectUri, ADocGenerator.defaultDocFolder).fsPath, { recursive: true, force: true });
    }

    // ========== Utility Methods ==========

    /**
     * Get a short representation of an expression value
     */
    private getShortValue(expr: ast.Expression | undefined): string | undefined {
        if (!expr) {
            return undefined;
        }

        if (ast.isCollectionLiteral(expr)) {
            const cl = expr as ast.CollectionLiteral;
            return this.getShortValuesArray(cl);
        }
        if (ast.isKeywordExpression(expr)) {
            return expr.name;
        }

        try {
            const value = Solver.getValue(expr);
            if (value) {
                return value.toString();
            }
        } catch {
            // ignore solver exceptions
        }

        return undefined;
    }

    /**
     * Get array representation of a collection literal
     */
    private getShortValuesArray(cl: ast.CollectionLiteral): string {
        const results: string[] = [];

        for (const expression of cl.elements) {
            if (ast.isCollectionLiteral(expression)) {
                results.push(this.getShortValuesArray(expression as ast.CollectionLiteral));
            } else if (ast.isDesignatedInitializer(expression)) {
                const di = expression as ast.DesignatedInitializer;
                results.push(this.getShortValue(di.expr) ?? '?');
            } else {
                try {
                    const value = Solver.getValue(expression);
                    results.push(value?.toString() ?? '?');
                } catch {
                    results.push('?');
                }
            }
        }

        const str = `[${results.join(', ')}]`;
        if (str.startsWith('[[')) {
            return '\\' + str;
        }

        return str;
    }

    /**
     * Escape pipe characters in descriptions
     */
    private escapeDescription(str: string | undefined): string {
        if (!str) {
            return '';
        }
        return str.replace(/\|/g, '\\|');
    }

    /**
     * Get field kinds (flags) from a field
     */
    private getFieldKinds(field: ast.Field): string[] {
        const kinds: string[] = [];
        if (field.modifiers.includes('output')) kinds.push('output');
        if (field.modifiers.includes('input')) kinds.push('input');
        if (field.modifiers.includes('transient'))
            kinds.push('transient');
        else
            kinds.push('state');
        if (field.modifiers.includes('forcible')) kinds.push('forcible');
        if (field.modifiers.includes('failure')) kinds.push('failure');
        return kinds;
    }

    /**
     * Get the string representation of a multiplicity value
     */
    private getMultiplicityValue(value: bigint | undefined): string {
        if (value === undefined) {
            return '?';
        }
        if (value < 0) {
            return '*';
        }
        return value.toString();
    }

    private async generateCatalogue(catalogue: ast.Catalogue, uri: URI): Promise<void> {
        // Catalogue file
        const path = UriUtils.joinPath(uri, `${catalogue.name}-gen.adoc`);
        const content = await this.doGenerateCatalogue(catalogue);
        await fs.promises.mkdir(uri.fsPath, { recursive: true });
        await fs.promises.writeFile(path.fsPath, content);
    }

    async doGenerateCatalogue(catalogue: ast.Catalogue): Promise<string> {
        const title = this.docHelper.getTitle(catalogue) ?? `Catalogue ${catalogue.name}`;
        const description = this.docHelper.getDescription(catalogue);
        const content = s`
            = ${title}

            ${description ? s`
                ++++
                ${description}
                ++++`: undefined}
            
            ${catalogue.elements.filter(element => ast.isNamespace(element)).map(namespace => this.generateNamespace(namespace as ast.Namespace), this).join('\n')}
            `;
        return content;
    }

    private crossReference(ref: Reference<ast.NamedElement> | string[], context: ast.NamedElement | ast.ReturnParameter): string {
        if (isReference(ref)) {
            if (ref.ref === undefined) {
                return `<<?,??>>`;
            }
            if (AstUtils.getDocument(ref.ref) === AstUtils.getDocument(context)) {
                return `<<${fqn(ref.ref, '-')},${ref.ref.name}>>`;
            }
            return `<<${fqn(ref.ref, '-')},${fqn(ref.ref, '::')}>>`;
        }

        return `<<${ref.join('-')},${ref.join('::')}>>`;
    }

    private generateNamespace(namespace: ast.Namespace): string {
        const types = namespace.elements.filter(ast.isType);
        if (types.length === 0) {
            return '';
        }
        const description = this.docHelper.getDescription(namespace);
        return s`
            == Namespace ${fqn(namespace, '::')}

            ${description ? s`
                ++++
                ${description}
                ++++`: undefined}
            [.center]
            [mermaid]
            ....
            classDiagram
            
            direction LR
            
            namespace ${namespace.name} {
            ${types.length > 8 ? `
                ${types.slice(0, 6).map(type => `class ${type.name} { <<${getNodeType(type)}>> }`).join('\n')}
                class - { <<...>> }
                `: `
                ${types.map(type => `class ${type.name} { <<${getNodeType(type)}>> }`).join('\n')}
                `}
            }
            ....
            
            ${types.map(this.generateType, this).join('\n')}
            `;
    }

    private generateType(type: ast.Type): string {
        const description = this.docHelper.getDescription(type);
        return s`
            [#${fqn(type, '-')}]
            === ${getNodeType(type)} ${type.name}

            ${description ? s`
                ++++
                ${description}
                ++++`: undefined}
            
            .${type.name}'s informations
            [%autowidth.stretch]
            |===
            ${this.generateTypeInfoDetails(type)}
            |===
            
            ${this.generateMermaid(type)}
            
            ${this.generateContent(type)}
            `;
    }


    protected generateTypeInfoDetails(type: ast.Type): string | undefined {
        const typeInfo = s`
            .^h|Visibility |${VisibilityKind[getRealVisibility(type)]}
            .^h|Qualified Name |${fqn(type, '::')}
            .^h|UUID |${this.docHelper.getUuid(type)?.toString().trim()}
            `;
        switch (type.$type) {
            case ast.Integer: {
                const integer = type as ast.Integer;
                const unit = this.docHelper.getUnit(integer);
                return s`
                    ${typeInfo}
                    .^h|Primitive Type |${this.crossReference(integer.primitiveType ?? ['Smp', 'Int32'], integer)}
                    ${integer.minimum ? `.^h|Minimum |${this.getShortValue(integer.minimum)}` : undefined}
                    ${integer.maximum ? `.^h|Maximum |${this.getShortValue(integer.maximum)}` : undefined}
                    ${unit ? `.^h|Unit |${unit}` : undefined}
                    `;
            }
            case ast.Float: {
                const float = type as ast.Float;
                const unit = this.docHelper.getUnit(float);
                return s`
                    ${typeInfo}
                    .^h|Primitive Type |${this.crossReference(float.primitiveType ?? ['Smp', 'Float64'], float)}
                    ${float.minimum ? `.^h|Minimum |${this.getShortValue(float.minimum)}${float.range === '<..' || float.range === '<.<' ? ' (exclusive)' : ''}` : undefined}
                    ${float.maximum ? `.^h|Maximum |${this.getShortValue(float.maximum)}${float.range === '..<' || float.range === '<.<' ? ' (exclusive)' : ''}` : undefined}
                    ${unit ? `.^h|Unit |${unit}` : undefined}
                    `;
            }
            case ast.ArrayType: {
                const array = type as ast.ArrayType;
                return s`
                    ${typeInfo}
                    .^h|Item Type |${this.crossReference(array.itemType, array)}
                    .^h|Size |${this.getShortValue(array.size)}
                    `;
            }
            case ast.EventType: {
                const event = type as ast.EventType;
                return s`
                    ${typeInfo}
                    .^h|Event Type |${this.crossReference(event.eventArgs ?? ['void'], event)}
                    `;
            }
            case ast.NativeType: {
                const native = type as ast.NativeType;
                const location = this.docHelper.getNativeLocation(native);
                const namespace = this.docHelper.getNativeNamespace(native);
                return s`
                    ${typeInfo}
                    .^h|Type |${this.crossReference([this.docHelper.getNativeType(native)!], native)}
                    ${location ? `.^h|Location |${location}` : undefined}
                    ${namespace ? `.^h|Namespace |${namespace}` : undefined}
                    `;
            }
            case ast.StringType: {
                const string = type as ast.StringType;
                return s`
                    ${typeInfo}
                    .^h|Length |${this.getShortValue(string.length)}
                    `;
            }
            case ast.Class: {
                const clazz = type as ast.Class;
                return s`
                    ${typeInfo}
                    ${clazz.base ? `.^h|Extends |${this.crossReference(clazz.base, clazz)}` : undefined}
                    `;
            }
            case ast.Exception: {
                const exception = type as ast.Exception;
                return s`
                    ${typeInfo}
                    .^h|Extends |${this.crossReference(exception.base ?? ['Smp', 'Exception'], exception)}
                    `;
            }
            case ast.Interface: {
                const inter = type as ast.Interface;
                return s`
                    ${typeInfo}
                    ${inter.base.length > 0 ? `.${inter.base.length}+.^h|Extends ${inter.base.map(i => `|${this.crossReference(i, inter)}`, this).join(' ')}` : undefined}
                    `;
            }

            case ast.Model:
            case ast.Service: {
                const component = type as ast.Component;
                return s`
                    ${typeInfo}
                    ${component.base ? `.^h|Extends |${this.crossReference(component.base, component)}` : undefined}
                    ${component.interface.length > 0 ? `.${component.interface.length}+.^h|Implements ${component.interface.map(i => `|${this.crossReference(i, component)}`, this).join(' ')}` : undefined}
                    `;
            }
            default: return typeInfo;
        }
    }

    private generateMermaid(obj: ast.Type): string | undefined {
        if (ast.isComponent(obj)) return this.generateMermaidComponent(obj);
        if (ast.isInterface(obj)) return this.generateMermaidInterface(obj);
        if (ast.isStructure(obj)) return this.generateMermaidStructure(obj);
        return undefined;
    }

    protected multiplicity(node: ast.NamedElementWithMultiplicity): string {
        const lower = getLower(node) ?? BigInt(1);
        const upper = getUpper(node) ?? BigInt(1);
        if (lower === BigInt(0) && upper === BigInt(1)) {
            return '?';
        }
        else if (lower === upper) {
            return lower.toString();
        }
        else if (upper < BigInt(0)) {
            if (lower === BigInt(0)) {
                return '*';
            }
            else if (lower === BigInt(1)) {
                return '+';
            }
            else {
                return `${lower} .. *`;
            }
        }
        else {
            return `${lower} .. ${upper}`;
        }

    }
    private generateMermaidComponent(component: ast.Component): string {
        const interfaces = component.interface;
        const base = component.base;
        const references = component.elements.filter(ast.isReference);
        const containers = component.elements.filter(ast.isContainer);
        return s`
            ==== Diagram
            
            [.center]
            [mermaid]
            ....
            classDiagram
                ${base?.ref !== undefined ? `class ${base.ref.name} { <<${getNodeType(base.ref)}>> }` : ''}
                ${interfaces.map(interf => `class ${interf.ref?.name} { <<${getNodeType(interf.ref!)}>> }`).join('\n')}
                ${references.map(ref => `class ${ref.interface?.ref?.name} { <<${getNodeType(ref)}>> }`).join('\n')}
                ${containers.map(container => `class ${container.type.ref?.name} { <<${getNodeType(container)}>> }`).join('\n')}
                class ${component.name} {
                    ${this.mermaidClassAttributes(component)}
                }
                ${base?.ref !== undefined ? `${base.ref.name} <|-- ${component.name} : extends` : undefined}
                ${interfaces.map(interf => `${interf.ref?.name} <|.. ${component.name} : implements`).join('\n')}
                ${references.map(ref => `${component.name} "${this.multiplicity(ref as unknown as ast.NamedElementWithMultiplicity)}" o-- ${ref.interface?.ref?.name} : ${ref.name}`, this).join('\n')}
                ${containers.map(container => `${component.name} "${this.multiplicity(container as unknown as ast.NamedElementWithMultiplicity)}" *-- ${container.type.ref?.name} : ${container.name}`, this).join('\n')}
            ....
        `;
    }

    private generateMermaidInterface(interf: ast.Interface): string {
        const base = interf.base;
        return s`
            ==== Diagram
                        
            [.center]
            [mermaid]
            ....
            classDiagram
                ${base.map(b => `class ${b.ref?.name} { <<Interface>> }`).join('\n')}
            
                class ${interf.name} {
                    ${this.mermaidClassAttributes(interf)}
                }
                
                ${base.map(b => `${b.ref?.name} <|-- ${interf.name} : extends`).join('\n')}
            ....
        `;
    }

    private generateMermaidStructure(structure: ast.Structure): string {
        const base = ast.isClass(structure) ? structure.base?.ref : undefined;;
        return s`
            ==== Diagram
                        
            [.center]
            [mermaid]
            ....
            classDiagram
                ${base ? `class ${base.name} { <<${getNodeType(base)}>> }` : ''}
                
                class ${structure.name} {
                    ${this.mermaidClassAttributes(structure)}
                }
                
                ${base ? `${base.name} <|-- ${structure.name}` : ''}
            ....
        `;
    }

    private mermaidClassAttributes(element: ast.WithBody): string {
        const members = element.elements.filter(m => ast.isConstant(m) || ast.isField(m) || ast.isEventSink(m) || ast.isEventSource(m) || ast.isEntryPoint(m) || ast.isAssociation(m));
        const operations = element.elements.filter(ast.isOperation);
        const maxMembers = Math.max(5, 10 - operations.length);
        const maxOperations = Math.max(5, 10 - members.length);
        return s`
            ${members.length > maxMembers ? `
                ${members.slice(0, maxMembers - 2).map(this.generateMermaidMembers, this).join('\n')}
                ...
                `: members.map(this.generateMermaidMembers, this).join('\n')}
            ${operations.length > maxOperations ? `
                ${operations.slice(0, maxOperations - 2).map(this.generateMermaidMembers, this).join('\n')}
                ...()
                `: operations.map(this.generateMermaidMembers, this).join('\n')}
            `;
    }

    private generateMermaidMembers(element: ast.NamedElement): string | undefined {
        switch (element.$type) {
            case ast.Field: {
                const field = element as ast.Field;
                return `${this.generateMermaidVisibility(field)}${field.type.ref?.name} ${field.name}`;
            }
            case ast.EventSource: {
                const eventSource = element as ast.EventSource;
                return `+EventSource<${eventSource.type.ref?.name}> ${eventSource.name}`;
            }
            case ast.EventSink: {
                const eventSink = element as ast.EventSink;
                return `+EventSink<${eventSink.type.ref?.name}> ${eventSink.name}`;
            }
            case ast.EntryPoint: {
                const entryPoint = element as ast.EntryPoint;
                return `+EntryPoint ${entryPoint.name}`;
            }
            case ast.Constant: {
                const constant = element as ast.Constant;
                return `${this.generateMermaidVisibility(constant)}constexpr ${constant.type.ref?.name} ${constant.name} = ${this.getShortValue(constant.value)}`;
            }
            case ast.Association: {
                const association = element as ast.Association;
                return `${this.generateMermaidVisibility(association)}${association.type.ref?.name}* ${association.name}`;
            }
            case ast.Operation: {
                const op = element as ast.Operation;
                return `${this.generateMermaidVisibility(op)}${op.name}(${op.parameter.map(param => `${param.direction ?? 'in'} ${param.type.ref?.name}`).join(', ')}) ${op.returnParameter?.type.ref?.name ?? 'void'} `;
            }
            default: return undefined;
        }
    }

    private generateMermaidVisibility(elem: ast.VisibilityElement): string {
        switch (getRealVisibility(elem)) {
            case VisibilityKind.public: return '+';
            case VisibilityKind.protected: return '#';
            case VisibilityKind.private: return '-';
            default: return '';
        }
    }

    private generateContent(element: ast.Type): string | undefined {
        if (ast.isEnumeration(element)) {
            return s`
                .${element.name}'s literals
                [%autowidth.stretch]
                |===
                |Name |Value
                ${element.literal.map(literal => `|${literal.name}|${this.getShortValue(literal.value)}`).join('\n')}
                |===
                `;
        }
        if (ast.isWithBody(element))
            return s`
            ${this.generateConstants(element)}
            ${this.generateProperties(element)}
            ${this.generateOperations(element)}
            ${this.generateEntryPoints(element)}
            ${this.generateEventSinks(element)}
            ${this.generateEventSources(element)}
            ${this.generateFields(element)}
            ${this.generateAssociations(element)}
            ${this.generateContainers(element)}
            ${this.generateReferences(element)}
            `;
        return undefined;
    }

    private generateFields(element: ast.WithBody): string | undefined {
        const fields = element.elements.filter(ast.isField);
        if (fields.length === 0) return undefined;

        return s`
            ==== Fields
            The ${element.name} ${element.$type.toLowerCase()} provides the following fields:
            
            ${VisibilityKinds.map(v => this.generateFieldsWithVisibility(element, v), this).filter(s => s !== undefined).join('\n')}
            `;
    }

    private unit(field: ast.Field): string | undefined {
        if (ast.isInteger(field.type.ref) || ast.isFloat(field.type.ref))
            return this.docHelper.getUnit(field.type.ref);
        return undefined;
    }
    private viewKind(node: ast.Property | ast.Field | ast.Operation | ast.EntryPoint): string {
        switch (this.attrHelper.getViewKind(node)) {
            case ViewKind.VK_None: return 'None';
            case ViewKind.VK_Debug: return 'Debug';
            case ViewKind.VK_Expert: return 'Expert';
            case ViewKind.VK_All: return 'All';
            default: return '';
        }

    }

    private generateFieldsWithVisibility(element: ast.WithBody, v: VisibilityKind): string | undefined {
        const fields = element.elements.filter(ast.isField).filter(field => getRealVisibility(field) === v);
        if (fields.length === 0) return undefined;
        const hasUnit = fields.some(field => this.unit(field) !== undefined, this);
        const hasInitialValue = fields.some(field => field.default !== undefined);
        const hasDescription = fields.some(field => this.docHelper.getDescription(field) !== undefined, this);
        const hasViewKind = fields.some(field => this.attrHelper.getViewKind(field) !== undefined, this);
        return s`
            .${element.name}'s ${VisibilityKind[v]} fields
            [%autowidth.stretch]
            |===
            |Kind |Name |Type${hasUnit ? ' |Unit' : ''}${hasViewKind ? ' |View Kind' : ''}${hasInitialValue ? ' |Initial Value' : ''}${hasDescription ? ' |Description' : ''}
            
            ${fields.map(field => s`
                |${this.getFieldKinds(field).join(', ')}
                |${field.name}
                |${this.crossReference(field.type, field)}
                ${hasUnit ? `|${this.unit(field) ?? ''}` : undefined}
                ${hasViewKind ? `|${this.viewKind(field)}` : undefined}
                ${hasInitialValue ? `|${this.getShortValue(field.default) ?? ''}` : undefined}
                ${hasDescription ? `|${this.escapeDescription(this.docHelper.getDescription(field))}` : undefined}
            `).join('\n')}
            |===
            `;
    }

    private generateConstants(element: ast.WithBody): string | undefined {
        const constants = element.elements.filter(ast.isConstant);

        return constants.length > 0 ? s`
            ==== Constants
            The ${element.name} ${element.$type.toLowerCase()} provides the following constants:
            
            ${VisibilityKinds.map(v => this.generateConstantsWithVisibility(element, v)).filter(s => s !== undefined).join('\n')}
            ` : undefined;
    }

    private generateConstantsWithVisibility(element: ast.WithBody, v: VisibilityKind): string | undefined {
        const constants = element.elements.filter(ast.isConstant).filter(constant => getRealVisibility(constant) === v);
        const hasDescription = constants.some(constant => this.docHelper.getDescription(constant) !== undefined, this);
        return constants.length > 0 ? s`
                .${element.name}'s ${VisibilityKind[v]} constants
                [%autowidth.stretch]
                |===
                |Name |Type |Value${hasDescription ? ' |Description' : ''}
                
                ${constants.map(constant => s`
                    |${constant.name}
                    |${this.crossReference(constant.type, constant)}
                    |${this.getShortValue(constant.value) ?? ''}
                    ${hasDescription ? `|${this.escapeDescription(this.docHelper.getDescription(constant))}` : undefined}
                `).join('\n')}
                |===
            ` : undefined;
    }

    private generateContainers(element: ast.WithBody): string | undefined {
        const containers = element.elements.filter(ast.isContainer);
        const hasDescription = containers.some(e => this.docHelper.getDescription(e) !== undefined, this);
        return containers.length > 0 ? s`
                ==== Containers
                The ${element.name} ${element.$type.toLowerCase()} provides the following containers:
                
                .${element.name}'s containers
                [%autowidth.stretch]
                |===
                |Name |Type |Minimum |Maximum${hasDescription ? ' |Description' : ''}
                
                ${containers.map(container => {
            const lower = getLower(container);
            const upper = getUpper(container);
            return s`
                    |${container.name}
                    |${this.crossReference(container.type, container)}
                    |${this.getMultiplicityValue(lower)}
                    |${this.getMultiplicityValue(upper)}
                    ${hasDescription ? `|${this.escapeDescription(this.docHelper.getDescription(container))}` : undefined}
                `;
        }).join('\n')}
                |===
            ` : undefined;
    }


    private generateReferences(element: ast.WithBody): string | undefined {
        const references = element.elements.filter(ast.isReference);
        const hasDescription = references.some(e => this.docHelper.getDescription(e) !== undefined, this);
        return references.length > 0 ? s`
                ==== References
                The ${element.name} ${element.$type.toLowerCase()} provides the following references:
                
                .${element.name}'s references
                [%autowidth.stretch]
                |===
                |Name |Type |Minimum |Maximum${hasDescription ? ' |Description' : ''}
                
                ${references.map(reference => {
            const lower = getLower(reference);
            const upper = getUpper(reference);
            return s`
                    |${reference.name}
                    |${this.crossReference(reference.interface ?? ['?'], reference)}
                    |${this.getMultiplicityValue(lower)}
                    |${this.getMultiplicityValue(upper)}
                    ${hasDescription ? `|${this.escapeDescription(this.docHelper.getDescription(reference))}` : undefined}
                `;
        }).join('\n')}
                |===
            ` : undefined;
    }

    private generateOperations(element: ast.WithBody): string | undefined {
        const operations = element.elements.filter(ast.isOperation);
        return operations.length > 0 ? s`
                ==== Operations
                The ${element.name} ${element.$type.toLowerCase()} provides the following operations:
                
                ${operations.map(op => this.generateOperation(op)).join('\n')}
            ` : undefined;
    }

    private generateOperation(element: ast.Operation): string | undefined {

        const hasParameters = element.parameter.length > 0 || element.returnParameter !== undefined;
        const hasDefaultValue = element.parameter.some(p => p.default !== undefined);
        const hasDescription = element.parameter.some(e => this.docHelper.getDescription(e) !== undefined, this);
        return s`
        ===== Operation ${element.name}
        ${this.docHelper.getDescription(element)}
        ${hasParameters ? s`
        .${element.name}'s parameters
        [%autowidth.stretch]
        |===
        |Direction |Name |Type${hasDefaultValue ? ' |Default Value' : ''}${hasDescription ? ' |Description' : ''}
        
        ${element.parameter.map(param => s`
            |${param.direction ?? 'in'} |${param.name} |${this.crossReference(param.type, param)}${hasDefaultValue ? ` |${this.getShortValue(param.default) ?? ''}` : undefined}${hasDescription ? ` |${this.escapeDescription(this.docHelper.getDescription(param))}` : undefined}
        `).join('\n')}
        ${element.returnParameter ? s`
            |return |${element.returnParameter.name ?? 'return'} |${this.crossReference(element.returnParameter.type, element.returnParameter)}${hasDefaultValue ? ` |` : undefined}${hasDescription ? ` |${this.escapeDescription(this.docHelper.getDescription(element.returnParameter))}` : undefined}
        ` : ''}
        |===
        `: undefined}`;
    }

    private generateEventSinks(element: ast.WithBody): string | undefined {
        const eventSinks = element.elements.filter(ast.isEventSink);
        const hasDescription = eventSinks.some(e => this.docHelper.getDescription(e) !== undefined, this);
        return eventSinks.length > 0 ? s`
                ==== Event Sinks
                The ${element.name} ${element.$type.toLowerCase()} provides the following event sinks:
                
                .${element.name}'s Event Sinks
                [%autowidth.stretch]
                |===
                |Name |Type${hasDescription ? ' |Description' : ''}
                
                ${eventSinks.map(eventSink => s`
                    |${eventSink.name}
                    |${this.crossReference(eventSink.type, eventSink)}
                    ${hasDescription ? `|${this.escapeDescription(this.docHelper.getDescription(eventSink))}` : undefined}
                `).join('\n')}
                |===
            ` : undefined;
    }

    private generateEventSources(element: ast.WithBody): string | undefined {
        const eventSources = element.elements.filter(ast.isEventSource);
        const hasDescription = eventSources.some(e => this.docHelper.getDescription(e) !== undefined, this);
        return eventSources.length > 0 ? s`
                ==== Event Sources
                The ${element.name} ${element.$type.toLowerCase()} provides the following event sources:

                .${element.name}'s Event Sources
                [%autowidth.stretch]
                |===
                |Name |Type${hasDescription ? ' |Description' : ''}
                
                ${eventSources.map(eventSource => s`
                    |${eventSource.name}
                    |${this.crossReference(eventSource.type, eventSource)}
                    ${hasDescription ? `|${this.escapeDescription(this.docHelper.getDescription(eventSource))}` : undefined}
                `).join('\n')}
                |===
            ` : undefined;
    }


    private generateEntryPoints(element: ast.WithBody): string | undefined {
        const entryPoints = element.elements.filter(ast.isEntryPoint);
        const hasViewKind = entryPoints.some(p => this.attrHelper.getViewKind(p) !== undefined, this);
        const hasDescription = entryPoints.some(e => this.docHelper.getDescription(e) !== undefined, this);
        return entryPoints.length > 0 ? s`
                ==== Entry Points
                The ${element.name} ${element.$type.toLowerCase()} provides the following entry points:

                .${element.name}'s Entry Points
                [%autowidth.stretch]
                |===
                |Name${hasViewKind ? ' |View Kind' : ''}${hasDescription ? ' |Description' : ''}
                
                ${entryPoints.map(entryPoint => s`
                    |${entryPoint.name}
                    ${hasViewKind ? `|${this.viewKind(entryPoint)}` : undefined}
                    ${hasDescription ? `|${this.escapeDescription(this.docHelper.getDescription(entryPoint))}` : undefined}
                `).join('\n')}
                |===
            ` : undefined;
    }

    private generateProperties(element: ast.WithBody): string | undefined {
        const properties = element.elements.filter(ast.isProperty);
        return properties.length > 0 ? s`
                ==== Properties
                The ${element.name} ${element.$type.toLowerCase()} provides the following properties:
                
                ${VisibilityKinds.map(v => this.generatePropertiesWithVisibility(element, v)).filter(s => s !== undefined).join('\n')}
            ` : undefined;
    }

    private generatePropertiesWithVisibility(element: ast.WithBody, v: VisibilityKind): string | undefined {
        const properties = element.elements.filter(ast.isProperty).filter(property => getRealVisibility(property) === v);
        const hasCategory = properties.some(property => this.docHelper.getPropertyCategory(property) !== undefined);
        const hasViewKind = properties.some(p => this.attrHelper.getViewKind(p) !== undefined, this);
        const hasDescription = properties.some(property => this.docHelper.getDescription(property) !== undefined);
        return properties.length > 0 ? s`
                .${element.name}'s ${VisibilityKind[v]} properties
                [%autowidth.stretch]
                |===
                |Name |Type${hasCategory ? ' |Category' : ''}${hasViewKind ? ' |View Kind' : ''}${hasDescription ? ' |Description' : ''}
                
                ${properties.map(property => s`
                    |${property.name}
                    |${this.crossReference(property.type, property)}
                    ${hasCategory ? `|${this.docHelper.getPropertyCategory(property) ?? ''}` : undefined}
                    ${hasViewKind ? `|${this.viewKind(property)}` : undefined}
                    ${hasDescription ? `|${this.escapeDescription(this.docHelper.getDescription(property))}` : undefined}
                `).join('\n')}
                |===
            ` : undefined;
    }

    private generateAssociations(element: ast.WithBody): string | undefined {
        const associations = element.elements.filter(ast.isAssociation);
        return associations.length > 0 ? s`
                ==== Associations
                The ${element.name} ${element.$type.toLowerCase()} provides the following associations:
                
                ${VisibilityKinds.map(v => this.generateAssociationsWithVisibility(element, v)).join('\n')}
            ` : undefined;
    }

    private generateAssociationsWithVisibility(element: ast.WithBody, v: VisibilityKind): string | undefined {
        const associations = element.elements.filter(ast.isAssociation).filter(association => getRealVisibility(association) === v);
        const hasDescription = associations.some(association => this.docHelper.getDescription(association) !== undefined);
        return associations.length > 0 ? s`
                .${element.name}'s ${VisibilityKind[v]} associations
                [%autowidth.stretch]
                |===
                |Name |Type${hasDescription ? ' |Description' : ''}
                
                ${associations.map(association => s`
                    |${association.name}
                    |${this.crossReference(association.type, association)}
                    ${hasDescription ? `|${this.escapeDescription(this.docHelper.getDescription(association))}` : undefined}
                `).join('\n')}
                |===
            ` : undefined;
    }

}
