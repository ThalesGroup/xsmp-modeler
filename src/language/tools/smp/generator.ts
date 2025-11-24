import * as ast from '../../generated/ast.js';
import type * as Catalogue from './model/catalogue.js';
import type * as Elements from './model/elements.js';
import type * as Types from './model/types.js';
import type * as Package from './model/package.js';
import type * as xlink from './model/xlink.js';
import type * as Configuration from './model/configuration.js';
import * as XsmpUtils from '../../utils/xsmp-utils.js';

import * as Duration from '../../utils/duration.js';

import type { AstNode, JSDocParagraph, Reference, URI } from 'langium';
import { AstUtils, UriUtils } from 'langium';
import * as fs from 'fs';
import * as Solver from '../../utils/solver.js';
import { isGeneratedBy, type TaskAcceptor, type XsmpGenerator } from '../../generator/generator.js';
import { create } from 'xmlbuilder2';
import { type FloatingPTK, type IntegralPTK, PTK } from '../../utils/primitive-type-kind.js';
import { VisibilityKind } from '../../utils/visibility-kind.js';
import { type XsmpSharedServices } from '../../xsmp-module.js';
import { type DocumentationHelper } from '../../utils/documentation-helper.js';
import { type AttributeHelper } from '../../utils/attribute-helper.js';
import { getCopyrightNotice } from '../../generator/copyright-notice-provider.js';
import { xsmpVersion } from '../../version.js';

export class SmpGenerator implements XsmpGenerator {

    protected readonly docHelper: DocumentationHelper;
    protected readonly attrHelper: AttributeHelper;
    protected readonly smdlGenFolder = 'smdl-gen';

    constructor(services: XsmpSharedServices) {
        this.docHelper = services.DocumentationHelper;
        this.attrHelper = services.AttributeHelper;
    }
    clean(projectUri: URI) {
        fs.rmSync(UriUtils.joinPath(projectUri, this.smdlGenFolder).fsPath, { recursive: true, force: true });
    }
    generate(node: AstNode, projectUri: URI, acceptTask: TaskAcceptor) {
        const notice = this.safeXmlComment(getCopyrightNotice(node.$document));
        if (ast.isCatalogue(node)) {
            acceptTask(() => this.generateCatalogue(node, projectUri, notice));
            acceptTask(() => this.generatePackage(node, projectUri, notice));
        }
        else if (ast.isConfiguration(node)) {
            acceptTask(() => this.generateConfiguration(node, projectUri, notice));

        }
    }
    protected getId(element: ast.NamedElement | ast.ReturnParameter): string {
        return this.docHelper.getId(element) ?? XsmpUtils.fqn(element);
    }

    protected convertNamedElement(element: ast.NamedElement): Elements.NamedElement {
        return {
            '@Id': this.getId(element),
            '@Name': element.name,
            Description: this.docHelper.getDescription(element),
            Metadata: element.attributes.map(this.convertMetadata, this),
        };
    }
    protected convertMetadata(element: ast.Metadata): Elements.Metadata {
        return this.convertAttribute(element as ast.Attribute);
    }
    protected convertAttribute(element: ast.Attribute): Types.Attribute {
        return {
            '@xsi:type': 'Types:Attribute',
            '@Id': `${this.getId(element.$container)}.${element.type.ref?.name}.${element.$containerIndex}`,
            '@Name': element.type.ref?.name ?? '',
            Type: this.convertXlink(element.type, element),
            Value: element.value ? this.convertTypedValue((element.type.ref as ast.AttributeType).type.ref, element.value) :
                this.convertTypedValue((element.type.ref as ast.AttributeType).type.ref, (element.type.ref as ast.AttributeType).default!),
        };
    }
    protected convertVisibilityKind(element: ast.VisibilityElement): Types.VisibilityKind | undefined {
        switch (XsmpUtils.getVisibility(element)) {
            case VisibilityKind.private: return 'private';
            case VisibilityKind.protected: return 'protected';
            case VisibilityKind.public: return 'public';
            default: return undefined;
        }
    }

    protected convertVisibilityElement(element: ast.VisibilityElement): Types.VisibilityElement {
        return {
            ...this.convertNamedElement(element),
            '@Visibility': this.convertVisibilityKind(element),
        };
    }

    protected convertNamespace(namespace: ast.Namespace): Catalogue.Namespace {
        return {
            ...this.convertNamedElement(namespace),
            Namespace: namespace.elements.filter(ast.isNamespace).map(this.convertNamespace, this),
            Type: namespace.elements.filter(ast.isType).map(this.convertTypeDispatch, this),
        };
    }

    protected convertTypeDispatch(type: ast.Type): Types.Type {

        switch (type.$type) {
            case ast.Structure:
                return this.convertStructure(type as ast.Structure);
            case ast.Class:
                return this.convertClass(type as ast.Class);
            case ast.Exception:
                return this.convertException(type as ast.Exception);
            case ast.PrimitiveType:
                return this.convertType(type, 'Types:PrimitiveType');
            case ast.ArrayType:
                return this.convertArrayType(type as ast.ArrayType);
            case ast.AttributeType:
                return this.convertAttributeType(type as ast.AttributeType);
            case ast.Enumeration:
                return this.convertEnumeration(type as ast.Enumeration);
            case ast.EventType:
                return this.convertEventType(type as ast.EventType);
            case ast.Float:
                return this.convertFloat(type as ast.Float);
            case ast.Integer:
                return this.convertInteger(type as ast.Integer);
            case ast.Service:
            case ast.Model:
                return this.convertComponent(type as ast.Component);
            case ast.Interface:
                return this.convertInterface(type as ast.Interface);
            case ast.NativeType:
                return this.convertNativeType(type as ast.NativeType);
            case ast.StringType:
                return this.convertStringType(type as ast.StringType);
            case ast.ValueReference:
                return this.convertValueReference(type as ast.ValueReference);
        }
        throw Error(`Unsupported type ${type.$type}`);
    }

    protected convertType(type: ast.Type, id: string): Types.Type {

        return {
            '@xsi:type': id,
            ...this.convertVisibilityElement(type),
            '@Uuid': this.docHelper.getUuid(type)?.toString().trim() ?? '',
        };
    }
    protected convertValueReference(valueReference: ast.ValueReference): Types.ValueReference {

        return {
            ...this.convertType(valueReference, 'Types:ValueReference'),
            Type: this.convertXlink(valueReference.type, valueReference),
        };
    }
    protected convertStringType(string: ast.StringType): Types.String {

        return {
            ...this.convertType(string, 'Types:String'),
            '@Length': Solver.getValue(string.length)?.integralValue(PTK.Int64)?.getValue() ?? BigInt(0),
        };
    }

    protected convertNativeType(nativeType: ast.NativeType): Types.NativeType {

        return {
            ...this.convertType(nativeType, 'Types:NativeType'),
            Platform: [{
                '@Name': 'cpp',
                '@Type': this.docHelper.getNativeType(nativeType) ?? '',
                '@Namespace': this.docHelper.getNativeNamespace(nativeType),
                '@Location': this.docHelper.getNativeLocation(nativeType),
            }],
        };
    }
    protected convertInterface(inter: ast.Interface): Catalogue.Interface {

        return {
            ...this.convertType(inter, 'Catalogue:Interface'),
            Constant: inter.elements.filter(ast.isConstant).map(this.convertConstant, this),
            Property: inter.elements.filter(ast.isProperty).map(this.convertProperty, this),
            Operation: inter.elements.filter(ast.isOperation).map(this.convertOperation, this),
            Base: inter.base.map(i => this.convertXlink(i, inter), this),
        };
    }
    protected convertComponent(component: ast.Component): Catalogue.Component {

        return {
            ...this.convertType(component, `Catalogue:${component.$type}`),
            Constant: component.elements.filter(ast.isConstant).map(this.convertConstant, this),
            Property: component.elements.filter(ast.isProperty).map(this.convertProperty, this),
            Operation: component.elements.filter(ast.isOperation).map(this.convertOperation, this),
            Base: component.base ? this.convertXlink(component.base, component) : undefined,
            Interface: component.interface.map(i => this.convertXlink(i, component), this),
            EntryPoint: component.elements.filter(ast.isEntryPoint).map(this.convertEntryPoint, this),
            EventSink: component.elements.filter(ast.isEventSink).map(this.convertEventSink, this),
            EventSource: component.elements.filter(ast.isEventSource).map(this.convertEventSource, this),
            Field: component.elements.filter(ast.isField).map(this.convertField, this),
            Association: component.elements.filter(ast.isAssociation).map(this.convertAssociation, this),
            Container: component.elements.filter(ast.isContainer).map(this.convertContainer, this),
            Reference: component.elements.filter(ast.isReference).map(this.convertReference, this),
        };
    }
    protected convertProperty(property: ast.Property): Types.Property {
        return {
            ...this.convertVisibilityElement(property),
            Type: this.convertXlink(property.type, property),
            AttachedField: property.attachedField ? this.convertXlink(property.attachedField, property) : undefined,
            GetRaises: property.getRaises.map(e => this.convertXlink(e, property)),
            SetRaises: property.setRaises.map(e => this.convertXlink(e, property)),
            '@Access': XsmpUtils.getAccessKind(property),
            '@Category': this.docHelper.getPropertyCategory(property),
        };
    }
    protected convertReference(reference: ast.Reference): Catalogue.Reference {
        return {
            ...this.convertNamedElement(reference),
            Interface: this.convertXlink(reference.interface, reference),
            '@Lower': XsmpUtils.getLower(reference),
            '@Upper': XsmpUtils.getUpper(reference),
        };
    }
    protected convertEventSink(eventSink: ast.EventSink): Catalogue.EventSink {
        return {
            ...this.convertNamedElement(eventSink),
            Type: this.convertXlink(eventSink.type, eventSink),
        };
    }
    protected convertEventSource(eventSource: ast.EventSource): Catalogue.EventSource {
        return {
            ...this.convertNamedElement(eventSource),
            Type: this.convertXlink(eventSource.type, eventSource),
            '@Multicast': this.docHelper.isMulticast(eventSource) ? undefined : false,
        };
    }
    protected convertFloat(float: ast.Float): Types.Float {
        const range = float.range ? false : undefined;
        return {
            ...this.convertType(float, 'Types:Float'),
            PrimitiveType: float.primitiveType ? this.convertXlink(float.primitiveType, float) : undefined,
            '@Minimum': Solver.getValue(float.minimum)?.floatValue(XsmpUtils.getPTK(float) as FloatingPTK)?.getValue(),
            '@Maximum': Solver.getValue(float.maximum)?.floatValue(XsmpUtils.getPTK(float) as FloatingPTK)?.getValue(),
            '@MinInclusive': float.range === '...' || float.range === '..<' ? true : range,
            '@MaxInclusive': float.range === '...' || float.range === '<..' ? true : range,
            '@Unit': this.docHelper.getUnit(float),
        };
    }
    protected convertInteger(integer: ast.Integer): Types.Integer {

        return {
            ...this.convertType(integer, 'Types:Integer'),
            PrimitiveType: integer.primitiveType ? this.convertXlink(integer.primitiveType, integer) : undefined,
            '@Minimum': Solver.getValue(integer.minimum)?.integralValue(XsmpUtils.getPTK(integer) as IntegralPTK)?.getValue(),
            '@Maximum': Solver.getValue(integer.maximum)?.integralValue(XsmpUtils.getPTK(integer) as IntegralPTK)?.getValue(),
            '@Unit': this.docHelper.getUnit(integer),
        };
    }
    protected convertEventType(eventType: ast.EventType): Catalogue.EventType {

        return {
            ...this.convertType(eventType, 'Catalogue:EventType'),
            EventArgs: eventType.eventArgs ? this.convertXlink(eventType.eventArgs, eventType) : undefined,
        };
    }
    protected convertEnumeration(enumeration: ast.Enumeration): Types.Enumeration {

        return {
            ...this.convertType(enumeration, 'Types:Enumeration'),
            Literal: enumeration.literal.map(this.convertEnumerationLiteral, this),
        };
    }
    protected convertEnumerationLiteral(literal: ast.EnumerationLiteral): Types.EnumerationLiteral {

        return {
            ...this.convertNamedElement(literal),
            '@Value': Solver.getValue(literal.value)?.integralValue(PTK.Int32)?.getValue() ?? BigInt(0),
        };
    }
    private toDateTime(expression: ast.Expression): string {
        const dateTime = Solver.getValue(expression)?.integralValue(PTK.DateTime)?.getValue() ?? BigInt(0);
        const str = new Date(Number(dateTime / BigInt(1_000_000_000)) * 1_000).toISOString();
        const ns = dateTime % BigInt(1_000_000_000);
        return str.replace('.000', '.' + ns.toString().padStart(9, '0'));
    }
    private toDuration(expression: ast.Expression): string {
        const duration = Solver.getValue(expression)?.integralValue(PTK.Duration)?.getValue() ?? BigInt(0);
        return Duration.serialize(duration);
    }
    private toEnumerationValue(expression: ast.Expression): bigint | undefined {
        return Solver.getValue(Solver.getValue(expression)?.enumerationLiteral()?.getValue().value ?? expression)?.integralValue(PTK.Int32)?.getValue();
    }
    private toString8(expression: ast.Expression): string {
        return XsmpUtils.escape(Solver.getValue(expression)?.stringValue()?.getValue());
    }

    protected convertTypedValue(type: ast.Type | undefined, expression: ast.Expression): Types.Value {

        if (type) {
            switch (XsmpUtils.getPTK(type)) {
                case PTK.Bool: return { '@xsi:type': 'Types:BoolValue', '@Value': Solver.getValue(expression)?.boolValue()?.getValue() } as Types.BoolValue;
                case PTK.Char8: return { '@xsi:type': 'Types:Char8Value', '@Value': XsmpUtils.escape(Solver.getValue(expression)?.charValue()?.getValue()) } as Types.Char8Value;
                case PTK.Float32: return { '@xsi:type': 'Types:Float32Value', '@Value': Solver.getValue(expression)?.floatValue(PTK.Float32)?.getValue() } as Types.Float32Value;
                case PTK.Float64: return { '@xsi:type': 'Types:Float64Value', '@Value': Solver.getValue(expression)?.floatValue(PTK.Float64)?.getValue() } as Types.Float64Value;
                case PTK.Int8: return { '@xsi:type': 'Types:Int8Value', '@Value': Solver.getValue(expression)?.integralValue(PTK.Int8)?.getValue() } as Types.Int8Value;
                case PTK.Int16: return { '@xsi:type': 'Types:Int16Value', '@Value': Solver.getValue(expression)?.integralValue(PTK.Int16)?.getValue() } as Types.Int16Value;
                case PTK.Int32: return { '@xsi:type': 'Types:Int32Value', '@Value': Solver.getValue(expression)?.integralValue(PTK.Int32)?.getValue() } as Types.Int32Value;
                case PTK.Int64: return { '@xsi:type': 'Types:Int64Value', '@Value': Solver.getValue(expression)?.integralValue(PTK.Int64)?.getValue() } as Types.Int64Value;
                case PTK.UInt8: return { '@xsi:type': 'Types:UInt8Value', '@Value': Solver.getValue(expression)?.integralValue(PTK.UInt8)?.getValue() } as Types.UInt8Value;
                case PTK.UInt16: return { '@xsi:type': 'Types:UInt16Value', '@Value': Solver.getValue(expression)?.integralValue(PTK.UInt16)?.getValue() } as Types.UInt16Value;
                case PTK.UInt32: return { '@xsi:type': 'Types:UInt32Value', '@Value': Solver.getValue(expression)?.integralValue(PTK.UInt32)?.getValue() } as Types.UInt32Value;
                case PTK.UInt64: return { '@xsi:type': 'Types:UInt64Value', '@Value': Solver.getValue(expression)?.integralValue(PTK.UInt64)?.getValue() } as Types.UInt64Value;
                case PTK.Enum: return { '@xsi:type': 'Types:EnumerationValue', '@Value': this.toEnumerationValue(expression), '@Literal': Solver.getValue(expression)?.enumerationLiteral()?.getValue().name } as Types.EnumerationValue;
                case PTK.DateTime: return { '@xsi:type': 'Types:DateTimeValue', '@Value': this.toDateTime(expression) } as Types.DateTimeValue;
                case PTK.Duration: return { '@xsi:type': 'Types:DurationValue', '@Value': this.toDuration(expression) } as Types.DurationValue;
                case PTK.String8: return { '@xsi:type': 'Types:String8Value', '@Value': this.toString8(expression) } as Types.String8Value;
                case PTK.None:
                    if (ast.isCollectionLiteral(expression)) {
                        if (ast.isArrayType(type)) {
                            return this.convertArrayValue(type, expression);
                        }
                        else if (ast.isStructure(type)) {
                            return this.convertStructureValue(type, expression);
                        }
                    }
            }
        }

        return { '@xsi:type': 'Types:Value' };
    }
    protected convertArrayValue(type: ast.ArrayType, expression: ast.CollectionLiteral): Types.Value {

        if (type.itemType.ref) {
            switch (XsmpUtils.getPTK(type.itemType.ref)) {
                case PTK.Bool: return { '@xsi:type': 'Types:BoolArrayValue', ItemValue: expression.elements.map(e => ({ '@Value': Solver.getValue(e)?.boolValue()?.getValue() })) } as Types.BoolArrayValue;
                case PTK.Char8: return { '@xsi:type': 'Types:Char8ArrayValue', ItemValue: expression.elements.map(e => ({ '@Value': XsmpUtils.escape(Solver.getValue(e)?.charValue()?.getValue()) })) } as Types.Char8ArrayValue;
                case PTK.Float32: return { '@xsi:type': 'Types:Float32ArrayValue', ItemValue: expression.elements.map(e => ({ '@Value': Solver.getValue(e)?.floatValue(PTK.Float32)?.getValue() })) } as Types.Float32ArrayValue;
                case PTK.Float64: return { '@xsi:type': 'Types:Float64ArrayValue', ItemValue: expression.elements.map(e => ({ '@Value': Solver.getValue(e)?.floatValue(PTK.Float64)?.getValue() })) } as Types.Float64ArrayValue;
                case PTK.Int8: return { '@xsi:type': 'Types:Int8ArrayValue', ItemValue: expression.elements.map(e => ({ '@Value': Solver.getValue(e)?.integralValue(PTK.Int8)?.getValue() })) } as Types.Int8ArrayValue;
                case PTK.Int16: return { '@xsi:type': 'Types:Int16ArrayValue', ItemValue: expression.elements.map(e => ({ '@Value': Solver.getValue(e)?.integralValue(PTK.Int16)?.getValue() })) } as Types.Int16ArrayValue;
                case PTK.Int32: return { '@xsi:type': 'Types:Int32ArrayValue', ItemValue: expression.elements.map(e => ({ '@Value': Solver.getValue(e)?.integralValue(PTK.Int32)?.getValue() })) } as Types.Int32ArrayValue;
                case PTK.Int64: return { '@xsi:type': 'Types:Int64ArrayValue', ItemValue: expression.elements.map(e => ({ '@Value': Solver.getValue(e)?.integralValue(PTK.Int64)?.getValue() })) } as Types.Int64ArrayValue;
                case PTK.UInt8: return { '@xsi:type': 'Types:UInt8ArrayValue', ItemValue: expression.elements.map(e => ({ '@Value': Solver.getValue(e)?.integralValue(PTK.UInt8)?.getValue() })) } as Types.UInt8ArrayValue;
                case PTK.UInt16: return { '@xsi:type': 'Types:UInt16ArrayValue', ItemValue: expression.elements.map(e => ({ '@Value': Solver.getValue(e)?.integralValue(PTK.UInt16)?.getValue() })) } as Types.UInt16ArrayValue;
                case PTK.UInt32: return { '@xsi:type': 'Types:UInt32ArrayValue', ItemValue: expression.elements.map(e => ({ '@Value': Solver.getValue(e)?.integralValue(PTK.UInt32)?.getValue() })) } as Types.UInt32ArrayValue;
                case PTK.UInt64: return { '@xsi:type': 'Types:UInt64ArrayValue', ItemValue: expression.elements.map(e => ({ '@Value': Solver.getValue(e)?.integralValue(PTK.UInt64)?.getValue() })) } as Types.UInt64ArrayValue;
                case PTK.Enum: return { '@xsi:type': 'Types:EnumerationArrayValue', ItemValue: expression.elements.map(e => ({ '@Value': this.toEnumerationValue(e), '@Literal': Solver.getValue(expression)?.enumerationLiteral()?.getValue().name })) } as Types.EnumerationArrayValue;
                case PTK.DateTime: return { '@xsi:type': 'Types:DateTimeArrayValue', ItemValue: expression.elements.map(e => ({ '@Value': this.toDateTime(e) })) } as Types.DateTimeArrayValue;
                case PTK.Duration: return { '@xsi:type': 'Types:DurationArrayValue', ItemValue: expression.elements.map(e => ({ '@Value': this.toDuration(e) })) } as Types.DurationArrayValue;
                case PTK.String8: return { '@xsi:type': 'Types:String8ArrayValue', ItemValue: expression.elements.map(e => ({ '@Value': this.toString8(e) })) } as Types.String8ArrayValue;
            }
        }
        return { '@xsi:type': 'Types:ArrayValue', ItemValue: expression.elements.map(e => this.convertTypedValue(type.itemType.ref, e), this) } as Types.ArrayValue;
    }

    protected convertStructureValue(type: ast.Structure, expression: ast.CollectionLiteral): Types.StructureValue {
        const fields = this.attrHelper.getAllFields(type).toArray();
        return { '@xsi:type': 'Types:StructureValue', FieldValue: expression.elements.map((e, index) => this.convertTypedValue(fields.at(index)?.type.ref, e), this) };
    }

    protected convertAttributeType(attributeType: ast.AttributeType): Types.AttributeType {

        return {
            ...this.convertType(attributeType, 'Types:AttributeType'),
            Type: this.convertXlink(attributeType.type, attributeType),
            Default: attributeType.default ? this.convertTypedValue(attributeType.type.ref, attributeType.default) : undefined,
            '@AllowMultiple': this.docHelper.allowMultiple(attributeType),
            Usage: this.docHelper.getUsages(attributeType)?.map(t => t.toString()),
        };
    }
    protected convertArrayType(arrayType: ast.ArrayType): Types.Array {

        return {
            ...this.convertType(arrayType, 'Types:Array'),
            ItemType: this.convertXlink(arrayType.itemType, arrayType),
            '@Size': Solver.getValue(arrayType.size)?.integralValue(PTK.Int64)?.getValue() ?? BigInt(0),
        };
    }
    protected convertStructure(structure: ast.Structure): Types.Structure {

        return {
            ...this.convertType(structure, 'Types:Structure'),
            Constant: structure.elements.filter(ast.isConstant).map(this.convertConstant, this),
            Field: structure.elements.filter(ast.isField).map(this.convertField, this),
        };
    }
    protected convertClass(type: ast.Class): Types.Class {

        return {
            ...this.convertStructure(type),
            '@xsi:type': 'Types:Class',
            Base: type.base ? this.convertXlink(type.base, type) : undefined,
            Property: type.elements.filter(ast.isProperty).map(this.convertProperty, this),
            Operation: type.elements.filter(ast.isOperation).map(this.convertOperation, this),
            Association: type.elements.filter(ast.isAssociation).map(this.convertAssociation, this),
            '@Abstract': XsmpUtils.isAbstractType(type) ? true : undefined,
        };
    }
    protected convertException(type: ast.Exception): Types.Exception {

        return {
            ...this.convertClass(type),
            '@xsi:type': 'Types:Exception',
        };
    }
    protected convertXlink(link: Reference<ast.NamedElement>, context?: AstNode): xlink.Xlink {
        if (link.ref) {
            const refDoc = AstUtils.getDocument(link.ref);
            const doc = context ? AstUtils.getDocument(context) : undefined;

            let href = `#${this.docHelper.getId(link.ref) ?? XsmpUtils.fqn(link.ref)}`;
            if (doc !== refDoc) {
                let fileName = UriUtils.basename(refDoc.uri).replace(/\.xsmp([a-z0-9]+)$/i, '.smp$1');
                if (fileName === 'ecss.smp@ECSS_SMP_2020.smpcat') { fileName = 'http://www.ecss.nl/smp/2019/Smdl'; }
                if (fileName === 'ecss.smp@ECSS_SMP_2025.smpcat') { fileName = 'http://www.ecss.nl/smp/2019/Smdl'; }
                href = fileName + href;
            }

            return { '@xlink:title': link.ref.name, '@xlink:href': href };

        }
        return { '@xlink:title': link.$refText, '@xlink:href': `#${link.$refText}` };

    }
    protected convertOperation(operation: ast.Operation): Types.Operation {
        const id = this.docHelper.getId(operation) ?? XsmpUtils.fqn(operation) + (operation.parameter.length > 0 ? '-' : '') + operation.parameter.map(p => p.type.ref?.name).join('-');
        return {
            ...this.convertVisibilityElement(operation),
            '@Id': id,
            Parameter: operation.returnParameter ?
                operation.parameter.map(p => this.convertParameter(p, id), this).concat(this.convertReturnParameter(operation.returnParameter, id)) :
                operation.parameter.map(p => this.convertParameter(p, id), this),
            RaisedException: operation.raisedException.map(e => this.convertXlink(e, operation)),
        };
    }
    protected convertReturnParameter(parameter: ast.ReturnParameter, id: string): Types.Parameter {
        return {
            '@Id': `${id}.${parameter.name ?? 'return'}`,
            '@Name': parameter.name ?? 'return',
            Description: this.docHelper.getDescription(parameter),
            Metadata: parameter.attributes.map(this.convertMetadata, this),
            Type: this.convertXlink(parameter.type, parameter),
            '@Direction': 'return',
        };
    }
    protected convertParameter(parameter: ast.Parameter, id: string): Types.Parameter {
        return {
            '@Id': `${id}.${parameter.name}`,
            '@Name': parameter.name,
            Description: this.docHelper.getDescription(parameter),
            Metadata: parameter.attributes.map(this.convertMetadata, this),
            Type: this.convertXlink(parameter.type, parameter),
            Default: parameter.default ? this.convertTypedValue(parameter.type.ref, parameter.default) : undefined,
            '@Direction': parameter.direction,
        };
    }
    protected convertContainer(container: ast.Container): Catalogue.Container {
        return {
            ...this.convertNamedElement(container),
            Type: this.convertXlink(container.type, container),
            DefaultComponent: container.defaultComponent ? this.convertXlink(container.defaultComponent, container) : undefined,
            '@Lower': XsmpUtils.getLower(container),
            '@Upper': XsmpUtils.getUpper(container),
        };
    }
    protected convertEntryPoint(entryPoint: ast.EntryPoint): Catalogue.EntryPoint {
        return {
            ...this.convertNamedElement(entryPoint),
            Input: entryPoint.input.map(e => this.convertXlink(e, entryPoint)),
            Output: entryPoint.output.map(e => this.convertXlink(e, entryPoint)),
        };
    }
    protected convertAssociation(association: ast.Association): Types.Association {
        return {
            ...this.convertVisibilityElement(association),
            Type: this.convertXlink(association.type, association),
        };
    }

    protected convertConstant(constant: ast.Constant): Types.Constant {
        return {
            ...this.convertVisibilityElement(constant),
            Type: this.convertXlink(constant.type, constant),
            Value: this.convertTypedValue(constant.type.ref, constant.value),
        };
    }
    protected convertField(field: ast.Field): Types.Field {
        return {
            ...this.convertVisibilityElement(field),
            Type: this.convertXlink(field.type, field),
            Default: field.default ? this.convertTypedValue(field.type.ref, field.default) : undefined,
            '@State': XsmpUtils.isState(field) ? undefined : false,
            '@Input': XsmpUtils.isInput(field) ? true : undefined,
            '@Output': XsmpUtils.isOutput(field) ? true : undefined,

        };
    }

    private convertDate(date: JSDocParagraph | undefined): string | undefined {
        if (!date) {
            return undefined;
        }
        const value = Date.parse(date.toString().trim());
        if (isNaN(value)) {
            return undefined;
        }
        return new Date(value).toISOString();
    }

    protected async convertCatalogue(catalogue: ast.Catalogue): Promise<Catalogue.Catalogue> {
        const id = this.docHelper.getId(catalogue) ?? `_${XsmpUtils.fqn(catalogue)}`;

        return {
            '@xmlns:Elements': 'http://www.ecss.nl/smp/2019/Core/Elements',
            '@xmlns:Types': 'http://www.ecss.nl/smp/2019/Core/Types',
            '@xmlns:Catalogue': 'http://www.ecss.nl/smp/2019/Smdl/Catalogue',
            '@xmlns:xsd': 'http://www.w3.org/2001/XMLSchema',
            '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
            '@xmlns:xlink': 'http://www.w3.org/1999/xlink',
            '@Id': id,
            '@Name': catalogue.name,
            '@Title': this.docHelper.getTitle(catalogue),
            '@Date': this.convertDate(this.docHelper.getDate(catalogue)),
            '@Creator': this.docHelper.getCreator(catalogue),
            '@Version': this.docHelper.getVersion(catalogue),
            Description: this.docHelper.getDescription(catalogue),
            Metadata: catalogue.attributes.map(this.convertMetadata, this),
            Namespace: catalogue.elements.map(this.convertNamespace, this),
        };
    }
    protected async convertPackage(catalogue: ast.Catalogue): Promise<Package.Package> {
        const id = this.docHelper.getId(catalogue) ?? `_${XsmpUtils.fqn(catalogue)}`,
            doc = AstUtils.getDocument(catalogue),
            dependencies = [...new Set(doc.references.filter(e => e.ref && !ast.isInterface(e.ref)).map(e => AstUtils.getDocument(e.ref!).parseResult.value).filter(ast.isCatalogue)
                .filter(e => e !== catalogue && e.name !== 'ecss_smp_smp'))].sort((l, r) => l.name.localeCompare(r.name));
        return {
            '@xmlns:Elements': 'http://www.ecss.nl/smp/2019/Core/Elements',
            '@xmlns:Types': 'http://www.ecss.nl/smp/2019/Core/Types',
            '@xmlns:Catalogue': 'http://www.ecss.nl/smp/2019/Smdl/Catalogue',
            '@xmlns:Package': 'http://www.ecss.nl/smp/2019/Smdl/Package',
            '@xmlns:xsd': 'http://www.w3.org/2001/XMLSchema',
            '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
            '@xmlns:xlink': 'http://www.w3.org/1999/xlink',
            '@Id': id,
            '@Name': catalogue.name,
            '@Title': this.docHelper.getTitle(catalogue),
            '@Date': this.convertDate(this.docHelper.getDate(catalogue)),
            '@Creator': this.docHelper.getCreator(catalogue),
            '@Version': this.docHelper.getVersion(catalogue),
            Description: this.docHelper.getDescription(catalogue),
            Metadata: catalogue.attributes.map(this.convertMetadata, this),
            Implementation: AstUtils.streamAllContents(catalogue).filter(ast.isType).filter(e => !ast.isInterface(e)).map(e =>
                this.convertXlink({ ref: e, $refText: e.name })).toArray(),
            Dependency: dependencies.map(e => ({ '@xlink:title': e.name, '@xlink:href': `${UriUtils.basename(AstUtils.getDocument(e).uri).replace(/\.xsmpcat$/, '.smppkg')}#${this.docHelper.getId(e) ?? '_' + XsmpUtils.fqn(e)}` }), this),
        };
    }
    protected generatedBy(): string | undefined {
        if (isGeneratedBy())
            return `Generated By SmpTool-${xsmpVersion}`;
        return undefined;
    }
    public async doGenerateCatalogue(catalogue: ast.Catalogue, notice: string | undefined): Promise<string> {

        const obj = {
            '!notice': notice,
            '!generatedBy': this.generatedBy(),
            'Catalogue:Catalogue': await this.convertCatalogue(catalogue),
        },
            doc = create({ version: '1.0', encoding: 'UTF-8' }, obj);

        return doc.end({ prettyPrint: true });
    }

    private safeXmlComment(input: string | undefined): string | undefined {
        if (!input) return undefined;
        // an XML comment cannot contain a series of two hyphens (--) or end with a hyphen adjacent to the closing tag
        let safeComment = input.replace(/-{2,}/g, match => '*'.repeat(match.length));
        if (safeComment.endsWith('-')) {
            safeComment += ' ';
        }
        return safeComment;
    }

    async generateConfiguration(configuration: ast.Configuration, projectUri: URI, notice: string | undefined): Promise<void> {
        const outputDir = await this.createOutputDir(projectUri);
        const smpcatFile = UriUtils.joinPath(outputDir, UriUtils.basename(configuration.$document?.uri as URI).replace(/\.xsmpcfg$/, '.smpcfg'));
        fs.promises.writeFile(smpcatFile.fsPath, await this.doGenerateConfiguration(configuration, notice));

    }
    async doGenerateConfiguration(configuration: ast.Configuration, notice: string | undefined): Promise<string> {
        const obj = {
            '!notice': notice,
            '!generatedBy': this.generatedBy(),
            'Configuration:Configuration': await this.convertConfiguration(configuration),
        },
            doc = create({ version: '1.0', encoding: 'UTF-8' }, obj);
        return doc.end({ prettyPrint: true });
    }


    protected async convertConfiguration(configuration: ast.Configuration): Promise<Configuration.Configuration> {
        const id = this.docHelper.getId(configuration) ?? `_${XsmpUtils.fqn(configuration)}`;
        return {
            '@xmlns:Elements': 'http://www.ecss.nl/smp/2019/Core/Elements',
            '@xmlns:Configuration': 'http://www.ecss.nl/smp/2019/Smdl/Configuration',
            '@xmlns:xsd': 'http://www.w3.org/2001/XMLSchema',
            '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
            '@xmlns:xlink': 'http://www.w3.org/1999/xlink',
            '@Id': id,
            '@Name': configuration.name,
            '@Title': this.docHelper.getTitle(configuration),
            '@Date': this.convertDate(this.docHelper.getDate(configuration)),
            '@Creator': this.docHelper.getCreator(configuration),
            '@Version': this.docHelper.getVersion(configuration),
            Description: this.docHelper.getDescription(configuration),
            Metadata: configuration.attributes.map(this.convertMetadata, this),
            Include: configuration.elements.filter(ast.isConfigurationUsage).map( this.convertConfigurationUsage, this),
            Component: configuration.elements.filter(ast.isComponentConfiguration).map(this.convertComponentConfiguration, this),
        };
    }
    convertComponentConfiguration(component: ast.ComponentConfiguration): Configuration.ComponentConfiguration {
        return {
            Path: component.name,
            Include: component.elements.filter(ast.isConfigurationUsage).map(this.convertConfigurationUsage, this),
            Component: component.elements.filter(ast.isComponentConfiguration).map(this.convertComponentConfiguration, this),
            FieldValue: component.elements.filter(ast.isValue).map(this.convertValue, this),
        };
    }

    convertValue(value: ast.Value): Types.Value {
        switch (value.$type) {
            case 'BoolValue': return { '@xsi:type': 'Types:BoolValue', '@Value': (value as ast.BoolValue).value } as Types.BoolValue;
            case 'Char8Value': return { '@xsi:type': 'Types:Char8Value', '@Value': (value as ast.Char8Value).value } as Types.Char8Value;
            case 'DateTimeValue': return { '@xsi:type': 'Types:DateTimeValue', '@Value': (value as ast.DateTimeValue).value.slice(1,-3) } as Types.DateTimeValue;
            case 'DurationValue': return { '@xsi:type': 'Types:DurationValue', '@Value': (value as ast.DurationValue).value.slice(1,-2) } as Types.DurationValue;
            case 'Float32Value': return { '@xsi:type': 'Types:Float32Value', '@Value': parseFloat((value as ast.Float32Value).value) } as Types.Float32Value;
            case 'Float64Value': return { '@xsi:type': 'Types:Float64Value', '@Value': parseFloat((value as ast.Float64Value).value) } as Types.Float64Value;
            case 'Int8Value': return { '@xsi:type': 'Types:Int8Value', '@Value': BigInt((value as ast.Int8Value).value) } as Types.Int8Value;
            case 'Int16Value': return { '@xsi:type': 'Types:Int16Value', '@Value': (value as ast.Int16Value).value } as Types.Int16Value;
            case 'Int32Value': return { '@xsi:type': 'Types:Int32Value', '@Value': (value as ast.Int32Value).value } as Types.Int32Value;
            case 'Int64Value': return { '@xsi:type': 'Types:Int64Value', '@Value': (value as ast.Int64Value).value } as Types.Int64Value;
            case 'UInt8Value': return { '@xsi:type': 'Types:UInt8Value', '@Value': (value as ast.UInt8Value).value } as Types.UInt8Value;
            case 'UInt16Value': return { '@xsi:type': 'Types:UInt16Value', '@Value': (value as ast.UInt16Value).value } as Types.UInt16Value;
            case 'UInt32Value': return { '@xsi:type': 'Types:UInt32Value', '@Value': (value as ast.UInt32Value).value } as Types.UInt32Value;
            case 'UInt64Value': return { '@xsi:type': 'Types:UInt64Value', '@Value': (value as ast.UInt64Value).value } as Types.UInt64Value;
            case 'EnumerationValue': return { '@xsi:type': 'Types:EnumerationValue', '@Value': (value as ast.EnumerationValue).value } as Types.EnumerationValue;
            case 'String8Value': return { '@xsi:type': 'Types:String8Value', '@Value': (value as ast.String8Value).value } as Types.String8Value;
            case 'ArrayValue': return { '@xsi:type': 'Types:ArrayValue', ItemValue: (value as ast.ArrayValue).elements.map(this.convertValue, this) } as Types.ArrayValue;
            case 'StructureValue': return { '@xsi:type': 'Types:StructureValue', FieldValue: (value as ast.ArrayValue).elements.map(this.convertValue, this) } as Types.StructureValue;
            case 'FieldValue': return { ...this.convertValue((value as ast.FieldValue).value), '@Field': (value as ast.FieldValue).field }
            default: return { '@xsi:type': 'Types:Value' } as Types.Value;
        }
    }

    convertConfigurationUsage(include: ast.ConfigurationUsage): Configuration.ConfigurationUsage {
        return {
            Path: include.path,
            Configuration: this.convertXlink(include.configuration, include),
        };
    }


    public async doGeneratePackage(catalogue: ast.Catalogue, notice: string | undefined): Promise<string> {

        const obj = {
            '!notice': notice,
            '!generatedBy': this.generatedBy(),
            'Package:Package': await this.convertPackage(catalogue),
        },
            doc = create({ version: '1.0', encoding: 'UTF-8' }, obj);
        return doc.end({ prettyPrint: true });
    }

    private async createOutputDir(projectUri: URI): Promise<URI> {
        const outputDir = UriUtils.joinPath(projectUri, this.smdlGenFolder);

        fs.promises.mkdir(outputDir.fsPath, { recursive: true });
        return outputDir;
    }

    public async generateCatalogue(catalogue: ast.Catalogue, projectUri: URI, notice: string | undefined): Promise<void> {

        const outputDir = await this.createOutputDir(projectUri);
        const smpcatFile = UriUtils.joinPath(outputDir, UriUtils.basename(catalogue.$document?.uri as URI).replace(/\.xsmpcat$/, '.smpcat'));
        fs.promises.writeFile(smpcatFile.fsPath, await this.doGenerateCatalogue(catalogue, notice));

    }

    public async generatePackage(catalogue: ast.Catalogue, projectUri: URI, notice: string | undefined): Promise<void> {
        const outputDir = await this.createOutputDir(projectUri);
        const smppkgFile = UriUtils.joinPath(outputDir, UriUtils.basename(catalogue.$document?.uri as URI).replace(/\.xsmpcat$/, '.smppkg'));
        fs.promises.writeFile(smppkgFile.fsPath, await this.doGeneratePackage(catalogue, notice));

    }
}

