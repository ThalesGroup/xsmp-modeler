import * as ast from '../../generated/ast.js';
import { type AstNode, AstUtils, type JSDocElement, type JSDocTag, type URI, UriUtils, WorkspaceCache } from 'langium';
import * as fs from 'fs';
import type { TaskAcceptor, XsmpGenerator } from '../generator.js';
import { escape, fqn, getAccessKind, getNodeType, getPTK, isAbstractType, isInput, isOutput, isState } from '../../utils/xsmp-utils.js';
import * as CopyrightNoticeProvider from '../copyright-notice-provider.js';
import { expandToString as s } from 'langium/generate';
import * as Path from 'path';
import { format as ClangFormat } from './clang-format.js';
import type { XsmpSharedServices } from '../../xsmp-module.js';
import type { XsmpTypeProvider } from '../../references/type-provider.js';
import * as Solver from '../../utils/solver.js';
import { PTK } from '../../utils/primitive-type-kind.js';
import { xsmpVersion } from '../../version.js';
import { OperatorKind } from '../../utils/operator-kind.js';
import { type DocumentationHelper } from '../../utils/documentation-helper.js';
import { type AttributeHelper } from '../../utils/attribute-helper.js';
import { ViewKind } from '../../utils/view_kind.js';

export enum CxxStandard { CXX_STD_11 = 0, CXX_STD_14 = 1, CXX_STD_17 = 2 }

export interface ForwardedType {
    type: ast.Type;
}
export namespace ForwardedType {
    export function create(type: ast.Type): ForwardedType {
        return { type };
    }

    export function is(value: unknown): value is ForwardedType {
        return typeof value === 'object' && value !== null && 'type' in value && ast.isType((value as ForwardedType).type);
    }
}
export type Include = string | ast.Type | ForwardedType | undefined;

export abstract class CppGenerator implements XsmpGenerator {
    protected static readonly defaultIncludeFolder = 'src';
    protected static readonly defaultSourceFolder = 'src';
    protected includeFolder = CppGenerator.defaultIncludeFolder;
    protected sourceFolder = CppGenerator.defaultSourceFolder;

    protected readonly cxxStandard: CxxStandard;
    protected readonly typeProvider: XsmpTypeProvider;
    protected readonly cache: WorkspaceCache<unknown, unknown>;
    protected readonly docHelper: DocumentationHelper;
    protected readonly attrHelper: AttributeHelper;

    constructor(services: XsmpSharedServices, cxxStandard: CxxStandard) {
        this.cxxStandard = cxxStandard;
        this.typeProvider = services.TypeProvider;
        this.cache = new WorkspaceCache(services);
        this.docHelper = services.DocumentationHelper;
        this.attrHelper = services.AttributeHelper;
    }

    clean(_projectUri: URI) {
        // ignore
    }

    generate(node: AstNode, projectUri: URI, acceptTask: TaskAcceptor) {
        if (ast.isCatalogue(node)) {
            const notice = CopyrightNoticeProvider.getCopyrightNotice(node.$document, '// ');
            node.elements.forEach(n => this.generateNamespace(n, projectUri, notice, acceptTask));
            this.generatePackage(node, projectUri, notice, acceptTask);
        }
    }

    public generatePackage(catalogue: ast.Catalogue, projectUri: URI, notice: string | undefined, acceptTask: TaskAcceptor) {
        const name = this.catalogueFileName(catalogue);
        const includePath = UriUtils.joinPath(projectUri, this.includeFolder, name + '.h').fsPath;
        acceptTask(() => this.generatePackageHeader(includePath, catalogue, notice));

        const sourcePath = UriUtils.joinPath(projectUri, this.sourceFolder, name + '.cpp').fsPath;
        acceptTask(() => this.generatePackageSource(sourcePath, catalogue, notice));

        const sourceDynPath = UriUtils.joinPath(projectUri, this.sourceFolder, name + '.pkg.cpp').fsPath;
        acceptTask(() => this.generateDynamicPackageSource(sourceDynPath, catalogue, notice));
    }

    protected catalogueFileName(catalogue: ast.Catalogue): string {
        return catalogue.name;
    }

    sourceIncludesCatalogue(catalogue: ast.Catalogue): Include[] {
        return ['unordered_set', `${this.catalogueFileName(catalogue)}.h`];
    }

    /** List of includes required to create a Factory */
    factoryIncludes(): Include[] {
        return [];
    }
    registerComponent(component: ast.Component): string | undefined {
        switch (component.$type) {
            case ast.Model: return this.registerModel(component as ast.Model);
            case ast.Service: return this.registerService(component as ast.Service);
            default: return undefined;
        }
    }
    abstract registerModel(_model: ast.Model): string | undefined;
    registerService(service: ast.Service): string {
        return s`
        // Register Service ${service.name}
        simulator->AddService( new ${this.fqn(service)}(
            "${service.name}", // Name
            ${this.description(service)}, // Description
            simulator, // Parent
            simulator // Simulator
            ));
        
        `;
    }

    async generatePackageHeader(path: string, catalogue: ast.Catalogue, notice: string | undefined) {
        const guard = catalogue.name.toUpperCase() + '_H_';
        await this.generateFile(path, s`
            ${notice}
            // ---------------------------------------------------------------------------
            // File Name    : ${Path.basename(path)}
            // Generated by : ${this.generatedBy()}
            // ---------------------------------------------------------------------------
            /// @file ${Path.basename(path)}
            // This file is auto-generated, Do not edit otherwise your changes will be lost

            #ifndef ${guard}
            #define ${guard}

            // ----------------------------------------------------------------------------
            // --------------------------------- Includes ---------------------------------
            // ----------------------------------------------------------------------------
            #include <Smp/ISimulator.h>
            #include <Smp/Publication/ITypeRegistry.h>

            // Entry points for static library
            extern "C" {
                /// Initialise Package ${catalogue.name}.
                /// @param simulator Simulator for registration of factories.
                /// @param typeRegistry Type Registry for registration of types.
                /// @return True if initialisation was successful, false otherwise.
                bool Initialise_${catalogue.name}(
                    ::Smp::ISimulator* simulator,
                    ::Smp::Publication::ITypeRegistry* typeRegistry);
            
                /// Finalise Package ${catalogue.name}.
                /// @return True if finalisation was successful, false otherwise.
                bool Finalise_${catalogue.name}();
            }

            #endif // ${guard}
            `);
    }

    /**
     * Return the List of ValueType in the Catalogue
     * Keep order as defined in the Catalogue as much as possible
     * Types with dependencies are put at the end
     */
    protected exportedTypes(catalogue: ast.Catalogue): ast.Type[] {
        // collect all types
        const types: ast.Type[] = AstUtils.streamAllContents(catalogue).filter(ast.isValueType).toArray();
        const computeDeps = (type: ast.Type) => {
            if (ast.isArrayType(type)) return [type.itemType.ref];
            if (ast.isValueReference(type)) return [type.type.ref];
            if (ast.isStructure(type)) return this.attrHelper.getAllFields(type).map(field => field.type!.ref).toArray();
            return [];
        };

        // compute the list of dependencies for each Type
        const deps = new Map<ast.Type, ast.Type[]>();

        types.forEach(type => {
            const dependencies = computeDeps(type).filter(dep => dep !== undefined).filter(dep => types.includes(dep));
            deps.set(type, dependencies);
        });

        const result: ast.Type[] = [];
        while (deps.size > 0) {
            const iterator = deps.entries();
            for (const [type, typeDeps] of iterator) {
                // Check if all dependencies are already in result
                if (typeDeps.every(dep => result.includes(dep))) {
                    result.push(type);
                    // Remove the current entry
                    deps.delete(type);
                }
            }
        }
        return result;
    }

    protected constants(type: ast.WithBody): ast.Constant[] {
        const key = { id: 'constants', value: type };
        return this.cache.get(key, () => { return this.sortedConstants(type); }) as ast.Constant[];
    }

    private sortedConstants(type: ast.WithBody): ast.Constant[] {
        // collect all constants
        const constants: ast.Constant[] = type.elements.filter(ast.isConstant);

        // compute the list of dependencies for each constant
        const deps = new Map<ast.Constant, ast.Constant[]>();

        constants.forEach(constant => {
            deps.set(constant, AstUtils.streamAst(constant.value).filter(ast.isNamedElementReference).map(ref => ref.value.ref).filter(ast.isConstant).filter(c => constants.includes(c)).toArray());
        });

        const result: ast.Constant[] = [];
        while (deps.size > 0) {
            const iterator = deps.entries();
            for (const [type, typeDeps] of iterator) {
                // Check if all dependencies are already in result
                if (typeDeps.every(dep => result.includes(dep))) {
                    result.push(type);
                    // Remove the current entry
                    deps.delete(type);
                }
            }
        }
        return result;
    }

    protected registerType(type: ast.Type): string | undefined {
        if (ast.isStructure(type)) {
            return s`
                // register ${getNodeType(type)} ${type.name}
                ${this.fqn(type)}::_Register(typeRegistry);
                `;
        }
        return s`
            // register ${getNodeType(type)} ${type.name}
            ${this.fqn(type.$container as ast.NamedElement)}::_Register_${type.name}(typeRegistry);
            `;

    }

    async generatePackageSource(path: string, catalogue: ast.Catalogue, notice: string | undefined) {
        const deps = this.dependentPackages(catalogue);
        const components = AstUtils.streamAllContents(catalogue).filter(ast.isComponent).filter(component => !isAbstractType(component)).toArray();
        const requiresFactory = components.some(ast.isModel);
        const exportedTypes = this.exportedTypes(catalogue);
        await this.generateFile(path, s`
            ${notice}
            // -----------------------------------------------------------------------------
            // File Name    : ${Path.basename(path)}
            // Generated by : ${this.generatedBy()}
            // -----------------------------------------------------------------------------
            /// @file ${Path.basename(path)}
            // This file is auto-generated, Do not edit otherwise your changes will be lost

            ${this.includes([...this.sourceIncludesCatalogue(catalogue), ...components, ...requiresFactory ? this.factoryIncludes() : [], ...exportedTypes, ...deps.map(d => `${d.name}.h`)])}

            // -----------------------------------------------------------------------------
            // ----------------------------- Global variables ------------------------------
            // -----------------------------------------------------------------------------
            
            namespace {
            /// Simulators set.
            std::unordered_set<::Smp::ISimulator*> simulators { };
            } // namespace
            
            
            // -----------------------------------------------------------------------------
            // --------------------------- Initialise Function -----------------------------
            // -----------------------------------------------------------------------------
            
            extern "C"
            {
                /// Initialise Package ${catalogue.name}.
                /// @param simulator Simulator for registration of factories.
                /// @param typeRegistry Type Registry for registration of types.
                /// @return True if initialisation was successful, false otherwise.
                bool Initialise_${catalogue.name}(
                        ::Smp::ISimulator* simulator,
                        ${this.cxxStandard >= CxxStandard.CXX_STD_17 && deps.length === 0 && exportedTypes.length === 0 ? '[[maybe_unused]] ' : ''}::Smp::Publication::ITypeRegistry* typeRegistry) {
                    // check simulator validity
                    if (!simulator) {
                        return false;
                    }
                    // avoid double initialisation
                    if (!::simulators.emplace(simulator).second) {
                        return true;
                    }
                    ${deps.length > 0 ? `
                        // Initialisation of dependent Package(s)
                        if(${deps.map(dep => `!Initialise_${dep.name}(simulator, typeRegistry)`).join(' || ')}) {
                            return false;
                        }
                        ` : ''}
                    ${exportedTypes.map(this.registerType, this).join('\n')}
                    ${components.map(this.registerComponent, this).join('\n')}
                    
                    return true;
                }
            }
            
            // ---------------------------------------------------------------------------------
            // ---------------------------- Finalise Function ------------------------------
            // ---------------------------------------------------------------------------------
            
            extern "C"
            {
                /// Finalise Package ${catalogue.name}.
                /// @return True if finalisation was successful, false otherwise.
                bool Finalise_${catalogue.name}() {
                    // avoid double finalisation
                    if (::simulators.empty()) {
                        return true;
                    }
                    ::simulators.clear();
                    
                    ${deps.length > 0 ? `// Finalisation of dependent Package(s)
                        return ${deps.map(dep => `Finalise_${dep.name}()`).join(' && ')};
                        ` : 'return true;'}
                }
            }
            
            `);
    }

    async generateDynamicPackageSource(path: string, catalogue: ast.Catalogue, notice: string | undefined) {
        await this.generateFile(path, s`
            ${notice}
            // -----------------------------------------------------------------------------
            // File Name    : ${Path.basename(path)}
            // Generated by : ${this.generatedBy()}
            // -----------------------------------------------------------------------------
            /// @file ${Path.basename(path)}
            // This file is auto-generated, Do not edit otherwise your changes will be lost
            
            // -----------------------------------------------------------------------------
            // --------------------------------- Includes ----------------------------------
            // -----------------------------------------------------------------------------
            #include <${this.catalogueFileName(catalogue)}.h>
            #include <Smp/ISimulator.h>
            #include <Smp/Publication/ITypeRegistry.h>
                            
            #ifdef  WIN32
            #define DLL_EXPORT __declspec(dllexport) // %RELAX<mconst> Visual Studio requires a define
            #else
            #define DLL_EXPORT
            #endif
            
            // -----------------------------------------------------------------------------
            // -------------------------- Initialise Function ------------------------------
            // -----------------------------------------------------------------------------

            extern "C" {
                /// Global Initialise function of Package ${catalogue.name}.
                /// @param simulator Simulator for registration of factories.
                /// @param typeRegistry Type Registry for registration of types.
                /// @return True if initialisation was successful, false otherwise.
                DLL_EXPORT bool Initialise(
                        ::Smp::ISimulator* simulator,
                        ::Smp::Publication::ITypeRegistry* typeRegistry) {
                    return Initialise_${catalogue.name}(simulator, typeRegistry);
                }
            }
            
            // -----------------------------------------------------------------------------
            // ---------------------------- Finalise Function ------------------------------
            // -----------------------------------------------------------------------------

            extern "C" {                        
                /// Global Finalise function of Package ${catalogue.name}.
                /// @param simulator Simulator.
                /// @return True if finalisation was successful, false otherwise.
                DLL_EXPORT bool Finalise(::Smp::ISimulator*) {
                    return Finalise_${catalogue.name}();
                }
            }
            
            `);
    }
    /**
     * Return the list of all direct dependent packages
     */
    public dependentPackages(catalogue: ast.Catalogue): ast.Catalogue[] {
        const dependencies = new Set<ast.Catalogue | undefined>();
        for (const element of AstUtils.streamAllContents(catalogue)) {
            switch (element.$type) {
                case ast.Field:
                    dependencies.add(AstUtils.getContainerOfType((element as ast.Field).type.ref, ast.isCatalogue));
                    break;
                case ast.Property:
                    dependencies.add(AstUtils.getContainerOfType((element as ast.Property).type.ref, ast.isCatalogue));
                    break;
                case ast.Model:
                case ast.Service:
                    dependencies.add(AstUtils.getContainerOfType((element as ast.Component).base?.ref, ast.isCatalogue));
                    break;
                case ast.Class:
                case ast.Exception:
                    dependencies.add(AstUtils.getContainerOfType((element as ast.Class).base?.ref, ast.isCatalogue));
                    break;
                case ast.ArrayType:
                    dependencies.add(AstUtils.getContainerOfType((element as ast.ArrayType).itemType.ref, ast.isCatalogue));
                    break;
            }
        }
        // current Catalogue is not a dependency
        dependencies.delete(catalogue);

        // Remove ecss_smp_smp and sort dependencies by name
        return Array.from(dependencies).filter(dep => dep !== undefined).filter(dep => dep.name !== 'ecss_smp_smp').toSorted((a, b) => a.name.localeCompare(b.name));
    }

    private generateNamespace(namespace: ast.Namespace, projectUri: URI, notice: string | undefined, acceptTask: TaskAcceptor) {
        for (const element of namespace.elements) {
            if (ast.isNamespace(element))
                this.generateNamespace(element, projectUri, notice, acceptTask);
            else
                this.generateType(element, projectUri, notice, acceptTask);
        }
    }

    protected generateType(_type: ast.Type, _projectUri: URI, _notice: string | undefined, _acceptTask: TaskAcceptor) {
        //TODO
    }
    protected async format(path: string, content: string): Promise<string> {
        return await ClangFormat(path, content);
    }

    protected async generateFile(path: string, content: string) {
        try {
            await fs.promises.mkdir(Path.dirname(path), { recursive: true });

            const formatted = await ClangFormat(path, content);
            try {
                // check if existing file is different
                if (await fs.promises.readFile(path, { encoding: 'utf8' }) !== formatted) {
                    await fs.promises.writeFile(path, formatted);
                }
            }
            catch {
                await fs.promises.writeFile(path, formatted, { encoding: 'utf8' });
            }
        } catch (error) {
            console.error(`Error generating file ${path}:`, error);
        }
    }
    protected comment(element: ast.NamedElement): string {
        const comment = this.docHelper.getJSDoc(element);
        if (!comment)
            return '';
        const newLine = '\n///';
        const mapElement = (e: JSDocElement) => {
            if (typeof (e as JSDocTag).name === 'string') {
                const tag = e as JSDocTag;
                if (!tag.inline && (tag.name === 'uuid' || tag.name === 'id'))
                    return undefined;
                let text: string;
                if (tag.name === 'param')
                    text = `@${tag.name} ${tag.content.toString()}`;
                else
                    text = e.toString();

                return ' ' + text.trimEnd().replaceAll('\n', newLine);
            }
            return e.toString().trimEnd().replaceAll('\n', newLine);
        };
        const result = comment.elements.map(mapElement).filter(e => e !== undefined).join(newLine);
        if (result.length === 0) {
            return '';
        }
        return '///' + result + '\n';
    }

    protected fqn(reference: ast.NamedElement | undefined, defaultFqn?: string): string {
        if (!reference) {
            return defaultFqn ?? '';
        }
        const key = { id: 'fqn', value: reference };
        return this.cache.get(key, () => `::${fqn(reference, '::')}`) as string;
    }
    // list of types with uuids defined in namespace ::Smp::Uuids
    static readonly smpUuidsTypes = new Set<string>(['Smp.Uuid', 'Smp.Char8', 'Smp.Bool', 'Smp.Int8', 'Smp.UInt8', 'Smp.Int16', 'Smp.UInt16', 'Smp.Int32',
        'Smp.UInt32', 'Smp.Int64', 'Smp.UInt64', 'Smp.Float32', 'Smp.Float64', 'Smp.Duration', 'Smp.DateTime', 'Smp.String8', 'Smp.PrimitiveTypeKind',
        'Smp.Services.EventId', 'Smp.Services.LogMessageKind', 'Smp.Services.TimeKind', 'Smp.ViewKind', 'Smp.Publication.ParameterDirectionKind', 'Smp.ComponentStateKind', 'Smp.AccessKind',
        'Smp.SimulatorStateKind'
    ]);
    protected uuid(type: ast.Type | undefined): string {
        if (!type) {
            return '::Smp::Uuids::Uuid_Void';
        }

        if (CppGenerator.smpUuidsTypes.has(fqn(type))) {
            return `::Smp::Uuids::Uuid_${type.name}`;
        }
        return `${this.fqn(type.$container as ast.NamedElement)}::Uuid_${type.name}`;
    }

    protected description(element: ast.NamedElement | ast.ReturnParameter): string {
        return `"${escape(this.docHelper.getDescription(element))}"`;
    }

    protected viewKind(element: ast.Property | ast.Field | ast.Operation | ast.EntryPoint, defaultViewKind: string = '::Smp::ViewKind::VK_All'): string {
        const vk = this.attrHelper.getViewKind(element);
        if (vk !== undefined) {
            switch (vk) {
                case ViewKind.VK_None: return '::Smp::ViewKind::VK_None';
                case ViewKind.VK_Debug: return '::Smp::ViewKind::VK_Debug';
                case ViewKind.VK_Expert: return '::Smp::ViewKind::VK_Expert';
                case ViewKind.VK_All: return '::Smp::ViewKind::VK_All';
            }
        }
        return defaultViewKind;
    }
    protected guard(type: ast.Type): string {
        return `${fqn(type, '_').toUpperCase()}_H_`;
    }

    protected expression(expr: ast.Expression | undefined): string {
        if (!expr) {
            return '';
        }
        switch (expr.$type) {
            case ast.CollectionLiteral: {
                const type = this.typeProvider.getType(expr);
                if (ast.isArrayType(type) && ast.isArrayType(type.itemType.ref))
                    return `{ ${(expr as ast.CollectionLiteral).elements.map(e => `{${this.expression(e)}}`, this).join(', ')}}`;
                else if (ast.isStructure(type))
                    return `{ ${(expr as ast.CollectionLiteral).elements.map(e => ast.isArrayType(this.typeProvider.getType(e)) ? `{${this.expression(e)}}` : this.expression(e), this).join(', ')}}`;
                return `{ ${(expr as ast.CollectionLiteral).elements.map(e => this.expression(e), this).join(', ')}}`;
            }
            case ast.DesignatedInitializer: return `/* .${(expr as ast.DesignatedInitializer).field.ref?.name} = */${this.expression((expr as ast.DesignatedInitializer).expr)}`;
            case ast.UnaryOperation: return `${(expr as ast.UnaryOperation).feature}${this.expression((expr as ast.UnaryOperation).operand)}`;
            case ast.BinaryOperation: return `${this.expression((expr as ast.BinaryOperation).leftOperand)} ${(expr as ast.BinaryOperation).feature} ${this.expression((expr as ast.BinaryOperation).rightOperand)}`;
            case ast.ParenthesizedExpression: return `(${this.expression((expr as ast.ParenthesizedExpression).expr)})`;
            case ast.BooleanLiteral: return (expr as ast.BooleanLiteral).isTrue ? 'true' : 'false';
            case ast.BuiltInConstant: return `M_${(expr as ast.BuiltInConstant).name}`;
            case ast.BuiltInFunction: return `std::${(expr as ast.BuiltInFunction).name}(${this.expression((expr as ast.BuiltInFunction).argument)})`;
            case ast.IntegerLiteral: {
                const type = this.typeProvider.getType(expr);
                if (ast.isEnumeration(type)) {
                    const value = Solver.getValueAs(expr, type)?.enumerationLiteral()?.getValue();
                    if (value !== undefined) {
                        return this.fqn(value as ast.EnumerationLiteral);
                    }
                }
                if (this.cxxStandard >= CxxStandard.CXX_STD_14) {
                    return (expr as ast.IntegerLiteral).text;
                }
                return (expr as ast.IntegerLiteral).text.replaceAll("'", '');
            }
            case ast.FloatingLiteral: return (expr as ast.FloatingLiteral).text.replaceAll("'", '');
            case ast.StringLiteral: {
                const kind = getPTK(this.typeProvider.getType(expr));
                switch (kind) {
                    case PTK.Duration:
                    case PTK.DateTime: {
                        const value = Solver.getValue(expr)?.integralValue(kind)?.getValue();
                        if (value !== undefined) { return `${value}L`; }
                        break;
                    }
                }
                return (expr as ast.StringLiteral).$cstNode?.text as string;
            }
            case ast.CharacterLiteral: return (expr as ast.CharacterLiteral).$cstNode?.text as string;
            case ast.KeywordExpression: return (expr as ast.KeywordExpression).name;
            case ast.NamedElementReference: {
                const value = (expr as ast.NamedElementReference).value;
                return value.ref?.$container === AstUtils.getContainerOfType(expr, ast.isType) ? value.ref?.name ?? '' : this.fqn(value.ref);
            }
        }
        return `${expr.$cstNode?.text}`;
    }
    protected stringTypeIsConstexpr(): boolean { return false; }

    protected directListInitializer(expr: ast.Expression | undefined): string {
        if (!expr) return '{}';
        const type = this.typeProvider.getType(expr);
        if (ast.isStructure(type)) // do not add square brackets around struct init
            return this.expression(expr);
        else
            return `{${this.expression(expr)}}`;
    }

    protected namespace(object: AstNode, body: string, generateComments = true): string {
        const namespace = AstUtils.getContainerOfType(object, ast.isNamespace);
        if (namespace !== undefined)
            if (this.cxxStandard >= CxxStandard.CXX_STD_17) {
                const name = fqn(namespace, '::');
                return s`
                    ${generateComments ? this.comment(namespace) : undefined}namespace ${name}
                    {
                        ${body}
                    } // namespace ${name}
                `;
            }
            else
                return this.namespace(namespace.$container,
                    s`
                    ${generateComments ? this.comment(namespace) : undefined}namespace ${namespace.name}
                    {
                        ${body}
                    } // namespace ${namespace.name}
                `);
        else
            return body;
    }
    protected uuidDeclaration(type: ast.Type): string | undefined {
        return s`
            /// Universally unique identifier of type ${type.name}.
            ${this.cxxStandard >= CxxStandard.CXX_STD_17 ? 'inline ' : ''}constexpr ::Smp::Uuid Uuid_${type.name} { ${this.docHelper.getUuid(type)?.toString().trim().split('-').map(u => `0x${u}U`).join(', ')} };
            `;
    }
    protected uuidDefinition(_type: ast.Type): string | undefined {
        return undefined;
    }
    protected primitiveTypeKind(type: ast.Type | undefined): string {
        const kind = getPTK(type);
        return kind === PTK.Enum ? '::Smp::PrimitiveTypeKind::PTK_Int32' : `::Smp::PrimitiveTypeKind::PTK_${PTK[kind]}`;
    }
    protected lower(element: ast.NamedElementWithMultiplicity): string {
        if (element.optional) {
            return '0';
        }
        if (element.multiplicity === undefined) {
            return '1';
        }
        if (element.multiplicity.lower === undefined && element.multiplicity.upper === undefined) {
            return element.multiplicity.aux ? '1' : '0';
        }
        return this.expression(element.multiplicity.lower);
    }

    protected upper(element: ast.NamedElementWithMultiplicity): string {
        if (element.optional || element.multiplicity === undefined) {
            return '1';
        }
        if (element.multiplicity.lower === undefined && element.multiplicity.upper === undefined) {
            return '-1';
        }
        if (element.multiplicity.upper === undefined) {
            return element.multiplicity.aux ? '-1' : this.expression(element.multiplicity.lower);
        }
        return this.expression(element.multiplicity.upper);
    }

    protected eventType(element: ast.EventSink | ast.EventSource): ast.Type | undefined {
        return ast.isEventType(element.type.ref) ? element.type.ref.eventArgs?.ref : undefined;
    }

    protected generatedBy() {
        return `XSMP-${xsmpVersion}`;
    }
    private typeInclude(type: ast.Type): string {
        switch (fqn(type)) {
            case 'Smp.Char8':
            case 'Smp.String8':
            case 'Smp.Float32':
            case 'Smp.Float64':
            case 'Smp.Int8':
            case 'Smp.UInt8':
            case 'Smp.Int16':
            case 'Smp.UInt16':
            case 'Smp.Int32':
            case 'Smp.UInt32':
            case 'Smp.Int64':
            case 'Smp.UInt64':
            case 'Smp.Bool':
            case 'Smp.DateTime':
            case 'Smp.Duration':
            case 'Smp.PrimitiveTypeKind':
                return 'Smp/PrimitiveTypes.h';
            case 'Smp.EventSourceCollection':
                return 'Smp/IEventSource.h';
            case 'Smp.EntryPointCollection':
                return 'Smp/IEntryPoint.h';
            case 'Smp.FactoryCollection':
                return 'Smp/IFactory.h';
            case 'Smp.FailureCollection':
                return 'Smp/IFailure.h';
            case 'Smp.FieldCollection':
                return 'Smp/IField.h';
            case 'Smp.ComponentCollection':
                return 'Smp/IComponent.h';
            case 'Smp.OperationCollection':
                return 'Smp/IOperation.h';
            case 'Smp.ParameterCollection':
                return 'Smp/IParameter.h';
            case 'Smp.PropertyCollection':
                return 'Smp/IProperty.h';
            case 'Smp.AnySimpleArray':
                return 'Smp/AnySimple.h';
            case 'Smp.ModelCollection':
                return 'Smp/IModel.h';
            case 'Smp.ServiceCollection':
                return 'Smp/IService.h';
            case 'Smp.ReferenceCollection':
                return 'Smp/IReference.h';
            case 'Smp.ContainerCollection':
                return 'Smp/IContainer.h';
            case 'Smp.EventSinkCollection':
                return 'Smp/IEventSink.h';
            default:
                return fqn(type, '/') + '.h';
        }
    }

    protected includes(includes: Include[], excludes: Include[] = []): string | undefined {
        if (includes.length === 0) {
            return undefined;
        }
        const includeDeclarations = new Set<string>();
        const includedTypes = new Set<ast.Type>();
        const forwardedTypes = new Set<ast.Type>();
        for (const include of includes) {
            if (typeof include === 'string') {
                includeDeclarations.add(include);
            }
            else if (ForwardedType.is(include)) {
                forwardedTypes.add(include.type);
            }
            else if (include) {
                includedTypes.add(include);
            }
        }

        for (const type of includedTypes) {
            includeDeclarations.add(this.typeInclude(type));
        }
        for (const exclude of excludes) {
            if (typeof exclude === 'string') {
                includeDeclarations.delete(exclude);
            }
            else if (ForwardedType.is(exclude)) {
                forwardedTypes.delete(exclude.type);
            }
            else if (exclude) {
                includeDeclarations.delete(this.typeInclude(exclude));
            }
        }
        for (const type of forwardedTypes) {
            if (includeDeclarations.has(this.typeInclude(type)))
                forwardedTypes.delete(type);
        }

        if (includeDeclarations.size === 0 && forwardedTypes.size === 0) {
            return undefined;
        }
        const sortedIncludes = Array.from(includeDeclarations).toSorted((a, b) => a.localeCompare(b));
        return s`
            ${forwardedTypes.size > 0 ? s`
                // ----------------------------------------------------------------------------
                // --------------------------- Forward Declarations ---------------------------
                // ----------------------------------------------------------------------------
                
                ${Array.from(forwardedTypes).map(type => this.namespace(type, `class ${type.name};`, false), this).join('\n')}

                `: undefined}
            ${sortedIncludes.length > 0 ? s`
                // ----------------------------------------------------------------------------
                // --------------------------- Include Header Files ---------------------------
                // ----------------------------------------------------------------------------

                ${sortedIncludes.map(i => `#include <${i}>`).join('\n')}

                `: undefined}
            `;
    }

    protected headerIncludes(element: ast.NamedElement): Include[] {
        switch (element.$type) {
            case ast.Class: return this.headerIncludesClass(element as ast.Class);
            case ast.Exception: return this.headerIncludesException(element as ast.Exception);
            case ast.Structure: return this.headerIncludesStructure(element as ast.Structure);
            case ast.Integer: return this.headerIncludesInteger(element as ast.Integer);
            case ast.Float: return this.headerIncludesFloat(element as ast.Float);
            case ast.Model: return this.headerIncludesModel(element as ast.Model);
            case ast.Service: return this.headerIncludesService(element as ast.Service);
            case ast.Interface: return this.headerIncludesInterface(element as ast.Interface);
            case ast.ArrayType: return this.headerIncludesArray(element as ast.ArrayType);
            case ast.Enumeration: return this.headerIncludesEnumeration(element as ast.Enumeration);
            case ast.StringType: return this.headerIncludesString(element as ast.StringType);
            case ast.NativeType: return this.headerIncludesNativeType(element as ast.NativeType);
            case ast.Association: return this.headerIncludesAssociation(element as ast.Association);
            case ast.Constant: return this.headerIncludesConstant(element as ast.Constant);
            case ast.Container: return this.headerIncludesContainer(element as ast.Container);
            case ast.EntryPoint: return this.headerIncludesEntryPoint(element as ast.EntryPoint);
            case ast.EventSink: return this.headerIncludesEventSink(element as ast.EventSink);
            case ast.EventSource: return this.headerIncludesEventSource(element as ast.EventSource);
            case ast.Field: return this.headerIncludesField(element as ast.Field);
            case ast.Operation: return this.headerIncludesOperation(element as ast.Operation);
            case ast.Property: return this.headerIncludesProperty(element as ast.Property);
            case ast.Reference: return this.headerIncludesReference(element as ast.Reference);
            case ast.ValueReference: return this.headerIncludesValueReference(element as ast.ValueReference);
            default: return [];
        }
    }
    isForwardable(type: ast.Type | undefined): type is ast.Type {
        return type !== undefined && (ast.isStructure(type) || ast.isReferenceType(type));
    }
    headerIncludesAssociation(element: ast.Association): Include[] {
        if (this.attrHelper.isByPointer(element) && this.isForwardable(element.type.ref))
            return [ForwardedType.create(element.type.ref)];
        return [element.type.ref];
    }
    headerIncludesConstant(element: ast.Constant): Include[] {
        return [element.type.ref, ...this.expressionIncludes(element.value)];
    }
    headerIncludesContainer(element: ast.Container): Include[] {
        return [element.type.ref];
    }
    headerIncludesEntryPoint(_element: ast.EntryPoint): Include[] {
        return [];
    }
    headerIncludesEventSink(element: ast.EventSink): Include[] {
        if (ast.isEventType(element.type.ref) && element.type.ref.eventArgs)
            return ['Smp/PrimitiveTypes.h'];
        return [];
    }
    headerIncludesEventSource(element: ast.EventSource): Include[] {
        if (ast.isEventType(element.type.ref) && element.type.ref.eventArgs)
            return ['Smp/PrimitiveTypes.h'];
        return [];
    }
    headerIncludesField(element: ast.Field): Include[] {
        return [element.type.ref, ...this.expressionIncludes(element.default)];
    }
    headerIncludesParameter(element: ast.Parameter | ast.ReturnParameter | undefined): Include[] {
        if (!element)
            return [];
        return [this.attrHelper.isByPointer(element) && this.isForwardable(element.type.ref) ? ForwardedType.create(element.type.ref) : element.type.ref,
        ...ast.isParameter(element) ? this.expressionIncludes(element.default) : []];
    }

    headerIncludesOperation(element: ast.Operation): Include[] {
        return [...this.headerIncludesParameter(element.returnParameter), ...element.parameter.flatMap(param => this.headerIncludesParameter(param), this)];
    }
    headerIncludesProperty(element: ast.Property): Include[] {
        if (this.attrHelper.isByPointer(element) && this.isForwardable(element.type.ref))
            return [ForwardedType.create(element.type.ref)];
        return [element.type.ref];
    }
    headerIncludesReference(element: ast.Reference): Include[] {
        return [element.interface.ref];
    }
    headerIncludesValueReference(element: ast.ValueReference): Include[] {
        return [element.type.ref];
    }
    headerIncludesClass(type: ast.Class): Include[] {
        return ['Smp/Publication/ITypeRegistry.h', ...type.elements.flatMap(element => this.headerIncludes(element)), type.base?.ref];
    }
    headerIncludesException(type: ast.Exception): Include[] {
        return ['Smp/Publication/ITypeRegistry.h', ...type.elements.flatMap(element => this.headerIncludes(element)), type.base?.ref];
    }
    headerIncludesStructure(type: ast.Structure): Include[] {
        return ['Smp/Publication/ITypeRegistry.h', ...type.elements.flatMap(element => this.headerIncludes(element))];
    }
    headerIncludesInteger(type: ast.Integer): Include[] {
        return ['Smp/Publication/ITypeRegistry.h', 'Smp/PrimitiveTypes.h', ...this.expressionIncludes(type.minimum), ...this.expressionIncludes(type.maximum)];
    }
    headerIncludesFloat(type: ast.Float): Include[] {
        return ['Smp/Publication/ITypeRegistry.h', 'Smp/PrimitiveTypes.h', ...this.expressionIncludes(type.minimum), ...this.expressionIncludes(type.maximum)];
    }
    headerIncludesComponent(type: ast.Component): Include[] {
        return ['Smp/Publication/ITypeRegistry.h', ...type.elements.flatMap(element => this.headerIncludes(element)), type.base?.ref, ...type.interface.map(inter => inter.ref), ForwardedType.create(type)];
    }
    headerIncludesModel(type: ast.Model): Include[] {
        return this.headerIncludesComponent(type);
    }
    headerIncludesService(type: ast.Service): Include[] {
        return this.headerIncludesComponent(type);
    }
    headerIncludesInterface(type: ast.Interface): Include[] {
        return ['Smp/Uuid.h', ...type.elements.flatMap(element => this.headerIncludes(element)), ...type.base.map(inter => inter.ref), ForwardedType.create(type)];
    }
    headerIncludesArray(type: ast.ArrayType): Include[] {
        return ['Smp/Publication/ITypeRegistry.h', type.itemType.ref, ...this.expressionIncludes(type.size)];
    }
    headerIncludesEnumeration(_type: ast.Enumeration): Include[] {
        return ['Smp/Publication/ITypeRegistry.h', 'Smp/PrimitiveTypes.h', 'map', 'string'];
    }
    headerIncludesString(type: ast.StringType): Include[] {
        return ['Smp/Publication/ITypeRegistry.h', ...this.expressionIncludes(type.length)];
    }
    headerIncludesNativeType(type: ast.NativeType): Include[] {
        return ['Smp/Publication/ITypeRegistry.h', this.docHelper.getNativeLocation(type)];
    }
    protected sourceIncludes(element: ast.NamedElement): Include[] {
        switch (element.$type) {
            case ast.Class: return this.sourceIncludesClass(element as ast.Class);
            case ast.Exception: return this.sourceIncludesException(element as ast.Exception);
            case ast.Structure: return this.sourceIncludesStructure(element as ast.Structure);
            case ast.Integer: return this.sourceIncludesInteger(element as ast.Integer);
            case ast.Float: return this.sourceIncludesFloat(element as ast.Float);
            case ast.Model: return this.sourceIncludesModel(element as ast.Model);
            case ast.Service: return this.sourceIncludesService(element as ast.Service);
            case ast.Interface: return this.sourceIncludesInterface(element as ast.Interface);
            case ast.ArrayType: return this.sourceIncludesArray(element as ast.ArrayType);
            case ast.Enumeration: return this.sourceIncludesEnumeration(element as ast.Enumeration);
            case ast.StringType: return this.sourceIncludesString(element as ast.StringType);
            case ast.NativeType: return this.sourceIncludesNativeType(element as ast.NativeType);
            case ast.Association: return this.sourceIncludesAssociation(element as ast.Association);
            case ast.Constant: return this.sourceIncludesConstant(element as ast.Constant);
            case ast.Container: return this.sourceIncludesContainer(element as ast.Container);
            case ast.EntryPoint: return this.sourceIncludesEntryPoint(element as ast.EntryPoint);
            case ast.EventSink: return this.sourceIncludesEventSink(element as ast.EventSink);
            case ast.EventSource: return this.sourceIncludesEventSource(element as ast.EventSource);
            case ast.Field: return this.sourceIncludesField(element as ast.Field);
            case ast.Operation: return this.sourceIncludesOperation(element as ast.Operation);
            case ast.Property: return this.sourceIncludesProperty(element as ast.Property);
            case ast.Reference: return this.sourceIncludesReference(element as ast.Reference);
            case ast.ValueReference: return this.sourceIncludesValueReference(element as ast.ValueReference);
            default: return [];
        }
    }
    sourceIncludesAssociation(element: ast.Association): Include[] {
        if (this.attrHelper.isByPointer(element) && this.isForwardable(element.type.ref))
            return [element.type.ref];
        return [];
    }
    sourceIncludesConstant(_element: ast.Constant): Include[] {
        return [];
    }
    sourceIncludesContainer(_element: ast.Container): Include[] {
        return [];
    }
    sourceIncludesEntryPoint(_element: ast.EntryPoint): Include[] {
        return [];
    }
    sourceIncludesEventSink(_element: ast.EventSink): Include[] {
        return [];
    }
    sourceIncludesEventSource(_element: ast.EventSource): Include[] {
        return [];
    }
    sourceIncludesField(_element: ast.Field): Include[] {
        return [];
    }
    sourceIncludesParameter(element: ast.Parameter | ast.ReturnParameter | undefined): Include[] {
        if (element && this.attrHelper.isByPointer(element) && this.isForwardable(element.type.ref))
            return [element.type.ref];
        return [];
    }
    sourceIncludesOperation(element: ast.Operation): Include[] {
        return [...this.sourceIncludesParameter(element.returnParameter), ...element.parameter.flatMap(param => this.sourceIncludesParameter(param), this)];
    }
    sourceIncludesProperty(element: ast.Property): Include[] {
        if (this.attrHelper.isByPointer(element) && this.isForwardable(element.type.ref))
            return [element.type.ref];
        return [];
    }
    sourceIncludesReference(_element: ast.Reference): Include[] {
        return [];
    }
    sourceIncludesValueReference(_element: ast.ValueReference): Include[] {
        return [];
    }
    sourceIncludesClass(type: ast.Class): Include[] {
        return ['cstddef', 'Smp/Publication/IClassType.h', ...type.elements.flatMap(element => this.sourceIncludes(element))];
    }
    sourceIncludesException(type: ast.Exception): Include[] {
        return this.sourceIncludesClass(type);
    }
    sourceIncludesStructure(type: ast.Structure): Include[] {
        //offsetof needs cstddef
        return ['cstddef', 'Smp/Publication/IStructureType.h', ...type.elements.flatMap(element => this.sourceIncludes(element))];
    }

    expressionIncludes(expr: ast.Expression | undefined): Include[] {
        if (!expr) {
            return [];
        }
        const includes = [];
        for (const element of AstUtils.streamAst(expr)) {
            switch (element.$type) {
                case ast.NamedElementReference:
                    includes.push((element as ast.NamedElementReference).value.ref?.$container);
                    break;
                case ast.BuiltInConstant:
                case ast.BuiltInFunction:
                    includes.push('cmath');
                    break;
            }
        }
        return includes;
    }
    sourceIncludesInteger(type: ast.Integer): Include[] {
        const includes = [
            ...this.expressionIncludes(type.minimum),
            ...this.expressionIncludes(type.maximum)
        ];
        return (type.minimum === undefined || type.maximum === undefined) ? ['limits', ...includes] : includes;
    }
    sourceIncludesFloat(type: ast.Float): Include[] {
        const includes = [
            ...this.expressionIncludes(type.minimum),
            ...this.expressionIncludes(type.maximum)
        ];
        return (type.minimum === undefined || type.maximum === undefined) ? ['limits', ...includes] : includes;
    }
    sourceIncludesComponent(type: ast.Component): Include[] {
        return [...type.elements.flatMap(element => this.sourceIncludes(element))];
    }
    sourceIncludesModel(type: ast.Model): Include[] {
        return this.sourceIncludesComponent(type);
    }
    sourceIncludesService(type: ast.Service): Include[] {
        return this.sourceIncludesComponent(type);
    }
    sourceIncludesInterface(type: ast.Interface): Include[] {
        return [...type.elements.flatMap(element => this.sourceIncludes(element))];
    }
    sourceIncludesArray(type: ast.ArrayType): Include[] {
        return ['Smp/Publication/IArrayType.h', ...this.expressionIncludes(type.size)];
    }
    sourceIncludesEnumeration(_type: ast.Enumeration): Include[] {
        return ['Smp/Publication/IEnumerationType.h'];
    }
    sourceIncludesString(type: ast.StringType): Include[] {
        return ['Smp/Publication/IType.h', ...this.expressionIncludes(type.length)];
    }
    sourceIncludesNativeType(_type: ast.NativeType): Include[] {
        return [];
    }
    /*protected declare(element: ast.NamedElement): string | undefined {
        switch (element.$type) {
            case ast.Association: return this.declareAssociation(element as ast.Association);
            case ast.Constant: return this.declareConstant(element as ast.Constant);
            case ast.Container: return this.declareContainer(element as ast.Container);
            case ast.EntryPoint: return this.declareEntryPoint(element as ast.EntryPoint);
            case ast.EventSink: return this.declareEventSink(element as ast.EventSink);
            case ast.EventSource: return this.declareEventSource(element as ast.EventSource);
            case ast.Field: return this.declareField(element as ast.Field);
            case ast.Operation: return this.declareOperation(element as ast.Operation);
            case ast.Property: return this.declareProperty(element as ast.Property);
            case ast.Reference: return this.declareReference(element as ast.Reference);
            default: return undefined;
        }
    }*/
    protected define(element: ast.NamedElement): string | undefined {
        switch (element.$type) {
            case ast.Association: return this.defineAssociation(element as ast.Association);
            case ast.Constant: return this.defineConstant(element as ast.Constant);
            case ast.Container: return this.defineContainer(element as ast.Container);
            case ast.EntryPoint: return this.defineEntryPoint(element as ast.EntryPoint);
            case ast.EventSink: return this.defineEventSink(element as ast.EventSink);
            case ast.EventSource: return this.defineEventSource(element as ast.EventSource);
            case ast.Field: return this.defineField(element as ast.Field);
            case ast.Operation: return this.defineOperation(element as ast.Operation);
            case ast.Property: return this.defineProperty(element as ast.Property);
            case ast.Reference: return this.defineReference(element as ast.Reference);
            default: return undefined;
        }
    }

    protected finalize(element: ast.NamedElement): string | undefined {
        switch (element.$type) {
            case ast.Association: return this.finalizeAssociation(element as ast.Association);
            case ast.Constant: return this.finalizeConstant(element as ast.Constant);
            case ast.Container: return this.finalizeContainer(element as ast.Container);
            case ast.EntryPoint: return this.finalizeEntryPoint(element as ast.EntryPoint);
            case ast.EventSink: return this.finalizeEventSink(element as ast.EventSink);
            case ast.EventSource: return this.finalizeEventSource(element as ast.EventSource);
            case ast.Field: return this.finalizeField(element as ast.Field);
            case ast.Operation: return this.finalizeOperation(element as ast.Operation);
            case ast.Property: return this.finalizeProperty(element as ast.Property);
            case ast.Reference: return this.finalizeReference(element as ast.Reference);
            default: return undefined;
        }
    }
    protected finalizePointer(element: ast.NamedElement): string | undefined {
        return s`
            delete ${element.name};
            ${element.name} = nullptr;
            `;
    }

    protected finalizeMembers(container: ast.WithBody): string {
        return container.elements.map(element => this.finalize(element), this).filter(v => v !== undefined).join('\n');
    }
    protected constructMembers(container: ast.WithBody): string {
        return container.elements.map(element => this.construct(element), this).filter(v => v !== undefined).join('\n');
    }
    protected construct(element: ast.NamedElement): string | undefined {
        switch (element.$type) {
            case ast.Association: return this.constructAssociation(element as ast.Association);
            case ast.Constant: return this.constructConstant(element as ast.Constant);
            case ast.Container: return this.constructContainer(element as ast.Container);
            case ast.EntryPoint: return this.constructEntryPoint(element as ast.EntryPoint);
            case ast.EventSink: return this.constructEventSink(element as ast.EventSink);
            case ast.EventSource: return this.constructEventSource(element as ast.EventSource);
            case ast.Field: return this.constructField(element as ast.Field);
            case ast.Operation: return this.constructOperation(element as ast.Operation);
            case ast.Property: return this.constructProperty(element as ast.Property);
            case ast.Reference: return this.constructReference(element as ast.Reference);
            default: return undefined;
        }
    }
    protected declareAssociation(_element: ast.Association): string | undefined {
        return undefined;
    }
    protected defineAssociation(_element: ast.Association): string | undefined {
        return undefined;
    }
    protected initializeAssociation(_element: ast.Association): string | undefined {
        return undefined;
    }
    protected constructAssociation(_element: ast.Association): string | undefined {
        return undefined;
    }
    protected finalizeAssociation(_element: ast.Association): string | undefined {
        return undefined;
    }

    protected declareConstant(_element: ast.Constant): string | undefined {
        return undefined;
    }
    protected defineConstant(_element: ast.Constant): string | undefined {
        return undefined;
    }
    protected initializeConstant(_element: ast.Constant): string | undefined {
        return undefined;
    }
    protected constructConstant(_element: ast.Constant): string | undefined {
        return undefined;
    }
    protected finalizeConstant(_element: ast.Constant): string | undefined {
        return undefined;
    }

    protected declareContainer(_element: ast.Container): string | undefined {
        return undefined;
    }
    protected defineContainer(_element: ast.Container): string | undefined {
        return undefined;
    }
    protected initializeContainer(_element: ast.Container): string | undefined {
        return undefined;
    }
    protected constructContainer(_element: ast.Container): string | undefined {
        return undefined;
    }
    protected finalizeContainer(element: ast.Container): string | undefined {
        return this.finalizePointer(element);
    }

    protected declareEntryPoint(_element: ast.EntryPoint): string | undefined {
        return undefined;
    }
    protected defineEntryPoint(_element: ast.EntryPoint): string | undefined {
        return undefined;
    }
    protected initializeEntryPoint(_element: ast.EntryPoint): string | undefined {
        return undefined;
    }
    protected constructEntryPoint(_element: ast.EntryPoint): string | undefined {
        return undefined;
    }
    protected finalizeEntryPoint(element: ast.EntryPoint): string | undefined {
        return this.finalizePointer(element);
    }

    protected declareEventSink(_element: ast.EventSink): string | undefined {
        return undefined;
    }
    protected defineEventSink(_element: ast.EventSink): string | undefined {
        return undefined;
    }
    protected initializeEventSink(_element: ast.EventSink): string | undefined {
        return undefined;
    }
    protected constructEventSink(_element: ast.EventSink): string | undefined {
        return undefined;
    }
    protected finalizeEventSink(element: ast.EventSink): string | undefined {
        return this.finalizePointer(element);
    }

    protected declareEventSource(_element: ast.EventSource): string | undefined {
        return undefined;
    }
    protected defineEventSource(_element: ast.EventSource): string | undefined {
        return undefined;
    }
    protected initializeEventSource(_element: ast.EventSource): string | undefined {
        return undefined;
    }
    protected constructEventSource(_element: ast.EventSource): string | undefined {
        return undefined;
    }
    protected finalizeEventSource(element: ast.EventSource): string | undefined {
        return this.finalizePointer(element);
    }

    protected declareField(_element: ast.Field): string | undefined {
        return undefined;
    }
    protected defineField(_element: ast.Field): string | undefined {
        return undefined;
    }
    protected initializeField(_element: ast.Field): string | undefined {
        return undefined;
    }
    protected constructField(_element: ast.Field): string | undefined {
        return undefined;
    }
    protected finalizeField(_element: ast.Field): string | undefined {
        return undefined;
    }

    protected declareOperation(_element: ast.Operation): string | undefined {
        return undefined;
    }
    protected defineOperation(_element: ast.Operation): string | undefined {
        return undefined;
    }
    protected initializeOperation(_element: ast.Operation): string | undefined {
        return undefined;
    }
    protected constructOperation(_element: ast.Operation): string | undefined {
        return undefined;
    }
    protected finalizeOperation(_element: ast.Operation): string | undefined {
        return undefined;
    }

    protected declareProperty(_element: ast.Property): string | undefined {
        return undefined;
    }
    protected defineProperty(_element: ast.Property): string | undefined {
        return undefined;
    }
    protected initializeProperty(_element: ast.Property): string | undefined {
        return undefined;
    }
    protected constructProperty(_element: ast.Property): string | undefined {
        return undefined;
    }
    protected finalizeProperty(_element: ast.Property): string | undefined {
        return undefined;
    }

    protected declareReference(_element: ast.Reference): string | undefined {
        return undefined;
    }
    protected defineReference(_element: ast.Reference): string | undefined {
        return undefined;
    }
    protected initializeReference(_element: ast.Reference): string | undefined {
        return undefined;
    }
    protected constructReference(_element: ast.Reference): string | undefined {
        return undefined;
    }
    protected finalizeReference(element: ast.Reference): string | undefined {
        return this.finalizePointer(element);
    }

    protected isInvokable(element: ast.Invokable): boolean {
        if (ast.isProperty(element)) {
            return ast.isSimpleType(element.type.ref);
        }
        if (element.returnParameter && !ast.isSimpleType(element.returnParameter.type.ref)) {
            return false;
        }
        return element.parameter.every(param => ast.isSimpleType(param.type.ref));
    }
    protected componentBase(type: ast.Component): string | undefined {
        if (type.base) { return this.fqn(type.base.ref); }
        return undefined;
    }

    protected componentBases(type: ast.Component): string[] {
        const bases: string[] = [];
        const base = this.componentBase(type);

        if (base !== undefined) {
            bases.push(`public ${base}`);
        }
        bases.push(...type.interface.map(inter => `public virtual ${this.fqn(inter.ref)}`, this));

        return bases;
    }

    protected publishMember(element: ast.Publicable): string | undefined {
        switch (element.$type) {
            case ast.Field: return this.publishField(element);
            case ast.Operation: return this.publishOperation(element);
            case ast.Property: return this.publishProperty(element);
        }
    }
    protected isCdkField(_field: ast.Field): boolean {
        return false;
    }

    protected publishField(field: ast.Field): string | undefined {
        if (this.isCdkField(field)) {
            return s`
            // Publish field ${field.name}
            receiver->PublishField(&${field.name});
            `;
        }
        if (ast.isPrimitiveType(field.type.ref)) {
            switch (getPTK(field.type.ref)) {
                case PTK.Bool:
                case PTK.Char8:
                case PTK.Float32:
                case PTK.Float64:
                case PTK.Int8:
                case PTK.Int16:
                case PTK.Int32:
                case PTK.Int64:
                case PTK.UInt8:
                case PTK.UInt16:
                case PTK.UInt32:
                case PTK.UInt64:
                    // Publish directly with address of the field (not valid for DateTime and Duration that are identical to Int64)
                    return s`
                        // Publish field ${field.name}
                        receiver->PublishField(
                            "${field.name}", // Name
                            ${this.description(field)}, // Description
                            &${field.name}, // Address
                            ${this.viewKind(field)}, // View Kind
                            ${isState(field)}, // State
                            ${isInput(field)}, // Input
                            ${isOutput(field)} // Output
                        );
                        `;
                case PTK.String8:
                    return s`
                        // WARNING: Field ${field.name} of type ::Smp::String8 is not publicable.
                        
                        `;
            }
        }
        // Generic Publish with type UUID
        return s`
            // Publish field ${field.name}
            receiver->PublishField(
                "${field.name}", // Name
                ${this.description(field)}, // Description
                &${field.name}, // Address
                ${this.uuid(field.type.ref)}, // Type UUID
                ${this.viewKind(field)}, // View Kind
                ${isState(field)}, // State
                ${isInput(field)}, // Input
                ${isOutput(field)} // Output
            );
            `;
    }
    parameterDirectionKind(param: ast.Parameter | ast.ReturnParameter): string {
        if (ast.isReturnParameter(param)) return 'Smp::Publication::ParameterDirectionKind::PDK_Return';
        switch (param.direction ?? 'in') {
            case 'out': return 'Smp::Publication::ParameterDirectionKind::PDK_Out';
            case 'inout': return 'Smp::Publication::ParameterDirectionKind::PDK_InOut';
            case 'in': return 'Smp::Publication::ParameterDirectionKind::PDK_In';
        }
    }

    publishOperation(op: ast.Operation): string | undefined {
        if (this.isInvokable(op)) {
            const r = op.returnParameter;
            return s`
                // Publish operation ${op.name}
                ${r || op.parameter.length > 0 ? `auto* op_${op.name} = ` : ''}receiver->PublishOperation(
                    "${op.name}", // Name
                    ${this.description(op)}, // Description
                    ${this.viewKind(op)} // View Kind
                );
                ${op.parameter.map(param => `op_${op.name}->PublishParameter(
                    "${param.name}", // Name
                    ${this.description(param)}, // Description
                    ${this.uuid(param.type.ref)}, // Type UUID
                    ${this.parameterDirectionKind(param)} // Parameter Direction Kind
                );`).join('\n')}
                ${r ? `op_${op.name}->PublishParameter(
                    "${r.name ?? 'return'}", // Name
                    ${this.description(r)}, // Description
                    ${this.uuid(r.type.ref)}, // Type UUID
                    ${this.parameterDirectionKind(r)} // Parameter Direction Kind
                );` : ''}
                `;
        }
        return undefined;
    }
    publishProperty(property: ast.Property): string | undefined {
        if (this.isInvokable(property)) {
            return s`
                // Publish Property ${property.name}
                receiver->PublishProperty(
                    "${property.name}", // Name
                    ${this.description(property)}, // Description
                    ${this.uuid(property.type.ref)}, // Type UUID
                    ${this.accessKind(property)}, // Access Kind
                    ${this.viewKind(property)} // View Kind
                );
                `;
        }
        return undefined;
    }
    accessKind(element: ast.Property): string {
        const kind = getAccessKind(element);
        switch (kind) {
            case 'readOnly': return '::Smp::AccessKind::AK_ReadOnly';
            case 'writeOnly': return '::Smp::AccessKind::AK_WriteOnly';
            case 'readWrite':
            default:
                return '::Smp::AccessKind::AK_ReadWrite';
        }
    }
    protected publishMembers(type: ast.WithBody): string {
        return type.elements.filter(ast.isPublicable).map(this.publishMember, this).filter(text => text !== undefined).join('\n');
    }
    protected declareParameter(param: ast.Parameter): string {
        return `${this.type(param)} ${param.name}${param.default ? ' = ' + this.expression(param.default) : ''}`;
    }
    protected defineParameter(param: ast.Parameter): string {
        return `${this.type(param)} ${param.name}`;
    }

    protected type(elem: ast.Parameter | ast.ReturnParameter | ast.Association | ast.Property | undefined): string {
        if (!elem) { return 'void'; }
        return `${this.attrHelper.isConst(elem) ? 'const ' : ''}${this.fqn(elem.type.ref)}${this.attrHelper.isByPointer(elem) ? '*' : ''}${!ast.isAssociation(elem) && this.attrHelper.isByReference(elem) ? '&' : ''}`;
    }

    protected getDefaultValueForType(type: ast.Type | undefined): string {
        if (!type) {
            return '';
        }

        if (ast.isArrayType(type)) {
            const value = Solver.getValueAs(type.size, PTK.Int64)?.integralValue(PTK.Int64)?.getValue();
            return value ? `{${new Array(Number(value)).fill(this.getDefaultValueForType(type.itemType.ref)).join(', ')}}` : '{}';
        }
        if (ast.isStructure(type)) {
            return `{${this.attrHelper.getAllFields(type).map(f => `/*.${f.name} = */${this.getDefaultValueForType(f.type!.ref)}`).join(', ')}}`;
        }

        if (ast.isEnumeration(type)) {
            return type.literal.length > 0 ? this.fqn(type.literal[0]) : '0';
        }

        switch (getPTK(type)) {
            case PTK.Bool:
                return 'false';
            case PTK.Float32:
                return '0.0f';
            case PTK.Float64:
                return '0.0';
            case PTK.Int8:
            case PTK.Int16:
            case PTK.Int32:
                return '0';
            case PTK.DateTime:
            case PTK.Duration:
            case PTK.Int64:
                return '0L';
            case PTK.UInt8:
            case PTK.UInt16:
            case PTK.UInt32:
                return '0U';
            case PTK.UInt64:
                return '0UL';
            case PTK.Char8:
                return "'\\0'";
            case PTK.String8:
                return '""';

        }
        return '{}';
    }

    protected operationName(op: ast.Operation): string {
        switch (this.attrHelper.operatorKind(op)) {
            case OperatorKind.NONE:
                return op.name;
            case OperatorKind.ADD:
                return 'operator+=';
            case OperatorKind.ASSIGN:
                return 'operator=';
            case OperatorKind.DIFFERENCE:
            case OperatorKind.NEGATIVE:
                return 'operator-';
            case OperatorKind.DIVIDE:
                return 'operator/=';
            case OperatorKind.EQUAL:
                return 'operator==';
            case OperatorKind.GREATER:
                return 'operator>';
            case OperatorKind.INDEXER:
                return 'operator[]';
            case OperatorKind.LESS:
                return 'operator<';
            case OperatorKind.MODULE:
                return 'operator%';
            case OperatorKind.MULTIPLY:
                return 'operator*=';
            case OperatorKind.NOT_EQUAL:
                return 'operator!=';
            case OperatorKind.NOT_GREATER:
                return 'operator<=';
            case OperatorKind.NOT_LESS:
                return 'operator>=';
            case OperatorKind.POSITIVE:
            case OperatorKind.SUM:
                return 'operator+';
            case OperatorKind.PRODUCT:
                return 'operator*';
            case OperatorKind.QUOTIENT:
                return 'operator/';
            case OperatorKind.REMAINDER:
                return 'operator%=';
            case OperatorKind.SUBTRACT:
                return 'operator-=';
        }

    }
}

