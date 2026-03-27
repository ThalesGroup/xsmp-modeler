import * as ast from 'xsmp/ast';
import type * as Catalogue from 'xsmp/smp/catalogue';
import type * as Elements from 'xsmp/smp/elements';
import type * as Types from 'xsmp/smp/types';
import type * as Package from 'xsmp/smp/package';
import type * as xlink from 'xsmp/smp/xlink';
import type * as Configuration from 'xsmp/smp/configuration';
import type * as LinkBase from 'xsmp/smp/linkbase';
import type * as Assembly from 'xsmp/smp/assembly';
import type * as Schedule from 'xsmp/smp/schedule';
import * as XsmpUtils from 'xsmp/utils';
import * as Duration from 'xsmp/utils';

import type { AstNode, JSDocParagraph, Reference, URI } from 'langium';
import { AstUtils, UriUtils, isReference } from 'langium';
import * as fs from 'node:fs';
import * as Solver from 'xsmp/utils';
import { isGeneratedBy, type TaskAcceptor, type XsmpGenerator, getCopyrightNotice } from 'xsmp/generator';
import { create } from 'xmlbuilder2';
import { type FloatingPTK, type IntegralPTK, PTK, VisibilityKind, type DocumentationHelper, type AttributeHelper } from 'xsmp/utils';
import { xsmpVersion, type XsmpSharedServices } from 'xsmp';
import type { ProjectManager } from 'xsmp/workspace';
import type { XsmpPathService, XsmpcfgPathResolver, Xsmpl2PathResolver } from 'xsmp/references';

export class SmpGenerator implements XsmpGenerator {

    protected readonly docHelper: DocumentationHelper;
    protected readonly attrHelper: AttributeHelper;
    protected readonly pathService: XsmpPathService;
    protected readonly cfgPathResolver: XsmpcfgPathResolver;
    protected readonly l2PathResolver: Xsmpl2PathResolver;
    protected readonly projectManager: ProjectManager;
    protected readonly smdlGenFolder = 'smdl-gen';

    constructor(services: XsmpSharedServices) {
        this.pathService = services.PathService;
        this.cfgPathResolver = services.CfgPathResolver;
        this.l2PathResolver = services.L2PathResolver;
        this.docHelper = services.DocumentationHelper;
        this.attrHelper = services.AttributeHelper;
        this.projectManager = services.workspace.ProjectManager;
    }
    clean(projectUri: URI) {
        fs.rmSync(UriUtils.joinPath(projectUri, this.smdlGenFolder).fsPath, { recursive: true, force: true });
    }
    generate(node: AstNode, projectUri: URI, acceptTask: TaskAcceptor) {
        const notice = this.safeXmlComment(getCopyrightNotice(node.$document));
        switch (node.$type) {
            case ast.Catalogue.$type:
                acceptTask(() => this.generateCatalogue(node as ast.Catalogue, projectUri, notice));
                acceptTask(() => this.generatePackage(node as ast.Catalogue, projectUri, notice));
                break;
            case ast.Configuration.$type:
                acceptTask(() => this.generateConfiguration(node as ast.Configuration, projectUri, notice));
                break;
            case ast.LinkBase.$type:
                acceptTask(() => this.generateLinkBase(node as ast.LinkBase, projectUri, notice));
                break;
            case ast.Assembly.$type:
                acceptTask(() => this.generateAssembly(node as ast.Assembly, projectUri, notice));
                break;
            case ast.Schedule.$type:
                acceptTask(() => this.generateSchedule(node as ast.Schedule, projectUri, notice));
                break;
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
    protected convertGeneratedNamedElement(id: string, name: string): Elements.NamedElement {
        return {
            '@Id': id,
            '@Name': name,
        };
    }
    protected convertMetadata(element: ast.Metadata): Elements.Metadata {
        return this.convertAttribute(element as ast.Attribute);
    }
    protected convertAttribute(element: ast.Attribute): Types.Attribute {
        const attributeType = ast.isAttributeType(element.type.ref) ? element.type.ref : undefined;
        const valueType = attributeType?.type.ref;

        return {
            '@xsi:type': 'Types:Attribute',
            '@Id': `${this.getId(element.$container)}.${element.type.ref?.name}.${element.$containerIndex}`,
            '@Name': element.type.ref?.name ?? '',
            Type: this.convertXlink(element.type, element),
            Value: (() => {
                if (element.value) {
                    return this.convertTypedValue(valueType, element.value);
                }
                if (attributeType?.default) {
                    return this.convertTypedValue(valueType, attributeType.default);
                }
                return { '@xsi:type': 'Types:Value' } as Types.Value;
            })(),
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
            case ast.Structure.$type:
                return this.convertStructure(type as ast.Structure);
            case ast.Class.$type:
                return this.convertClass(type as ast.Class);
            case ast.Exception.$type:
                return this.convertException(type as ast.Exception);
            case ast.PrimitiveType.$type:
                return this.convertType(type, 'Types:PrimitiveType');
            case ast.ArrayType.$type:
                return this.convertArrayType(type as ast.ArrayType);
            case ast.AttributeType.$type:
                return this.convertAttributeType(type as ast.AttributeType);
            case ast.Enumeration.$type:
                return this.convertEnumeration(type as ast.Enumeration);
            case ast.EventType.$type:
                return this.convertEventType(type as ast.EventType);
            case ast.Float.$type:
                return this.convertFloat(type as ast.Float);
            case ast.Integer.$type:
                return this.convertInteger(type as ast.Integer);
            case ast.Service.$type:
            case ast.Model.$type:
                return this.convertComponent(type as ast.Component);
            case ast.Interface.$type:
                return this.convertInterface(type as ast.Interface);
            case ast.NativeType.$type:
                return this.convertNativeType(type as ast.NativeType);
            case ast.StringType.$type:
                return this.convertStringType(type as ast.StringType);
            case ast.ValueReference.$type:
                return this.convertValueReference(type as ast.ValueReference);
        }
        throw Error(`Unsupported type ${type.$type}`);
    }

    protected convertType(type: ast.Type, typeName: string): Types.Type {

        return {
            '@xsi:type': typeName,
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
        return { '@xsi:type': 'Types:StructureValue', FieldValue: expression.elements.map((e, index) => this.convertTypedValue(fields.at(index)?.type?.ref as ast.Type | undefined, e), this) };
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

    protected filename(document: AstNode | undefined): string | undefined {
        if (!document) {
            return undefined;
        }
        let fileName = UriUtils.basename(AstUtils.getDocument(document).uri).replace(/\.xsmp([a-z0-9]+)$/i, '.smp$1');
        if (fileName === 'ecss.smp@ECSS_SMP_2020.smpcat') { fileName = 'http://www.ecss.nl/smp/2019/Smdl'; }
        else if (fileName === 'ecss.smp@ECSS_SMP_2025.smpcat') { fileName = 'http://www.ecss.nl/smp/2019/Smdl'; }
        return fileName;
    }

    protected convertXlink(link: Reference<ast.NamedElement>, context: AstNode | undefined): xlink.Xlink {
        if (link.ref) {
            const refDoc = AstUtils.getDocument(link.ref);
            const doc = context ? AstUtils.getDocument(context) : undefined;

            let href = `#${this.docHelper.getId(link.ref) ?? XsmpUtils.fqn(link.ref)}`;
            if (doc !== refDoc) {
                href = this.filename(link.ref) + href;
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

    protected getSmpStandard(node: AstNode): string {
        const project = this.projectManager.getProject(AstUtils.getDocument(node));
        return project?.standard ?? 'ECSS_SMP_2020';
    }

    protected getL1Namespaces(node: AstNode): {
        elements: string;
        types: string;
        catalogue: string;
        package: string;
        configuration: string;
    } {
        if (this.getSmpStandard(node) === 'ECSS_SMP_2025') {
            return {
                elements: 'http://www.ecss.nl/smp/2025/Core/Elements',
                types: 'http://www.ecss.nl/smp/2025/Core/Types',
                catalogue: 'http://www.ecss.nl/smp/2025/Smdl/Catalogue',
                package: 'http://www.ecss.nl/smp/2025/Smdl/Package',
                configuration: 'http://www.ecss.nl/smp/2025/Smdl/Configuration',
            };
        }
        return {
            elements: 'http://www.ecss.nl/smp/2019/Core/Elements',
            types: 'http://www.ecss.nl/smp/2019/Core/Types',
            catalogue: 'http://www.ecss.nl/smp/2019/Smdl/Catalogue',
            package: 'http://www.ecss.nl/smp/2019/Smdl/Package',
            configuration: 'http://www.ecss.nl/smp/2019/Smdl/Configuration',
        };
    }

    protected async convertCatalogue(catalogue: ast.Catalogue): Promise<Catalogue.Catalogue> {
        const id = this.docHelper.getId(catalogue) ?? `_${XsmpUtils.fqn(catalogue)}`;
        const namespaces = this.getL1Namespaces(catalogue);

        return {
            '@xmlns:Elements': namespaces.elements,
            '@xmlns:Types': namespaces.types,
            '@xmlns:Catalogue': namespaces.catalogue,
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
            namespaces = this.getL1Namespaces(catalogue),
            dependencies = [...new Set(doc.references.filter((e): e is Reference => isReference(e) && !!e.ref && !ast.isInterface(e.ref)).map(e => AstUtils.getDocument(e.ref!).parseResult.value).filter(ast.isCatalogue)
                .filter(e => e !== catalogue && e.name !== 'ecss_smp_smp'))].sort((l, r) => l.name.localeCompare(r.name));
        return {
            '@xmlns:Elements': namespaces.elements,
            '@xmlns:Types': namespaces.types,
            '@xmlns:Catalogue': namespaces.catalogue,
            '@xmlns:Package': namespaces.package,
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
                this.convertXlink({ ref: e, $refText: e.name }, undefined)).toArray(),
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
        const smpcfgFile = UriUtils.joinPath(outputDir, UriUtils.basename(configuration.$document?.uri as URI).replace(/\.xsmpcfg$/, '.smpcfg'));
        await fs.promises.writeFile(smpcfgFile.fsPath, await this.doGenerateConfiguration(configuration, notice));

    }
    async doGenerateConfiguration(configuration: ast.Configuration, notice: string | undefined): Promise<string> {
        const obj = {
            '!notice': notice,
            '!generatedBy': this.generatedBy(),
            'Configuration:Configuration': this.convertConfiguration(configuration),
        },
            doc = create({ version: '1.0', encoding: 'UTF-8' }, obj);
        return doc.end({ prettyPrint: true });
    }

    protected convertConfiguration(configuration: ast.Configuration): Configuration.Configuration {
        const id = this.docHelper.getId(configuration) ?? configuration.name;
        const namespaces = this.getL1Namespaces(configuration);
        return {
            '@xmlns:Elements': namespaces.elements,
            '@xmlns:Types': namespaces.types,
            '@xmlns:Configuration': namespaces.configuration,
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
            Include: configuration.elements.filter(ast.isConfigurationUsage).map(this.convertConfigurationUsage, this),
            Component: configuration.elements.filter(ast.isComponentConfiguration).map(this.convertComponentConfiguration, this),
        };
    }
    convertComponentConfiguration(component: ast.ComponentConfiguration): Configuration.ComponentConfiguration {
        return {
            '@Path': this.pathService.stringifyPath(component.name),
            Include: component.elements.filter(ast.isConfigurationUsage).map(this.convertConfigurationUsage, this),
            Component: component.elements.filter(ast.isComponentConfiguration).map(this.convertComponentConfiguration, this),
            FieldValue: component.elements.filter(ast.isFieldValue).map(value => this.convertValue(value)),
        };
    }

    protected getResolvedConfigurationFieldType(fieldValue: ast.FieldValue): ast.Type | undefined {
        if (!ast.isPath(fieldValue.field) || fieldValue.field.unsafe) {
            return undefined;
        }
        const resolution = this.cfgPathResolver.getFieldPathResolution(fieldValue.field);
        if (!resolution.active || resolution.invalidMessage) {
            return undefined;
        }
        return resolution.finalType as ast.Type | undefined;
    }

    protected getResolvedAssemblyFieldType(fieldValue: ast.FieldValue): ast.Type | undefined {
        if (!ast.isPath(fieldValue.field) || fieldValue.field.unsafe) {
            return undefined;
        }
        const resolution = this.l2PathResolver.getAssemblyFieldPathResolution(fieldValue.field);
        if (!resolution.active || resolution.invalidMessage) {
            return undefined;
        }
        return resolution.finalType as ast.Type | undefined;
    }

    protected getResolvedAssemblyPropertyType(propertyValue: ast.PropertyValue): ast.Type | undefined {
        if (propertyValue.property.unsafe) {
            return undefined;
        }
        const target = this.l2PathResolver.getLocalNamedReferenceTarget(propertyValue.property);
        return ast.isProperty(target) ? target.type.ref : undefined;
    }

    protected getResolvedSchedulePropertyType(propertyValue: ast.SetProperty): ast.Type | undefined {
        if (propertyValue.propertyPath.unsafe) {
            return undefined;
        }
        const resolution = this.l2PathResolver.getScheduleActivityPathResolution(propertyValue.propertyPath);
        if (!resolution.active || resolution.invalidMessage) {
            return undefined;
        }
        return resolution.finalType as ast.Type | undefined;
    }

    protected getResolvedOperationParameterType(parameterValue: ast.ParameterValue): ast.Type | undefined {
        if (!parameterValue.parameter) {
            return undefined;
        }

        const scheduleCall = AstUtils.getContainerOfType(parameterValue, ast.isCallOperation);
        if (scheduleCall) {
            if (scheduleCall.operationPath.unsafe) {
                return undefined;
            }
            const resolution = this.l2PathResolver.getScheduleActivityPathResolution(scheduleCall.operationPath);
            const operation = ast.isOperation(resolution.finalElement) ? resolution.finalElement : undefined;
            return operation?.parameter.find(parameter => parameter.name === parameterValue.parameter)?.type.ref;
        }

        const assemblyCall = AstUtils.getContainerOfType(parameterValue, ast.isOperationCall);
        if (!assemblyCall || assemblyCall.operation.unsafe) {
            return undefined;
        }
        const target = this.l2PathResolver.getLocalNamedReferenceTarget(assemblyCall.operation);
        const operation = ast.isOperation(target) ? target : undefined;
        return operation?.parameter.find(parameter => parameter.name === parameterValue.parameter)?.type.ref;
    }

    protected getResolvedFieldValueType(fieldValue: ast.FieldValue): ast.Type | undefined {
        if (ast.isStructureValue(fieldValue.$container)) {
            const structureType = this.getExpectedValueType(fieldValue.$container);
            return this.getStructureFieldPathType(structureType, fieldValue.field);
        }
        if (AstUtils.getContainerOfType(fieldValue, ast.isAssemblyComponentConfiguration)
            || AstUtils.getContainerOfType(fieldValue, ast.isModelInstance)) {
            return this.getResolvedAssemblyFieldType(fieldValue);
        }
        return this.getResolvedConfigurationFieldType(fieldValue);
    }

    protected getExpectedValueType(value: ast.Value): ast.Type | undefined {
        const container = value.$container;
        if (!container) {
            return undefined;
        }
        if (ast.isFieldValue(container) && container.value === value) {
            return this.getResolvedFieldValueType(container);
        }
        if (ast.isCfgStructureFieldValue(container) && container.value === value) {
            if (container.unsafe) {
                return undefined;
            }
            const structureType = ast.isStructureValue(container.$container)
                ? this.getExpectedValueType(container.$container)
                : undefined;
            return ast.isStructure(structureType)
                ? this.getStructureFieldType(structureType, container.field)
                : undefined;
        }
        if (ast.isPropertyValue(container) && container.value === value) {
            return this.getResolvedAssemblyPropertyType(container);
        }
        if (ast.isSetProperty(container) && container.value === value) {
            return this.getResolvedSchedulePropertyType(container);
        }
        if (ast.isParameterValue(container) && container.value === value) {
            return this.getResolvedOperationParameterType(container);
        }
        if (ast.isArrayValue(container)) {
            const arrayType = this.getExpectedValueType(container);
            return ast.isArrayType(arrayType) ? arrayType.itemType.ref : undefined;
        }
        if (ast.isStructureValue(container)) {
            const structureType = this.getExpectedValueType(container);
            return ast.isStructure(structureType)
                ? this.getPositionalStructureFieldType(container, value, structureType)
                : undefined;
        }
        return undefined;
    }

    protected getStructureFieldType(type: ast.Type | undefined, fieldName: string): ast.Type | undefined {
        if (!ast.isStructure(type)) {
            return undefined;
        }
        const fields = this.cfgPathResolver.getFieldCandidatesForType(type) as ast.Field[];
        return fields.find(field => field.name === fieldName)?.type.ref;
    }

    protected getStructureFieldPathType(type: ast.Type | undefined, path: ast.Path | undefined): ast.Type | undefined {
        if (!ast.isStructure(type) || !path || path.unsafe || path.absolute) {
            return undefined;
        }

        const segments: Array<ast.PathElement | ast.PathSegment> = [];
        if (path.head) {
            segments.push(path.head);
        }
        segments.push(...path.elements);
        if (segments.length === 0) {
            return undefined;
        }

        const first = segments[0];
        if (ast.isPathIndex(first) || ast.isPathParentSegment(first) || ast.isPathSelfSegment(first) || (ast.isPathMember(first) && first.separator === '/')) {
            return undefined;
        }

        const firstSegment = ast.isPathMember(first) ? first.segment : first;
        if (!ast.isPathNamedSegment(firstSegment)) {
            return undefined;
        }

        let field = this.getNamedStructureField(type, firstSegment);
        if (!field) {
            return undefined;
        }

        let currentType = field.type.ref;
        for (let index = 1; index < segments.length; index++) {
            const segment = segments[index];
            if (ast.isPathIndex(segment)) {
                if (!currentType || !ast.isArrayType(currentType)) {
                    return undefined;
                }
                currentType = currentType.itemType.ref;
                continue;
            }
            if (!ast.isPathMember(segment) || segment.separator !== '.' || ast.isPathParentSegment(segment.segment) || ast.isPathSelfSegment(segment.segment)) {
                return undefined;
            }
            if (!ast.isStructure(currentType) || !ast.isPathNamedSegment(segment.segment)) {
                return undefined;
            }
            field = this.getNamedStructureField(currentType, segment.segment);
            if (!field) {
                return undefined;
            }
            currentType = field.type.ref;
        }

        return currentType;
    }

    protected getNamedStructureField(type: ast.Structure, segment: ast.PathNamedSegment): ast.Field | undefined {
        const candidates = this.cfgPathResolver.getFieldCandidatesForType(type) as ast.Field[];
        if (ast.isConcretePathNamedSegment(segment)) {
            const linked = segment.reference?.ref;
            if (linked && candidates.includes(linked as ast.Field)) {
                return linked as ast.Field;
            }
            const referenceText = segment.reference?.$refText;
            return referenceText ? candidates.find(candidate => candidate.name === referenceText) : undefined;
        }
        const segmentText = this.pathService.getSegmentText(segment);
        return segmentText ? candidates.find(candidate => candidate.name === segmentText) : undefined;
    }

    protected getPositionalStructureFieldType(structureValue: ast.StructureValue, target: ast.Value, type: ast.Structure): ast.Type | undefined {
        const fields = this.cfgPathResolver.getFieldCandidatesForType(type) as ast.Field[];
        const fieldsByName = new Map(fields.filter((field): field is ast.Field & { name: string } => !!field.name).map(field => [field.name, field] as const));
        const usedFields = new Set<string>();
        let positionalIndex = 0;

        const nextPositionalField = (): ast.Field | undefined => {
            while (positionalIndex < fields.length) {
                const field = fields[positionalIndex++] as ast.Field;
                if (field.name && !usedFields.has(field.name)) {
                    return field;
                }
            }
            return undefined;
        };

        for (const element of structureValue.elements) {
            if (ast.isCfgStructureFieldValue(element)) {
                const field = element.field ? fieldsByName.get(element.field) : undefined;
                if (field?.name && !usedFields.has(field.name)) {
                    usedFields.add(field.name);
                }
                continue;
            }
            if (ast.isFieldValue(element)) {
                const field = this.getStructureFieldPathType(type, element.field);
                if (element === target) {
                    return field;
                }
                if (!element.field) {
                    continue;
                }
                const firstSegment = this.pathService.getPathSegments(element.field)[0];
                const actualFirstSegment = ast.isPathMember(firstSegment) ? firstSegment.segment : firstSegment;
                const namedField = ast.isPathNamedSegment(actualFirstSegment)
                    ? this.getNamedStructureField(type, actualFirstSegment)
                    : undefined;
                if (namedField?.name && !usedFields.has(namedField.name)) {
                    usedFields.add(namedField.name);
                }
                continue;
            }

            const field = nextPositionalField();
            if (!field) {
                return undefined;
            }
            if (element === target) {
                return field.type.ref;
            }
            if (field.name) {
                usedFields.add(field.name);
            }
        }

        return undefined;
    }

    protected convertUnsuffixedIntValue(value: ast.IntValue, expectedType: ast.Type | undefined): Types.Value {
        switch (XsmpUtils.getPTK(expectedType)) {
            case PTK.Int8: return { '@xsi:type': 'Types:Int8Value', '@Value': value.value } as Types.Int8Value;
            case PTK.Int16: return { '@xsi:type': 'Types:Int16Value', '@Value': value.value } as Types.Int16Value;
            case PTK.Int32: return { '@xsi:type': 'Types:Int32Value', '@Value': value.value } as Types.Int32Value;
            case PTK.Int64: return { '@xsi:type': 'Types:Int64Value', '@Value': value.value } as Types.Int64Value;
            case PTK.UInt8: return { '@xsi:type': 'Types:UInt8Value', '@Value': value.value } as Types.UInt8Value;
            case PTK.UInt16: return { '@xsi:type': 'Types:UInt16Value', '@Value': value.value } as Types.UInt16Value;
            case PTK.UInt32: return { '@xsi:type': 'Types:UInt32Value', '@Value': value.value } as Types.UInt32Value;
            case PTK.UInt64: return { '@xsi:type': 'Types:UInt64Value', '@Value': value.value } as Types.UInt64Value;
            default: return { '@xsi:type': 'Types:Value' } as Types.Value;
        }
    }

    protected convertUnsuffixedFloatValue(value: ast.FloatValue, expectedType: ast.Type | undefined): Types.Value {
        switch (XsmpUtils.getPTK(expectedType)) {
            case PTK.Float32: return { '@xsi:type': 'Types:Float32Value', '@Value': parseFloat(value.value) } as Types.Float32Value;
            case PTK.Float64: return { '@xsi:type': 'Types:Float64Value', '@Value': parseFloat(value.value) } as Types.Float64Value;
            default: return { '@xsi:type': 'Types:Value' } as Types.Value;
        }
    }

    protected convertStructureElements(value: ast.StructureValue, expectedType: ast.Type | undefined): Types.Value[] {
        if (!ast.isStructure(expectedType)) {
            return value.elements.map(element => this.convertValue(element));
        }

        const fields = this.cfgPathResolver.getFieldCandidatesForType(expectedType) as ast.Field[];
        const fieldsByName = new Map(fields.map(field => [field.name, field] as const));
        const usedFields = new Set<string>();
        let positionalIndex = 0;

        const nextPositionalField = (): ast.Field | undefined => {
            while (positionalIndex < fields.length) {
                const field = fields[positionalIndex++] as ast.Field;
                if (field.name && !usedFields.has(field.name)) {
                    return field;
                }
            }
            return undefined;
        };

        return value.elements.map(element => {
            if (ast.isCfgStructureFieldValue(element)) {
                const field = (element.field ? fieldsByName.get(element.field) : undefined) as ast.Field | undefined;
                if (field?.name && !usedFields.has(field.name)) {
                    usedFields.add(field.name);
                }
                return {
                    ...this.convertValue(element.value, element.unsafe ? undefined : field?.type.ref as ast.Type | undefined),
                    '@Field': element.field,
                } as Types.Value;
            }

            if (ast.isFieldValue(element)) {
                if (!element.field) {
                    return this.convertValue(element.value);
                }
                const fieldType = this.getStructureFieldPathType(expectedType, element.field);
                const firstSegment = this.pathService.getPathSegments(element.field)[0];
                const actualFirstSegment = ast.isPathMember(firstSegment) ? firstSegment.segment : firstSegment;
                const namedField = ast.isPathNamedSegment(actualFirstSegment)
                    ? this.getNamedStructureField(expectedType, actualFirstSegment)
                    : undefined;
                if (namedField?.name && !usedFields.has(namedField.name)) {
                    usedFields.add(namedField.name);
                }
                return {
                    ...this.convertValue(element.value, element.field.unsafe ? undefined : fieldType),
                    '@Field': this.pathService.stringifyPath(element.field),
                } as Types.Value;
            }

            const field = nextPositionalField();
            if (field) {
                usedFields.add(field.name);
            }
            return this.convertValue(element, field?.type.ref);
        });
    }

    convertValue(value: ast.Value, expectedType?: ast.Type): Types.Value {
        switch (value.$type) {
            case ast.BoolValue.$type: return { '@xsi:type': 'Types:BoolValue', '@Value': (value as ast.BoolValue).value } as Types.BoolValue;
            case ast.Char8Value.$type: return { '@xsi:type': 'Types:Char8Value', '@Value': (value as ast.Char8Value).value } as Types.Char8Value;
            case ast.DateTimeValue.$type: return { '@xsi:type': 'Types:DateTimeValue', '@Value': (value as ast.DateTimeValue).value.slice(1, -3) } as Types.DateTimeValue;
            case ast.DurationValue.$type: return { '@xsi:type': 'Types:DurationValue', '@Value': (value as ast.DurationValue).value.slice(1, -2) } as Types.DurationValue;
            case ast.FloatValue.$type: return this.convertUnsuffixedFloatValue(value as ast.FloatValue, expectedType);
            case ast.Float32Value.$type: return { '@xsi:type': 'Types:Float32Value', '@Value': parseFloat((value as ast.Float32Value).value) } as Types.Float32Value;
            case ast.Float64Value.$type: return { '@xsi:type': 'Types:Float64Value', '@Value': parseFloat((value as ast.Float64Value).value) } as Types.Float64Value;
            case ast.IntValue.$type: return this.convertUnsuffixedIntValue(value as ast.IntValue, expectedType);
            case ast.Int8Value.$type: return { '@xsi:type': 'Types:Int8Value', '@Value': BigInt((value as ast.Int8Value).value) } as Types.Int8Value;
            case ast.Int16Value.$type: return { '@xsi:type': 'Types:Int16Value', '@Value': (value as ast.Int16Value).value } as Types.Int16Value;
            case ast.Int32Value.$type: return { '@xsi:type': 'Types:Int32Value', '@Value': (value as ast.Int32Value).value } as Types.Int32Value;
            case ast.Int64Value.$type: return { '@xsi:type': 'Types:Int64Value', '@Value': (value as ast.Int64Value).value } as Types.Int64Value;
            case ast.UInt8Value.$type: return { '@xsi:type': 'Types:UInt8Value', '@Value': (value as ast.UInt8Value).value } as Types.UInt8Value;
            case ast.UInt16Value.$type: return { '@xsi:type': 'Types:UInt16Value', '@Value': (value as ast.UInt16Value).value } as Types.UInt16Value;
            case ast.UInt32Value.$type: return { '@xsi:type': 'Types:UInt32Value', '@Value': (value as ast.UInt32Value).value } as Types.UInt32Value;
            case ast.UInt64Value.$type: return { '@xsi:type': 'Types:UInt64Value', '@Value': (value as ast.UInt64Value).value } as Types.UInt64Value;
            case ast.EnumerationValue.$type: {
                const enumValue = value as ast.EnumerationValue;
                if (enumValue.value)
                    return { '@xsi:type': 'Types:EnumerationValue', '@Value': enumValue.value } as Types.EnumerationValue;
                const literalValue = enumValue.reference?.ref?.value;
                if (!literalValue) {
                    return { '@xsi:type': 'Types:EnumerationValue' } as Types.EnumerationValue;
                }
                return { '@xsi:type': 'Types:EnumerationValue', '@Value': this.toEnumerationValue(literalValue), '@Literal': Solver.getValue(literalValue)?.enumerationLiteral()?.getValue().name } as Types.EnumerationValue;
            }
            case ast.String8Value.$type: return { '@xsi:type': 'Types:String8Value', '@Value': (value as ast.String8Value).value } as Types.String8Value;
            case ast.ArrayValue.$type: {
                const itemType = ast.isArrayType(expectedType) ? expectedType.itemType.ref : undefined;
                return { '@xsi:type': 'Types:ArrayValue', ItemValue: (value as ast.ArrayValue).elements.map(element => this.convertValue(element, itemType)) } as Types.ArrayValue;
            }
            case ast.StructureValue.$type:
                return { '@xsi:type': 'Types:StructureValue', FieldValue: this.convertStructureElements(value as ast.StructureValue, expectedType) } as Types.StructureValue;
            case ast.CfgStructureFieldValue.$type: {
                const fieldValue = value as ast.CfgStructureFieldValue;
                return {
                    ...this.convertValue(fieldValue.value, fieldValue.unsafe ? undefined : this.getStructureFieldType(expectedType, fieldValue.field)),
                    '@Field': fieldValue.field
                };
            }
            case ast.FieldValue.$type: return {
                ...this.convertValue((value as ast.FieldValue).value, this.getResolvedFieldValueType(value as ast.FieldValue)),
                '@Field': this.pathService.stringifyPath((value as ast.FieldValue).field)
            };
            default: return { '@xsi:type': 'Types:Value' } as Types.Value;
        }
    }

    convertConfigurationUsage(include: ast.ConfigurationUsage): Configuration.ConfigurationUsage {
        return {
            '@Path': this.pathService.stringifyPath(include.path),
            Configuration: this.convertXlink(include.configuration, include),
        };
    }

    async generateLinkBase(linkBase: ast.LinkBase, projectUri: URI, notice: string | undefined): Promise<void> {
        const outputDir = await this.createOutputDir(projectUri);
        const smplnkFile = UriUtils.joinPath(outputDir, UriUtils.basename(linkBase.$document?.uri as URI).replace(/\.xsmplnk$/, '.smplnk'));
        await fs.promises.writeFile(smplnkFile.fsPath, await this.doGenerateLinkBase(linkBase, notice));
    }
    async doGenerateLinkBase(linkBase: ast.LinkBase, notice: string | undefined): Promise<string> {
        const obj = {
            '!notice': notice,
            '!generatedBy': this.generatedBy(),
            'LinkBase:LinkBase': await this.convertLinkBase(linkBase),
        },
            doc = create({ version: '1.0', encoding: 'UTF-8' }, obj);
        return doc.end({ prettyPrint: true });
    }

    protected convertLinkBase(linkBase: ast.LinkBase): LinkBase.LinkBase {
        const id = this.docHelper.getId(linkBase) ?? linkBase.name;
        return {
            '@xmlns:Elements': 'http://www.ecss.nl/smp/2019/Core/Elements',
            '@xmlns:LinkBase': 'http://www.ecss.nl/smp/2025/Smdl/LinkBase',
            '@xmlns:xsd': 'http://www.w3.org/2001/XMLSchema',
            '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
            '@xmlns:xlink': 'http://www.w3.org/1999/xlink',
            '@Id': id,
            '@Name': linkBase.name,
            '@Title': this.docHelper.getTitle(linkBase),
            '@Date': this.convertDate(this.docHelper.getDate(linkBase)),
            '@Creator': this.docHelper.getCreator(linkBase),
            '@Version': this.docHelper.getVersion(linkBase),
            Description: this.docHelper.getDescription(linkBase),
            Metadata: linkBase.attributes.map(this.convertMetadata, this),
            Component: linkBase.elements.filter(ast.isComponentLinkBase).map(this.convertComponentLinkBase, this),
        };
    }

    convertComponentLinkBase(linkBase: ast.ComponentLinkBase): LinkBase.ComponentLinkBase {
        return {
            '@Path': this.pathService.stringifyPath(linkBase.name)!,
            Link: linkBase.elements.filter(ast.isLink).map(this.convertLink, this),
            Component: linkBase.elements.filter(ast.isComponentLinkBase).map(this.convertComponentLinkBase, this),
        };
    }
    convertLink(link: ast.Link): LinkBase.Link {
        const ownerPath = this.pathService.stringifyPath(link.ownerPath);
        const clientPath = this.pathService.stringifyPath(link.clientPath);
        switch (link.$type) {
            case ast.EventLink.$type: return { '@xsi:type': 'LinkBase:EventLink', OwnerPath: ownerPath, ClientPath: clientPath } as LinkBase.EventLink;
            case ast.FieldLink.$type: return { '@xsi:type': 'LinkBase:FieldLink', OwnerPath: ownerPath, ClientPath: clientPath } as LinkBase.FieldLink;
            case ast.InterfaceLink.$type: return {
                '@xsi:type': 'LinkBase:InterfaceLink',
                OwnerPath: this.pathService.stringifyInterfaceLinkOwnerPath((link as ast.InterfaceLink).sourcePath) ?? '',
                ClientPath: clientPath,
                Reference: this.pathService.stringifyInterfaceLinkReference((link as ast.InterfaceLink).sourcePath) ?? '',
                BackReference: this.pathService.stringifyLocalNamedReference((link as ast.InterfaceLink).backReference, false)
            } as LinkBase.InterfaceLink;
            default: return { '@xsi:type': 'LinkBase:Link', OwnerPath: ownerPath, ClientPath: clientPath } as LinkBase.Link;
        }
    }

    async generateAssembly(assembly: ast.Assembly, projectUri: URI, notice: string | undefined): Promise<void> {
        const outputDir = await this.createOutputDir(projectUri);
        const smpasbFile = UriUtils.joinPath(outputDir, UriUtils.basename(assembly.$document?.uri as URI).replace(/\.xsmpasb$/, '.smpasb'));
        await fs.promises.writeFile(smpasbFile.fsPath, await this.doGenerateAssembly(assembly, notice));
    }
    async doGenerateAssembly(assembly: ast.Assembly, notice: string | undefined): Promise<string> {
        const obj = {
            '!notice': notice,
            '!generatedBy': this.generatedBy(),
            'Assembly:Assembly': await this.convertAssembly(assembly),
        },
            doc = create({ version: '1.0', encoding: 'UTF-8' }, obj);
        return doc.end({ prettyPrint: true });
    }

    protected convertAssembly(assembly: ast.Assembly): Assembly.Assembly {
        const id = this.docHelper.getId(assembly) ?? assembly.name;
        return {
            '@xmlns:Elements': 'http://www.ecss.nl/smp/2019/Core/Elements',
            '@xmlns:Types': 'http://www.ecss.nl/smp/2019/Core/Types',
            '@xmlns:LinkBase': 'http://www.ecss.nl/smp/2025/Smdl/LinkBase',
            '@xmlns:Assembly': 'http://www.ecss.nl/smp/2025/Smdl/Assembly',
            '@xmlns:xsd': 'http://www.w3.org/2001/XMLSchema',
            '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
            '@xmlns:xlink': 'http://www.w3.org/1999/xlink',
            '@Id': id,
            '@Name': assembly.name,
            '@Title': this.docHelper.getTitle(assembly),
            '@Date': this.convertDate(this.docHelper.getDate(assembly)),
            '@Creator': this.docHelper.getCreator(assembly),
            '@Version': this.docHelper.getVersion(assembly),
            Description: this.docHelper.getDescription(assembly),
            Metadata: assembly.attributes.map(this.convertMetadata, this),
            ComponentConfiguration: assembly.configurations.map(this.convertAssemblyComponentConfiguration, this),
            Parameter: assembly.parameters.map(this.convertTemplateParameter, this),
            Model: this.convertModelInstance(assembly.model)
        };
    }

    convertModelInstance(model: ast.ModelInstance): Assembly.ModelInstance {
        return {
            '@Name': model.name,
            Description: this.docHelper.getDescription(model),
            '@Implementation': model.implementation ? model.implementation.$refText.replace('.', '::') : model.strImplementation!,
            Assembly: model.elements.filter(ast.isSubInstance).filter(i => ast.isAssemblyInstance(i.instance)).map(this.convertAssemblyInstance, this),
            Model: model.elements.filter(ast.isSubInstance).filter(i => ast.isModelInstance(i.instance)).map(this.convertSubModelInstance, this),
            Link: model.elements.filter(ast.isLink).map(this.convertLink, this),
            FieldValue: model.elements.filter(ast.isFieldValue).map(value => this.convertValue(value)),
            Invocation: model.elements.filter(ast.isInvocation).map(this.convertInvocation, this),
            GlobalEventHandler: model.elements.filter(ast.isGlobalEventHandler).map(this.convertGlobalEventHandler, this),

        };
    }
    convertAssemblyInstance(instance: ast.SubInstance): Assembly.AssemblyInstance {
        const assembly = instance.instance as ast.AssemblyInstance;
        return {
            '@Container': this.getSubInstanceContainerName(instance),
            Assembly: this.filename(assembly.assembly.ref)!,
            '@Name': assembly.name,
            Description: this.docHelper.getDescription(assembly),
            Argument: assembly.arguments.map(this.convertTemplateArgument, this),
            ModelConfiguration: assembly.elements.map(this.convertAssemblyComponentConfiguration, this),
            Configuration: this.filename(assembly.configuration?.ref),
            LinkBase: this.filename(assembly.linkBase?.ref),

        };
    }
    convertSubModelInstance(instance: ast.SubInstance): Assembly.SubModelInstance {
        return {
            '@Container': this.getSubInstanceContainerName(instance),
            ...this.convertModelInstance(instance.instance as ast.ModelInstance)
        };

    }

    protected getSubInstanceContainerName(instance: ast.SubInstance): string {
        return this.pathService.stringifyLocalNamedReference(instance.container, false) ?? '';
    }
    convertTemplateArgument(parameter: ast.TemplateArgument): Assembly.TemplateArgument {

        switch (parameter.$type) {
            case ast.Int32Argument.$type: return {
                '@xsi:type': 'Assembly:Int32Argument',
                '@Name': parameter.parameter.ref?.name,
                '@Value': (parameter as ast.Int32Argument).value
            } as Assembly.Int32Argument;
            case ast.StringArgument.$type: return {
                '@xsi:type': 'Assembly:StringArgument',
                '@Name': parameter.parameter.ref?.name,
                '@Value': (parameter as ast.StringArgument).value.slice(1, -1)
            } as Assembly.StringArgument;
            default: return {
                '@xsi:type': 'Assembly:TemplateArgument',
                '@Name': parameter.parameter.ref!.name,
            };
        }
    }

    convertTemplateParameter(parameter: ast.TemplateParameter): Assembly.TemplateArgument {

        switch (parameter.$type) {
            case ast.Int32Parameter.$type: return {
                '@xsi:type': 'Assembly:Int32Argument',
                '@Name': parameter.name,
                '@Value': (parameter as ast.Int32Parameter).value
            } as Assembly.Int32Argument;
            case ast.StringParameter.$type: return {
                '@xsi:type': 'Assembly:StringArgument',
                '@Name': parameter.name,
                '@Value': (parameter as ast.StringParameter).value?.slice(1, -1)
            } as Assembly.StringArgument;
            default: return {
                '@xsi:type': 'Assembly:TemplateArgument',
                '@Name': parameter.name,
            };
        }
    }

    convertAssemblyComponentConfiguration(component: ast.AssemblyComponentConfiguration): Assembly.ComponentConfiguration {
        return {
            '@InstancePath': this.pathService.stringifyPath(component.name),
            Invocation: component.elements.filter(ast.isInvocation).map(this.convertInvocation, this),
            GlobalEventHandler: component.elements.filter(ast.isGlobalEventHandler).map(this.convertGlobalEventHandler, this),
            FieldValue: component.elements.filter(ast.isValue).map(v => this.convertValue(v as ast.Value), this),
        };
    }

    convertInvocation(invocation: ast.Invocation): Assembly.Invocation {
        switch (invocation.$type) {
            case ast.OperationCall.$type: return {
                '@xsi:type': 'Assembly:OperationCall',
                '@Operation': this.pathService.stringifyLocalNamedReference((invocation as ast.OperationCall).operation, false) ?? '',
                Parameter: (invocation as ast.OperationCall).parameters.map(this.convertParameterValue, this)
            } as Assembly.OperationCall;
            case ast.PropertyValue.$type: return {
                '@xsi:type': 'Assembly:PropertyValue',
                '@Property': this.pathService.stringifyLocalNamedReference((invocation as ast.PropertyValue).property, false) ?? '',
                Value: this.convertValue((invocation as ast.PropertyValue).value, this.getResolvedAssemblyPropertyType(invocation as ast.PropertyValue))
            } as Assembly.PropertyValue;
            default: return { '@xsi:type': 'Assembly:Invocation' } as Assembly.Invocation;
        }
    }

    convertParameterValue(value: ast.ParameterValue): Assembly.ParameterValue | Schedule.ParameterValue {
        return { Value: this.convertValue(value.value, this.getResolvedOperationParameterType(value)), '@Parameter': value.parameter };
    }

    convertGlobalEventHandler(handler: ast.GlobalEventHandler): Assembly.GlobalEventHandler {
        return {
            '@EntryPointName': this.pathService.stringifyLocalNamedReference(handler.entryPoint, false) ?? '',
            '@GlobalEventName': handler.globalEventName
        };
    }

    async generateSchedule(schedule: ast.Schedule, projectUri: URI, notice: string | undefined): Promise<void> {
        const outputDir = await this.createOutputDir(projectUri);
        const smpsedFile = UriUtils.joinPath(outputDir, UriUtils.basename(schedule.$document?.uri as URI).replace(/\.xsmpsed$/, '.smpsed'));
        await fs.promises.writeFile(smpsedFile.fsPath, await this.doGenerateSchedule(schedule, notice));
    }
    async doGenerateSchedule(schedule: ast.Schedule, notice: string | undefined): Promise<string> {
        const obj = {
            '!notice': notice,
            '!generatedBy': this.generatedBy(),
            'Schedule:Schedule': await this.convertSchedule(schedule),
        },
            doc = create({ version: '1.0', encoding: 'UTF-8' }, obj);
        return doc.end({ prettyPrint: true });
    }

    protected convertSchedule(schedule: ast.Schedule): Schedule.Schedule {
        const id = this.docHelper.getId(schedule) ?? schedule.name;
        return {
            '@xmlns:Elements': 'http://www.ecss.nl/smp/2019/Core/Elements',
            '@xmlns:Types': 'http://www.ecss.nl/smp/2019/Core/Types',
            '@xmlns:LinkBase': 'http://www.ecss.nl/smp/2025/Smdl/LinkBase',
            '@xmlns:Assembly': 'http://www.ecss.nl/smp/2025/Smdl/Assembly',
            '@xmlns:Schedule': 'http://www.ecss.nl/smp/2025/Smdl/Schedule',
            '@xmlns:xsd': 'http://www.w3.org/2001/XMLSchema',
            '@xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
            '@xmlns:xlink': 'http://www.w3.org/1999/xlink',
            '@Id': id,
            '@Name': schedule.name,
            '@Title': this.docHelper.getTitle(schedule),
            '@Date': this.convertDate(this.docHelper.getDate(schedule)),
            '@Creator': this.docHelper.getCreator(schedule),
            '@Version': this.docHelper.getVersion(schedule),
            Description: this.docHelper.getDescription(schedule),
            Metadata: schedule.attributes.map(this.convertMetadata, this),
            Parameter: schedule.parameters.map(this.convertTemplateParameter, this),
            '@EpochTime': schedule.epochTime,
            '@MissionStart': schedule.missionStart,
            Task: schedule.elements.filter(ast.isTask).map(this.convertTask, this),
            Event: schedule.elements.filter(ast.isEvent).map(this.convertEvent, this),
        };
    }

    convertTask(task: ast.Task): Schedule.Task {
        return {
            ...this.convertNamedElement(task),
            Activity: task.elements.map(this.convertActivity, this)
        };
    }
    private getSiblingTypeIndex<T extends AstNode & { $type: string }>(element: T, siblings: readonly T[]): number {
        let index = 0;
        for (const sibling of siblings) {
            if (sibling.$type === element.$type) {
                index++;
            }
            if (sibling === element) {
                return index;
            }
        }
        return 1;
    }
    private getGeneratedActivityName(activity: ast.Activity): string {
        const task = AstUtils.getContainerOfType(activity, ast.isTask);
        const index = task ? this.getSiblingTypeIndex(activity, task.elements) : (activity.$containerIndex ?? 0) + 1;
        return `${activity.$type}${index}`;
    }
    private convertGeneratedActivityElement(activity: ast.Activity): Elements.NamedElement {
        const task = AstUtils.getContainerOfType(activity, ast.isTask);
        const name = this.getGeneratedActivityName(activity);
        return this.convertGeneratedNamedElement(task ? `${this.getId(task)}.${name}` : name, name);
    }
    private getGeneratedEventName(event: ast.Event): string {
        const schedule = AstUtils.getContainerOfType(event, ast.isSchedule);
        const events = schedule?.elements.filter(ast.isEvent) ?? [];
        const index = events.length > 0 ? this.getSiblingTypeIndex(event, events) : (event.$containerIndex ?? 0) + 1;
        return `${event.$type}${index}`;
    }
    private convertGeneratedEventElement(event: ast.Event): Elements.NamedElement {
        const schedule = AstUtils.getContainerOfType(event, ast.isSchedule);
        const name = this.getGeneratedEventName(event);
        return this.convertGeneratedNamedElement(schedule ? `${this.getId(schedule)}.${name}` : name, name);
    }
    convertActivity(activity: ast.Activity): Schedule.Activity {
        switch (activity.$type) {
            case ast.CallOperation.$type:
                return {
                    ...this.convertGeneratedActivityElement(activity),
                    '@xsi:type': 'Schedule:CallOperation',
                    OperationPath: this.pathService.stringifyPath((activity as ast.CallOperation).operationPath),
                    Parameter: (activity as ast.CallOperation).parameters.map(this.convertParameterValue, this)
                } as Schedule.CallOperation;
            case ast.EmitGlobalEvent.$type:
                return {
                    ...this.convertGeneratedActivityElement(activity),
                    '@xsi:type': 'Schedule:EmitGlobalEvent',
                    EventName: (activity as ast.EmitGlobalEvent).eventName,
                    synchronous: !(activity as ast.EmitGlobalEvent).asynchronous
                } as Schedule.EmitGlobalEvent;
            case ast.ExecuteTask.$type:
                return {
                    ...this.convertGeneratedActivityElement(activity),
                    '@xsi:type': 'Schedule:ExecuteTask',
                    '@Root': this.pathService.stringifyPath((activity as ast.ExecuteTask).root),
                    Task: this.convertXlink((activity as ast.ExecuteTask).task, activity),
                    Argument: (activity as ast.ExecuteTask).parameter.map(this.convertTemplateArgument, this),
                } as Schedule.ExecuteTask;
            case ast.SetProperty.$type:
                return {
                    ...this.convertGeneratedActivityElement(activity),
                    '@xsi:type': 'Schedule:SetProperty',
                    PropertyPath: this.pathService.stringifyPath((activity as ast.SetProperty).propertyPath),
                    Value: this.convertValue((activity as ast.SetProperty).value, this.getResolvedSchedulePropertyType(activity as ast.SetProperty)),
                } as Schedule.SetProperty;
            case ast.Transfer.$type:
                return {
                    ...this.convertGeneratedActivityElement(activity),
                    '@xsi:type': 'Schedule:Transfer',
                    OutputFieldPath: this.pathService.stringifyPath((activity as ast.Transfer).outputFieldPath),
                    InputFieldPath: this.pathService.stringifyPath((activity as ast.Transfer).inputFieldPath),
                } as Schedule.Transfer;
            case ast.Trigger.$type:
                return {
                    ...this.convertGeneratedActivityElement(activity),
                    '@xsi:type': 'Schedule:Trigger',
                    EntryPoint: this.pathService.stringifyPath((activity as ast.Trigger).entryPoint),
                } as Schedule.Trigger;
            default:
                return {
                    ...this.convertGeneratedActivityElement(activity),
                    '@xsi:type': 'Schedule:Activity',
                } as Schedule.Activity;
        }
    }

    private convertEventBase(event: ast.Event): Schedule.Event {
        return {
            ...this.convertGeneratedEventElement(event),
            '@xsi:type': `Schedule:${event.$type}`,
            Task: this.convertXlink(event.task, event),
            '@CycleTime': event.cycleTime,
            '@RepeatCount': event.repeatCount,
        };
    }

    private convertScheduleTimeKind(timeKind?: string): string | undefined {
        switch (timeKind) {
            case 'epoch':
                return 'EpochTime';
            case 'mission':
                return 'MissionTime';
            case 'simulation':
                return 'SimulationTime';
            case 'zulu':
                return 'ZuluTime';
            default:
                return timeKind;
        }
    }

    convertEvent(event: ast.Event): Schedule.Event {
        switch (event.$type) {
            case ast.EpochEvent.$type:
                return {
                    ...this.convertEventBase(event),
                    '@EpochTime': (event as ast.EpochEvent).epochTime,
                } as Schedule.EpochEvent;
            case ast.MissionEvent.$type:
                return {
                    ...this.convertEventBase(event),
                    '@MissionTime': (event as ast.MissionEvent).missionTime,
                } as Schedule.MissionEvent;
            case ast.SimulationEvent.$type:
                return {
                    ...this.convertEventBase(event),
                    '@SimulationTime': (event as ast.SimulationEvent).simulationTime,
                } as Schedule.SimulationEvent;
            case ast.ZuluEvent.$type:
                return {
                    ...this.convertEventBase(event),
                    '@ZuluTime': (event as ast.ZuluEvent).zuluTime,
                } as Schedule.ZuluEvent;
            case ast.GlobalEventTriggeredEvent.$type:
                return {
                    ...this.convertEventBase(event),
                    '@StartEvent': (event as ast.GlobalEventTriggeredEvent).startEvent,
                    '@StopEvent': (event as ast.GlobalEventTriggeredEvent).stopEvent,
                    '@TimeKind': this.convertScheduleTimeKind((event as ast.GlobalEventTriggeredEvent).timeKind),
                    '@Delay': (event as ast.GlobalEventTriggeredEvent).delay,
                } as Schedule.GlobalEventTriggeredEvent;
            default:
                return this.convertEventBase(event);
        }
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

        await fs.promises.mkdir(outputDir.fsPath, { recursive: true });
        return outputDir;
    }

    public async generateCatalogue(catalogue: ast.Catalogue, projectUri: URI, notice: string | undefined): Promise<void> {

        const outputDir = await this.createOutputDir(projectUri);
        const smpcatFile = UriUtils.joinPath(outputDir, UriUtils.basename(catalogue.$document?.uri as URI).replace(/\.xsmpcat$/, '.smpcat'));
        await fs.promises.writeFile(smpcatFile.fsPath, await this.doGenerateCatalogue(catalogue, notice));

    }

    public async generatePackage(catalogue: ast.Catalogue, projectUri: URI, notice: string | undefined): Promise<void> {
        const outputDir = await this.createOutputDir(projectUri);
        const smppkgFile = UriUtils.joinPath(outputDir, UriUtils.basename(catalogue.$document?.uri as URI).replace(/\.xsmpcat$/, '.smppkg'));
        await fs.promises.writeFile(smppkgFile.fsPath, await this.doGeneratePackage(catalogue, notice));

    }
}
