import * as ast from '../../generated/ast.js';
import * as fs from 'fs';
import { expandToString as s } from 'langium/generate';
import { type URI, UriUtils } from 'langium';
import { fqn, getAccessKind, getRealVisibility, isInput, isOutput, isState, isString8 } from '../../utils/xsmp-utils.js';
import { CppGenerator, CxxStandard } from './generator.js';
import type { TaskAcceptor } from '../generator.js';
import type { XsmpSharedServices } from '../../xsmp-module.js';
import * as Path from 'path';
import { VisibilityKind } from '../../utils/visibility-kind.js';

export abstract class GapPatternCppGenerator extends CppGenerator {

    protected static readonly defaultIncludeGenFolder = 'src-gen';
    protected static readonly defaultSourceGenFolder = 'src-gen';
    protected includeGenFolder = GapPatternCppGenerator.defaultIncludeGenFolder;
    protected sourceGenFolder = GapPatternCppGenerator.defaultSourceGenFolder;
    constructor(services: XsmpSharedServices, cxxStandard: CxxStandard) {
        super(services, cxxStandard);
    }

    override clean(projectUri: URI) {
        fs.rmSync(UriUtils.joinPath(projectUri, this.includeGenFolder).fsPath, { recursive: true, force: true });
        if (this.includeGenFolder !== this.sourceGenFolder) {
            fs.rmSync(UriUtils.joinPath(projectUri, this.sourceGenFolder).fsPath, { recursive: true, force: true });
        }
    }
    name(element: ast.NamedElement | string, gen: boolean): string {
        const genSuffix = 'Gen';
        if (typeof (element) === 'string')
            return gen ? element + genSuffix : element;
        return gen ? element.name + genSuffix : element.name;
    }
    protected useGenerationGapPattern(type: ast.Type): boolean {
        return ast.isReferenceType(type);
    }

    public override generatePackage(catalogue: ast.Catalogue, projectUri: URI, notice: string | undefined, acceptTask: TaskAcceptor): void {
        const name = this.catalogueFileName(catalogue);
        const includePath = UriUtils.joinPath(projectUri, this.includeGenFolder, name + '.h').fsPath;
        acceptTask(() => this.generatePackageHeader(includePath, catalogue, notice));

        const sourcePath = UriUtils.joinPath(projectUri, this.sourceGenFolder, name + '.cpp').fsPath;
        acceptTask(() => this.generatePackageSource(sourcePath, catalogue, notice));

        const sourceDynPath = UriUtils.joinPath(projectUri, this.sourceGenFolder, name + '.pkg.cpp').fsPath;
        acceptTask(() => this.generateDynamicPackageSource(sourceDynPath, catalogue, notice));
    }

    protected override generateType(type: ast.Type, projectUri: URI, notice: string | undefined, acceptTask: TaskAcceptor) {

        const qualifiedName = fqn(type, '/');

        // include path of user code
        const includePath = UriUtils.joinPath(projectUri, this.includeFolder, qualifiedName + '.h').fsPath;

        // if the file already exist in include directories or the type requires the generation gap
        // pattern, use the generation gap pattern
        const includePathExist = fs.existsSync(includePath);
        const useGenerationGapPattern = includePathExist || this.useGenerationGapPattern(type);

        // generate header in include directory
        if (useGenerationGapPattern && !includePathExist) {
            acceptTask(() => this.generateHeader(includePath, type, notice));
        }

        // generate source in src directory if file does not exist
        const sourcePath = UriUtils.joinPath(projectUri, this.sourceFolder, qualifiedName + '.cpp').fsPath;
        if (!fs.existsSync(sourcePath)) {
            acceptTask(() => this.generateSource(sourcePath, type, notice));
        }

        const qualifiedNameGen = this.name(qualifiedName, useGenerationGapPattern);

        const includeGenPath = UriUtils.joinPath(projectUri, this.includeGenFolder, qualifiedNameGen + '.h').fsPath;
        acceptTask(() => this.generateHeaderGen(includeGenPath, type, useGenerationGapPattern, notice));

        const sourceGenPath = UriUtils.joinPath(projectUri, this.sourceGenFolder, qualifiedNameGen + '.cpp').fsPath;
        acceptTask(() => this.generateSourceGen(sourceGenPath, type, useGenerationGapPattern, notice));
    }

    public async generateHeader(path: string, type: ast.Type, notice: string | undefined) {
        let body: string | undefined;
        switch (type.$type) {
            case ast.Class:
                body = await this.generateClassHeader(type as ast.Class);
                break;
            case ast.Exception:
                body = await this.generateExceptionHeader(type as ast.Exception);
                break;
            case ast.Structure:
                body = await this.generateStructureHeader(type as ast.Structure);
                break;
            case ast.Integer:
                body = await this.generateIntegerHeader(type as ast.Integer);
                break;
            case ast.Float:
                body = await this.generateFloatHeader(type as ast.Float);
                break;
            case ast.Model:
            case ast.Service:
                body = await this.generateComponentHeader(type as ast.Component);
                break;
            case ast.Interface:
                body = await this.generateInterfaceHeader(type as ast.Interface);
                break;
            case ast.ArrayType:
                body = await this.generateArrayHeader(type as ast.ArrayType);
                break;
            case ast.Enumeration:
                body = await this.generateEnumerationHeader(type as ast.Enumeration);
                break;
            case ast.StringType:
                body = await this.generateStringHeader(type as ast.StringType);
                break;
            case ast.NativeType:
                body = await this.generateNativeTypeHeader(type as ast.NativeType);
                break;
            case ast.ValueReference:
                body = await this.generateValueReferenceHeader(type as ast.ValueReference);
                break;
        }
        if (body?.length) {
            const guard = this.guard(type);
            await this.generateFile(path, s`
                ${notice}
                // -----------------------------------------------------------------------------
                // File Name    : ${Path.basename(path)}
                // Generated by : ${this.generatedBy()}
                // -----------------------------------------------------------------------------
                /// @file ${fqn(type, '/')}.h

                #ifndef ${guard}
                #define ${guard}

                // Include the generated header file
                #include <${fqn(type, '/')}Gen.h>

                ${this.namespace(type, body)}

                #endif // ${guard}
                `);
        }
    }

    public async generateSource(path: string, type: ast.Type, notice: string | undefined) {
        let body: string | undefined;
        switch (type.$type) {
            case ast.Class:
                body = await this.generateClassSource(type as ast.Class);
                break;
            case ast.Exception:
                body = await this.generateExceptionSource(type as ast.Exception);
                break;
            case ast.Structure:
                body = await this.generateStructureSource(type as ast.Structure);
                break;
            case ast.Integer:
                body = await this.generateIntegerSource(type as ast.Integer);
                break;
            case ast.Float:
                body = await this.generateFloatSource(type as ast.Float);
                break;
            case ast.Model:
            case ast.Service:
                body = await this.generateComponentSource(type as ast.Component);
                break;
            case ast.Interface:
                body = await this.generateInterfaceSource(type as ast.Interface);
                break;
            case ast.ArrayType:
                body = await this.generateArraySource(type as ast.ArrayType);
                break;
            case ast.Enumeration:
                body = await this.generateEnumerationSource(type as ast.Enumeration);
                break;
            case ast.StringType:
                body = await this.generateStringSource(type as ast.StringType);
                break;
            case ast.NativeType:
                body = await this.generateNativeTypeSource(type as ast.NativeType);
                break;
            case ast.ValueReference:
                body = await this.generateValueReferenceSource(type as ast.ValueReference);
                break;
        }
        if (body?.length) {
            await this.generateFile(path, s`
                ${notice}
                // -----------------------------------------------------------------------------
                // File Name    : ${Path.basename(path)}
                // Generated by : ${this.generatedBy()}
                // -----------------------------------------------------------------------------
                /// @file ${fqn(type, '/')}.cpp

                #include <${fqn(type, '/')}.h>

                ${this.namespace(type, body)}
                `);
        }
    }
    public async generateHeaderGen(path: string, type: ast.Type, gen: boolean, notice: string | undefined) {
        let body: string | undefined;
        switch (type.$type) {
            case ast.Class:
                body = await this.generateClassHeaderGen(type as ast.Class, gen);
                break;
            case ast.Exception:
                body = await this.generateExceptionHeaderGen(type as ast.Exception, gen);
                break;
            case ast.Structure:
                body = await this.generateStructureHeaderGen(type as ast.Structure, gen);
                break;
            case ast.Integer:
                body = await this.generateIntegerHeaderGen(type as ast.Integer, gen);
                break;
            case ast.Float:
                body = await this.generateFloatHeaderGen(type as ast.Float, gen);
                break;
            case ast.Model:
            case ast.Service:
                body = await this.generateComponentHeaderGen(type as ast.Component, gen);
                break;
            case ast.Interface:
                body = await this.generateInterfaceHeaderGen(type as ast.Interface, gen);
                break;
            case ast.ArrayType:
                body = await this.generateArrayHeaderGen(type as ast.ArrayType, gen);
                break;
            case ast.Enumeration:
                body = await this.generateEnumerationHeaderGen(type as ast.Enumeration, gen);
                break;
            case ast.StringType:
                body = await this.generateStringHeaderGen(type as ast.StringType, gen);
                break;
            case ast.NativeType:
                body = await this.generateNativeTypeHeaderGen(type as ast.NativeType, gen);
                break;
            case ast.ValueReference:
                body = await this.generateValueReferenceHeaderGen(type as ast.ValueReference, gen);
                break;
        }
        if (body?.length) {
            const guard = this.name(fqn(type, '_'), gen).toUpperCase() + '_H_';
            await this.generateFile(path, s`
                ${notice}
                // -----------------------------------------------------------------------------
                // File Name    : ${Path.basename(path)}
                // Generated by : ${this.generatedBy()}
                // -----------------------------------------------------------------------------
                /// @file ${this.name(fqn(type, '/'), gen)}.h
                // This file is auto-generated, Do not edit otherwise your changes will be lost

                #ifndef ${guard}
                #define ${guard}

                ${this.includes(this.headerIncludes(type), [type])}
                // ----------------------------------------------------------------------------
                // --------------------------- Types and Interfaces ---------------------------
                // ----------------------------------------------------------------------------

                ${this.namespace(type, body)}

                #endif // ${guard}

                `);
        }
    }

    public async generateSourceGen(path: string, type: ast.Type, gen: boolean, notice: string | undefined) {
        let body: string | undefined;
        switch (type.$type) {
            case ast.Class:
                body = await this.generateClassSourceGen(type as ast.Class, gen);
                break;
            case ast.Exception:
                body = await this.generateExceptionSourceGen(type as ast.Exception, gen);
                break;
            case ast.Structure:
                body = await this.generateStructureSourceGen(type as ast.Structure, gen);
                break;
            case ast.Integer:
                body = await this.generateIntegerSourceGen(type as ast.Integer, gen);
                break;
            case ast.Float:
                body = await this.generateFloatSourceGen(type as ast.Float, gen);
                break;
            case ast.Model:
            case ast.Service:
                body = await this.generateComponentSourceGen(type as ast.Component, gen);
                break;
            case ast.Interface:
                body = await this.generateInterfaceSourceGen(type as ast.Interface, gen);
                break;
            case ast.ArrayType:
                body = await this.generateArraySourceGen(type as ast.ArrayType, gen);
                break;
            case ast.Enumeration:
                body = await this.generateEnumerationSourceGen(type as ast.Enumeration, gen);
                break;
            case ast.StringType:
                body = await this.generateStringSourceGen(type as ast.StringType, gen);
                break;
            case ast.NativeType:
                body = await this.generateNativeTypeSourceGen(type as ast.NativeType, gen);
                break;
            case ast.ValueReference:
                body = await this.generateValueReferenceSourceGen(type as ast.ValueReference, gen);
                break;
        }
        if (body?.length) {
            await this.generateFile(path, s`
                ${notice}
                // -----------------------------------------------------------------------------
                // File Name    : ${Path.basename(path)}
                // Generated by : ${this.generatedBy()}
                // -----------------------------------------------------------------------------
                /// @file ${this.name(fqn(type, '/'), gen)}.cpp
                // This file is auto-generated, Do not edit otherwise your changes will be lost

                ${this.includes([...this.sourceIncludes(type), type])} 

                ${this.namespace(type, body)}
                `);
        }
    }
    async generateTypeHeader(type: ast.Type): Promise<string | undefined> {
        return s`
        ${this.comment(type)}using ${type.name} = ${type.name}Gen;
        `;
    }
    async generateNativeTypeHeader(type: ast.NativeType): Promise<string | undefined> {
        return this.generateTypeHeader(type);
    }
    async generateNativeTypeSource(_type: ast.NativeType): Promise<string | undefined> {
        return undefined;
    }
    async generateNativeTypeHeaderGen(type: ast.NativeType, gen: boolean): Promise<string | undefined> {
        const namespace = this.docHelper.getNativeNamespace(type);
        return `${this.comment(type)}using ${this.name(type, gen)} = ${namespace ? namespace + '::' : ''}${this.docHelper.getNativeType(type)};`;
    }
    async generateNativeTypeSourceGen(_type: ast.NativeType, _gen: boolean): Promise<string | undefined> {
        return undefined;
    }

    async generateValueReferenceHeader(type: ast.ValueReference): Promise<string | undefined> {
        return this.generateTypeHeader(type);
    }
    async generateValueReferenceSource(_type: ast.ValueReference): Promise<string | undefined> {
        return undefined;
    }
    async generateValueReferenceHeaderGen(type: ast.ValueReference, gen: boolean): Promise<string | undefined> {
        return s`
        ${this.comment(type)}using ${this.name(type, gen)} = ${this.fqn(type.type.ref)} *;
        
        ${this.uuidDeclaration(type)}
        `;
    }
    async generateValueReferenceSourceGen(type: ast.ValueReference, _gen: boolean): Promise<string | undefined> {
        return this.uuidDefinition(type);
    }

    async generateClassHeader(type: ast.Class): Promise<string | undefined> {
        return s`
            ${this.comment(type)}class ${type.name}: public ${type.name}Gen
            {
                friend class ${this.fqn(type)}Gen;
            public:
                ${type.name}() = default;
                ${type.name}(const ${type.name}&) = default;
                ${this.declareMembers(type, VisibilityKind.public)}
            };
        `;
    }
    async generateClassSource(type: ast.Class): Promise<string | undefined> {
        return s`
            ${this.defineMembers(type, false)}
            `;
    }
    async generateClassHeaderGen(type: ast.Class, gen: boolean): Promise<string | undefined> {
        const base = this.fqn(type.base?.ref, ast.isException(type) ? '::Smp::Exception' : undefined);
        return s`
        ${gen ? `class ${type.name};` : ''}
        ${this.comment(type)}class ${this.name(type, gen)}${base ? `: public ${base}` : ''}
        {
            ${gen ? `friend class ${this.fqn(type)};` : ''}
        public:
            static void _Register(::Smp::Publication::ITypeRegistry* registry);
            
            //«IF constructor»${this.name(type, gen)} () = default;«ENDIF»
            //«IF destructor»~${this.name(type, gen)} () noexcept = default;«ENDIF»
            //${this.name(type, gen)} (const ${this.name(type, gen)} &) = default;
            
           ${this.declareMembersGen(type, VisibilityKind.public, gen)}
        };
        
        ${this.uuidDeclaration(type)}
        `;
    }

    async generateClassSourceGen(type: ast.Class, gen: boolean): Promise<string | undefined> {
        const fields = type.elements.filter(ast.isField).filter(field => !this.attrHelper.isStatic(field) && !isString8(field.type.ref));
        return s`
        ${this.defineMembersGen(type, gen)}
        void ${this.name(type, gen)}::_Register(::Smp::Publication::ITypeRegistry* registry) 
        {
            ${fields.length > 0 ? 'auto *type = ' : ''}registry->AddClassType(
                "${type.name}", // Name
                ${this.description(type)}, // Description
                ${this.uuid(type)}, // UUID
                ${this.uuid(type.base?.ref)} // Base Class UUID
                ); 
            
            ${fields.length > 0 ? '// Register the Fields of the Class' : ''}
            ${fields.map(f => `
                  type->AddField(
                    "${f.name}", // Name
                    ${this.description(f)}, // Description
                    ${this.uuid(f.type.ref)}, // Type UUID
                    offsetof(${type.name}, ${f.name}), // Field offset
                    ${this.viewKind(f)}, // View Kind
                    ${isState(f)}, // State
                    ${isInput(f)}, // Input
                    ${isOutput(f)} // Output
                    );  
                `).join('\n')}
        }
        
        ${this.uuidDefinition(type)}
        `;
    }
    async generateExceptionHeader(type: ast.Exception): Promise<string | undefined> {
        return this.generateClassHeader(type);
    }

    async generateExceptionSource(type: ast.Exception): Promise<string | undefined> {
        return this.generateClassSource(type);
    }

    async generateExceptionHeaderGen(type: ast.Exception, gen: boolean): Promise<string | undefined> {
        return this.generateClassHeaderGen(type, gen);
    }

    async generateExceptionSourceGen(type: ast.Exception, gen: boolean): Promise<string | undefined> {
        return this.generateClassSourceGen(type, gen);
    }
    async generateStructureHeader(type: ast.Structure): Promise<string | undefined> {
        return s`
        ${this.comment(type)}struct ${type.name} : public ${type.name}Gen 
        {
            ${this.declareMembers(type, VisibilityKind.public)}
        };
        `;
    }

    async generateStructureSource(_type: ast.Structure): Promise<string | undefined> {
        return undefined;
    }

    async generateStructureHeaderGen(type: ast.Structure, gen: boolean): Promise<string | undefined> {
        return s`
        ${this.comment(type)}struct ${this.name(type, gen)}  
        {
           ${this.declareMembersGen(type, VisibilityKind.public, gen)}

            static void _Register(::Smp::Publication::ITypeRegistry* registry);
        };
        
        ${this.uuidDeclaration(type)}
        `;
    }

    async generateStructureSourceGen(type: ast.Structure, gen: boolean): Promise<string | undefined> {
        const fields = type.elements.filter(ast.isField).filter(field => !this.attrHelper.isStatic(field) && !isString8(field.type.ref));
        return s`
        ${this.defineMembersGen(type, gen)}
        void ${this.name(type, gen)}::_Register(::Smp::Publication::ITypeRegistry* registry) 
        {
                ${fields.length > 0 ? 'auto *type = ' : ''}registry->AddStructureType(
                "${type.name}", // Name
                ${this.description(type)}, // Description
                ${this.uuid(type)} // UUID
                ); 
                
            ${fields.length > 0 ? '// Register the Fields of the Class' : ''}
            ${fields.map(f => `type->AddField(
                    "${f.name}", // Name
                    ${this.description(f)}, // Description
                    ${this.uuid(f.type.ref)}, // Type UUID
                    offsetof(${type.name}, ${f.name}), // Field offset
                    ${this.viewKind(f)}, // View Kind
                    ${isState(f)}, // State
                    ${isInput(f)}, // Input
                    ${isOutput(f)} // Output
                    );  
                `).join('')}
        }

        ${this.uuidDefinition(type)}
        `;
    }

    async generateIntegerHeader(type: ast.Integer): Promise<string | undefined> {
        return this.generateTypeHeader(type);
    }
    async generateIntegerSource(_type: ast.Integer): Promise<string | undefined> {
        return undefined;
    }

    async generateIntegerHeaderGen(type: ast.Integer, gen: boolean): Promise<string | undefined> {
        return s`
        ${this.uuidDeclaration(type)}
        ${this.comment(type)}using ${this.name(type, gen)}  = ${this.fqn(type.primitiveType?.ref, '::Smp::Int32')};
        void _Register_${type.name}(::Smp::Publication::ITypeRegistry* registry);
        `;
    }

    async generateIntegerSourceGen(type: ast.Integer, _gen: boolean): Promise<string | undefined> {
        return s`
        void _Register_${type.name}(::Smp::Publication::ITypeRegistry* registry) {
            registry->AddIntegerType(
                "${type.name}", // Name
                ${this.description(type)}, // Description
                ${this.uuid(type)}, // UUID
                ${type.minimum ? this.expression(type.minimum) : `std::numeric_limits<${this.fqn(type.primitiveType?.ref, '::Smp::Int32')}>::min()`}, // Minimum
                ${type.maximum ? this.expression(type.maximum) : `std::numeric_limits<${this.fqn(type.primitiveType?.ref, '::Smp::Int32')}>::max()`}, // Maximum
                "${this.docHelper.getUnit(type)}", // Unit
                ${this.primitiveTypeKind(type)} // Primitive Type Kind
            );
        }
        ${this.uuidDefinition(type)}
        `;
    }
    async generateFloatHeader(type: ast.Float): Promise<string | undefined> {
        return this.generateTypeHeader(type);
    }

    async generateFloatSource(_type: ast.Float): Promise<string | undefined> {
        return undefined;
    }
    async generateFloatHeaderGen(type: ast.Float, gen: boolean): Promise<string | undefined> {
        return s`
        ${this.uuidDeclaration(type)}
        ${this.comment(type)}using ${this.name(type, gen)}  = ${this.fqn(type.primitiveType?.ref, '::Smp::Float64')};
        void _Register_${type.name}(::Smp::Publication::ITypeRegistry* registry);
        `;
    }

    async generateFloatSourceGen(type: ast.Float, _gen: boolean): Promise<string | undefined> {
        const minInclusive = type.range !== '<..' && type.range !== '<.<';
        const maxInclusive = type.range !== '..<' && type.range !== '<.<';
        return s`
        void _Register_${type.name}(::Smp::Publication::ITypeRegistry* registry) {
        registry->AddFloatType(
            "${type.name}", // Name
            ${this.description(type)}, // Description
            ${this.uuid(type)}, // UUID
            ${type.minimum ? this.expression(type.minimum) : `std::numeric_limits<${this.fqn(type.primitiveType?.ref, '::Smp::Float64')}>::lowest()`}, // Minimum
            ${type.maximum ? this.expression(type.maximum) : `std::numeric_limits<${this.fqn(type.primitiveType?.ref, '::Smp::Float64')}>::max()`}, // Maximum
            ${minInclusive}, // Minimum ${minInclusive ? 'inclusive' : 'exclusive'}
            ${maxInclusive}, // Maximum ${maxInclusive ? 'inclusive' : 'exclusive'}
            "${this.docHelper.getUnit(type)}", // Unit
            ${this.primitiveTypeKind(type)} // Primitive Type Kind
        );  
    }
    ${this.uuidDefinition(type)}
    `;
    }
    async generateComponentHeader(type: ast.Component): Promise<string | undefined> {
        return s`
        ${this.comment(type)}class ${type.name}: public ${type.name}Gen {
        public:
            /// Re-use parent constructors
            using ${type.name}Gen::${type.name}Gen;
            
            /// Virtual destructor to release memory.
            ~${type.name}() noexcept override = default;
            
        private:
            // ${type.name}Gen call DoPublish/DoConfigure/DoConnect/DoDisconnect
            friend class ::${fqn(type, '::')}Gen;
            
            /// Publish fields, operations and properties of the model.
            /// @param receiver Publication receiver.
            void DoPublish(::Smp::IPublication* receiver);
            
            /// Request for configuration.
            /// @param logger Logger to use for log messages during Configure().
            /// @param linkRegistry Link Registry to use for registration of
            ///         links created during Configure() or later.
            void DoConfigure( ::Smp::Services::ILogger* logger, ::Smp::Services::ILinkRegistry* linkRegistry);
            
            /// Connect model to simulator.
            /// @param simulator Simulation Environment that hosts the model.
            void DoConnect( ::Smp::ISimulator* simulator);
            
            /// Disconnect model to simulator.
            void DoDisconnect();
        
            ${this.declareMembers(type, VisibilityKind.private)}
        };
        `;
    }
    async generateInterfaceHeader(type: ast.Interface): Promise<string | undefined> {
        return s`
        ${this.comment(type)}class ${type.name}: public ${type.name}Gen {
        public:
            ~${type.name}() override = default;
        };
        `;
    }

    async generateInterfaceSource(_type: ast.Interface): Promise<string | undefined> {
        return undefined;
    }
    async generateInterfaceHeaderGen(type: ast.Interface, gen: boolean): Promise<string | undefined> {
        return s`
        ${this.comment(type)}class ${this.name(type, gen)}${type.base.length > 0 ? ': ' : ''}${type.base.map(b => `public virtual ${this.fqn(b.ref)}`).join(', ')} {
            public:
            virtual ~${this.name(type, gen)} () = default;
            ${this.declareMembersGen(type, VisibilityKind.public, gen)}
        };
        
        ${this.uuidDeclaration(type)}
        `;
    }
    async generateInterfaceSourceGen(_type: ast.Interface, _gen: boolean): Promise<string | undefined> {
        return undefined;
    }

    async generateArrayHeader(type: ast.ArrayType): Promise<string | undefined> {
        return s`
        ${this.comment(type)}using ${type.name} = ::${type.name}Gen;
        `;
    }
    async generateArrayHeaderGen(type: ast.ArrayType, gen: boolean): Promise<string | undefined> {
        return s`
        ${this.comment(type)}struct ${this.name(type, gen)} 
        { 
            ${this.fqn(type.itemType.ref)} internalArray[${this.expression(type.size)}];
        };
        
        ${this.uuidDeclaration(type)}
        
        void _Register_${type.name}(::Smp::Publication::ITypeRegistry* registry);
        `;
    }
    async generateArraySource(_type: ast.ArrayType): Promise<string | undefined> {
        return undefined;
    }
    async generateArraySourceGen(type: ast.ArrayType, _gen: boolean): Promise<string | undefined> {
        return s`
        void _Register_${type.name}(::Smp::Publication::ITypeRegistry* registry) {
            registry->AddArrayType(
                "${type.name}", // Name
                ${this.description(type)}, // Description
                ${this.uuid(type)}, // UUID
                ${this.uuid(type.itemType.ref)}, // Item Type UUID
                sizeof(${this.fqn(type.itemType.ref)}), // Item Type size
                ${this.expression(type.size)}, // Number of elements
                ${this.attrHelper.isSimpleArray(type)} // Simple array
            );
        }
        ${this.uuidDefinition(type)}
        `;
    }
    async generateEnumerationHeader(type: ast.Enumeration): Promise<string | undefined> {
        return this.generateTypeHeader(type);
    }
    async generateEnumerationSource(_type: ast.Enumeration): Promise<string | undefined> {
        return undefined;
    }
    async generateEnumerationHeaderGen(type: ast.Enumeration, gen: boolean): Promise<string | undefined> {
        return s`
        ${this.comment(type)}enum class ${this.name(type, gen)}: ::Smp::Int32 {
            ${type.literal.map(literal => `${this.comment(literal)}${literal.name} = ${this.expression(literal.value)}`).join(',\n')}
        };
        
        ${this.uuidDeclaration(type)}
        
        void _Register_${type.name}(::Smp::Publication::ITypeRegistry* registry);
        
        const std::map<${this.name(type, gen)}, std::string> ${type.name}_name_map = {
            ${type.literal.map(literal => `{ ${this.name(type, gen)}::${literal.name}, "${literal.name}" }`).join(', ')}
        };
        
        const std::map<${this.name(type, gen)}, std::string> ${type.name}_descr_map = {
            ${type.literal.map(literal => `{ ${this.name(type, gen)}::${literal.name}, ${this.description(literal)} }`).join(', ')}
        };
        `;
    }
    async generateEnumerationSourceGen(type: ast.Enumeration, _gen: boolean): Promise<string | undefined> {
        return s`
        void _Register_${type.name}(::Smp::Publication::ITypeRegistry* registry) {
        auto *type = registry->AddEnumerationType(
            "${type.name}", // Name
            ${this.description(type)}, // Description
            ${this.uuid(type)}, // UUID
            sizeof(${this.fqn(type)}) // Size
            );
    
        // Register the Literals of the Enumeration
        ${type.literal.map(literal => `type->AddLiteral("${literal.name}", ${this.description(literal)}, static_cast<::Smp::Int32>(${this.fqn(literal)}));`).join('\n')}
        }
        ${this.uuidDefinition(type)}
        `;
    }
    async generateStringHeader(type: ast.StringType): Promise<string | undefined> {
        return this.generateTypeHeader(type);
    }
    async generateStringSource(_type: ast.StringType): Promise<string | undefined> {
        return undefined;
    }
    async generateStringHeaderGen(type: ast.StringType, gen: boolean): Promise<string | undefined> {
        return s`
        ${this.comment(type)}struct ${this.name(type, gen)}  
        { 
            ::Smp::Char8 internalString[(${this.expression(type.length)}) + 1];
        };
        
        ${this.uuidDeclaration(type)}
        
        void _Register_${type.name}(::Smp::Publication::ITypeRegistry* registry);
        `;
    }

    async generateStringSourceGen(type: ast.StringType, _gen: boolean): Promise<string | undefined> {
        return s`
        void _Register_${type.name}(::Smp::Publication::ITypeRegistry* registry) {
            registry->AddStringType(
                "${type.name}", // Name
                ${this.description(type)}, // Description
                ${this.uuid(type)}, // UUID
                ${this.expression(type.length)} // Length
                );
        }
        ${this.uuidDefinition(type)}
        `;
    }

    async generateComponentSource(type: ast.Component): Promise<string | undefined> {
        return s`
        void ${type.name}::DoPublish( ::Smp::IPublication* receiver) {
        }
        
        void ${type.name}::DoConfigure(::Smp::Services::ILogger* logger, ::Smp::Services::ILinkRegistry* linkRegistry) {
        }
        
        void ${type.name}::DoConnect(::Smp::ISimulator* simulator) {
        }
        
        void ${type.name}::DoDisconnect() {
        }
        ${this.defineMembers(type, false)}
        `;
    }

    async generateComponentHeaderGen(_type: ast.Component, _gen: boolean): Promise<string | undefined> {
        return undefined;
    }

    async generateComponentSourceGen(_type: ast.Component, _gen: boolean): Promise<string | undefined> {
        return undefined;
    }
    /*
        protected override initialize(element: ast.NamedElement, gen: boolean = false): string | undefined {
            switch (element.$type) {
                case ast.Association: return this.initializeAssociation(element as ast.Association, gen);
                case ast.Constant: return this.initializeConstant(element as ast.Constant, gen);
                case ast.Container: return this.initializeContainer(element as ast.Container, gen);
                case ast.EntryPoint: return this.initializeEntryPoint(element as ast.EntryPoint, gen);
                case ast.EventSink: return this.initializeEventSink(element as ast.EventSink);
                case ast.EventSource: return this.initializeEventSource(element as ast.EventSource, gen);
                case ast.Field: return this.initializeField(element as ast.Field, gen);
                case ast.Operation: return this.initializeOperation(element as ast.Operation, gen);
                case ast.Property: return this.initializeProperty(element as ast.Property, gen);
                case ast.Reference_: return this.initializeReference(element as ast.Reference_, gen);
                default: return undefined;
            }
        }*/
    protected override initializeAssociation(element: ast.Association, _gen: boolean = false): string | undefined {
        if (!this.attrHelper.isStatic(element))
            return s`
                // Association ${element.name}
                ${element.name}{ }
            `;
        return undefined;
    }
    protected override initializeConstant(element: ast.Constant, _gen: boolean = false): string | undefined {
        return undefined;
    }
    protected override initializeContainer(element: ast.Container, _gen: boolean = false): string | undefined {
        return undefined;
    }
    protected override initializeEntryPoint(element: ast.EntryPoint, _gen: boolean = false): string | undefined {
        return undefined;
    }
    protected override initializeEventSink(element: ast.EventSink, _gen: boolean = false): string | undefined {
        return undefined;
    }
    protected override initializeEventSource(element: ast.EventSource, _gen: boolean = false): string | undefined {
        return undefined;
    }

    protected override initializeOperation(element: ast.Operation, _gen: boolean = false): string | undefined {
        return undefined;
    }
    protected override initializeProperty(element: ast.Property, _gen: boolean = false): string | undefined {
        return undefined;
    }
    protected override initializeReference(element: ast.Reference, _gen: boolean = false): string | undefined {
        return undefined;
    }

    protected declareGen(element: ast.NamedElement, gen: boolean): string | undefined {
        switch (element.$type) {
            case ast.Association: return this.declareAssociationGen(element as ast.Association, gen);
            case ast.Constant: return this.declareConstantGen(element as ast.Constant, gen);
            case ast.Container: return this.declareContainerGen(element as ast.Container, gen);
            case ast.EntryPoint: return this.declareEntryPointGen(element as ast.EntryPoint, gen);
            case ast.EventSink: return this.declareEventSinkGen(element as ast.EventSink, gen);
            case ast.EventSource: return this.declareEventSourceGen(element as ast.EventSource, gen);
            case ast.Field: return this.declareFieldGen(element as ast.Field, gen);
            case ast.Operation: return this.declareOperationGen(element as ast.Operation, gen);
            case ast.Property: return this.declarePropertyGen(element as ast.Property, gen);
            case ast.Reference: return this.declareReferenceGen(element as ast.Reference, gen);
            default: return undefined;
        }
    }
    protected defineGen(element: ast.NamedElement, gen: boolean): string | undefined {
        switch (element.$type) {
            case ast.Association: return this.defineAssociationGen(element as ast.Association, gen);
            case ast.Constant: return this.defineConstantGen(element as ast.Constant, gen);
            case ast.Container: return this.defineContainerGen(element as ast.Container, gen);
            case ast.EntryPoint: return this.defineEntryPointGen(element as ast.EntryPoint, gen);
            case ast.EventSink: return this.defineEventSinkGen(element as ast.EventSink, gen);
            case ast.EventSource: return this.defineEventSourceGen(element as ast.EventSource, gen);
            case ast.Field: return this.defineFieldGen(element as ast.Field, gen);
            case ast.Operation: return this.defineOperationGen(element as ast.Operation, gen);
            case ast.Property: return this.definePropertyGen(element as ast.Property, gen);
            case ast.Reference: return this.defineReferenceGen(element as ast.Reference, gen);
            default: return undefined;
        }
    }

    protected declareAssociationGen(element: ast.Association, _gen: boolean): string | undefined {
        return s`
            ${this.comment(element)}${this.attrHelper.isStatic(element) ? 'static ' : ''}${this.attrHelper.isMutable(element) ? 'mutable ' : ''}${this.type(element)} ${element.name};
            `;
    }
    protected defineAssociationGen(_element: ast.Association, _gen: boolean): string | undefined {
        return undefined;
    }

    protected declareConstantGen(element: ast.Constant, _gen: boolean): string | undefined {
        if (!this.stringTypeIsConstexpr() && ast.isStringType(element.type.ref)) {
            return s`
                ${this.comment(element)}static const ${this.fqn(element.type.ref)} ${element.name};
                `;
        }

        return s`
            ${this.comment(element)}static constexpr ${this.fqn(element.type.ref)} ${element.name}${this.directListInitializer(element.value)};
            `;
    }
    protected defineConstantGen(element: ast.Constant, gen: boolean): string | undefined {
        if (!this.stringTypeIsConstexpr() && ast.isStringType(element.type.ref)) {
            return s`
                ${this.comment(element)}const ${this.fqn(element.type.ref)} ${this.name(element.$container, gen)}::${element.name}${this.directListInitializer(element.value)};
                `;
        }

        if (this.cxxStandard < CxxStandard.CXX_STD_17) {
            return s`
                ${this.comment(element)}constexpr ${this.fqn(element.type.ref)} ${this.name(element.$container, gen)}::${element.name};
                `;
        }
        return undefined;
    }

    protected declareContainerGen(element: ast.Container, _gen: boolean): string | undefined {
        return s`
        ${this.comment(element)}::Smp::IContainer* ${element.name};
        `;
    }

    protected defineContainerGen(_element: ast.Container, _gen: boolean): string | undefined {
        return undefined;
    }

    protected override declareEntryPoint(element: ast.EntryPoint): string | undefined {
        return `void _${element.name}() override;`;
    }
    protected override defineEntryPoint(element: ast.EntryPoint): string | undefined {
        return s`
            void ${element.$container.name}::_${element.name}() {
                // TODO implement EntryPoint ${element.name}
                ${this.comment(element)}
            }`;
    }

    protected declareEntryPointGen(element: ast.EntryPoint, gen: boolean): string | undefined {
        return s`
            ${this.comment(element)}::Smp::IEntryPoint* ${element.name}; 
            virtual void _${element.name}()${gen ? ' = 0' : ''};
            `;
    }
    protected defineEntryPointGen(_element: ast.EntryPoint, _gen: boolean): string | undefined {
        return undefined;
    }

    protected override declareEventSink(element: ast.EventSink): string | undefined {
        const eventType = this.eventType(element);
        return s`
            void _${element.name}(::Smp::IObject* sender${eventType ? `, ${this.fqn(eventType)}` : ''}) override;
            `;
    }
    protected override defineEventSink(element: ast.EventSink): string | undefined {
        const eventType = this.eventType(element);
        return s`
            void ${element.$container.name}::_${element.name}(::Smp::IObject* sender${eventType ? `, ${this.fqn(eventType)}` : ''}) {
                // TODO implement EventSink ${element.name}
                ${this.comment(element)}
            }`;
    }
    protected declareEventSinkGen(element: ast.EventSink, gen: boolean): string | undefined {
        const eventType = this.eventType(element);
        return s`
            ${this.comment(element)}::Smp::IEventSink* ${element.name};
            virtual void _${element.name}(::Smp::IObject* sender${eventType ? `, ${this.fqn(eventType)}` : ''})${gen ? ' = 0' : ''};
            `;
    }
    protected defineEventSinkGen(_element: ast.EventSink, _gen: boolean): string | undefined {
        return undefined;
    }

    protected declareEventSourceGen(element: ast.EventSource, _gen: boolean): string | undefined {
        return s`
            ${this.comment(element)}::Smp::IEventSource* ${element.name};
            `;
    }
    protected defineEventSourceGen(_element: ast.EventSource, _gen: boolean): string | undefined {
        return undefined;
    }

    protected declareFieldGen(element: ast.Field, _gen: boolean): string | undefined {
        return s`
            ${this.comment(element)}${this.attrHelper.isStatic(element) ? 'static ' : ''}${this.attrHelper.isMutable(element) ? 'mutable ' : ''}${this.fqn(element.type.ref)} ${element.name}${element.default && !ast.isComponent(element.$container) && !this.attrHelper.isStatic(element) ? this.directListInitializer(element.default) : ''};
            `;
    }
    protected defineFieldGen(element: ast.Field, gen: boolean): string | undefined {
        if (this.attrHelper.isStatic(element))
            return `
                // Field ${element.name}
                ${this.fqn(element.type.ref)} ${this.name(element.$container, gen)}::${element.name}${this.directListInitializer(element.default)};
                `;
        return undefined;
    }
    protected override initializeField(element: ast.Field, _gen: boolean = false): string | undefined {
        if (!this.attrHelper.isStatic(element)) {
            return s`
                // Field ${element.name}
                ${element.name} ${this.directListInitializer(element.default)}
                `;
        }
        return undefined;
    }

    protected declareOperationGen(op: ast.Operation, gen: boolean): string | undefined {
        if (this.attrHelper.isConstructor(op)) // a constructor
            return `${this.comment(op)}${this.name(op.$container, gen)}(${op.parameter.map(param => this.declareParameter(param)).join(', ')});`;
        else if (this.attrHelper.isStatic(op)) // a static method
            return `${this.comment(op)}static ${this.type(op.returnParameter)} ${this.operationName(op)}(${op.parameter.map(param => this.declareParameter(param)).join(', ')});`;
        else if (this.attrHelper.isVirtual(op)) // a virtual method
            return `${this.comment(op)}virtual ${this.type(op.returnParameter)} ${this.operationName(op)}(${op.parameter.map(param => this.declareParameter(param)).join(', ')})${this.attrHelper.isConst(op) ? ' const' : ''}${this.attrHelper.isAbstract(op) || gen ? '=0' : ''};`;

        return `${this.comment(op)}${this.type(op.returnParameter)} ${this.operationName(op)}(${op.parameter.map(param => this.declareParameter(param)).join(', ')})${this.attrHelper.isConst(op) ? ' const' : ''};`;

    }
    protected defineOperationGen(_element: ast.Operation, _gen: boolean): string | undefined {
        return undefined;
    }
    protected override declareOperation(op: ast.Operation): string | undefined {
        if (this.attrHelper.isConstructor(op)) // constructor declared in gen folder
            return `using ${op.$container.name}::${op.$container.name};`;
        if (this.attrHelper.isVirtual(op) && !this.attrHelper.isAbstract(op)) // override virtual methods
            return `${this.comment(op)}${this.type(op.returnParameter)} ${this.operationName(op)}(${op.parameter.map(param => this.declareParameter(param)).join(', ')})${this.attrHelper.isConst(op) ? ' const' : ''} override;`;
        return undefined;
    }
    defaultReturn(param: ast.ReturnParameter): string {
        if (this.attrHelper.isByPointer(param)) {
            if (param.type.ref === param.$container.$container)
                return 'this';
            return 'nullptr';
        }
        if (param.type.ref === param.$container.$container)
            return '*this';
        return this.getDefaultValueForType(param.type.ref);
    }
    protected override defineOperation(op: ast.Operation): string | undefined {
        if (this.attrHelper.isConstructor(op)) // constructor declared in gen folder
            return undefined;
        else if (this.attrHelper.isStatic(op) || !this.attrHelper.isVirtual(op)) // static or not virtual method declared in gen folder
            return `${this.type(op.returnParameter)} ${op.$container.name}::${this.operationName(op)}(${op.parameter.map(param => this.defineParameter(param)).join(', ')})${this.attrHelper.isConst(op) ? ' const' : ''} {
                    // TODO
                    ${op.returnParameter ? `return ${this.defaultReturn(op.returnParameter)};` : ''}
                }
                `;
        else if (!this.attrHelper.isAbstract(op)) // override virtual method
            return `${this.type(op.returnParameter)} ${op.$container.name}::${this.operationName(op)}(${op.parameter.map(param => this.defineParameter(param)).join(', ')})${this.attrHelper.isConst(op) ? ' const' : ''} {
                    // TODO
                    ${op.returnParameter ? `return ${this.defaultReturn(op.returnParameter)};` : ''}
                }
                `;
        return undefined;
    }
    protected declarePropertyGen(element: ast.Property, gen: boolean): string | undefined {
        switch (getAccessKind(element)) {
            case 'readOnly':
                return this.declarePropertyGetterGen(element, gen);
            case 'writeOnly': {
                return this.declarePropertySetterGen(element, gen);
            }
            case 'readWrite':
            default:
                return s`
                    ${this.declarePropertyGetterGen(element, gen)}
                    ${this.declarePropertySetterGen(element, gen)}
                    `;
        }
    }
    protected declarePropertySetterGen(element: ast.Property, gen: boolean): string | undefined {
        const abstract = this.attrHelper.isAbstract(element) || (this.attrHelper.isVirtual(element) && gen && !element.attachedField);
        return s`
            /// Set ${element.name}.
            ${this.comment(element)}/// @param value New value of property ${element.name} to set.
            ${this.attrHelper.isVirtual(element) ? 'virtual ' : ''}${this.attrHelper.isStatic(element) ? 'static ' : ''}void set_${element.name}(${this.type(element)} value)${abstract ? '=0' : ''};
            `;
    }
    protected declarePropertyGetterGen(element: ast.Property, gen: boolean): string | undefined {
        const abstract = this.attrHelper.isAbstract(element) || (this.attrHelper.isVirtual(element) && gen && !element.attachedField);
        return s`
            /// Get ${element.name}.
            ${this.comment(element)}/// @return Current value of property ${element.name}.
            ${this.attrHelper.isVirtual(element) ? 'virtual ' : ''}${this.attrHelper.isStatic(element) ? 'static ' : ''}${this.type(element)} get_${element.name}()${this.attrHelper.isConstGetter(element) ? ' const' : ''}${abstract ? '=0' : ''};
            `;
    }
    protected definePropertyGen(element: ast.Property, gen: boolean): string | undefined {
        if (!element.attachedField) {
            return undefined;
        }
        switch (getAccessKind(element)) {
            case 'readOnly':
                return this.definePropertyGetterGen(element, gen);
            case 'writeOnly': {
                return this.definePropertySetterGen(element, gen);
            }
            case 'readWrite':
            default:
                return s`
                    ${this.definePropertyGetterGen(element, gen)}
                    ${this.definePropertySetterGen(element, gen)}
                    `;
        }
    }
    protected definePropertySetterGen(element: ast.Property, gen: boolean): string | undefined {
        return s`
        void ${this.name(element.$container, gen)}::set_${element.name}(${this.type(element)} value) {
            ${this.attrHelper.isStatic(element) ? `${this.name(element.$container, gen)}::` : 'this->'}${element.attachedField?.ref?.name} = value;
        }
        `;
    }
    protected definePropertyGetterGen(element: ast.Property, gen: boolean): string | undefined {
        return s`
            ${this.type(element)} ${this.name(element.$container, gen)}::get_${element.name}()${this.attrHelper.isConstGetter(element) ? ' const' : ''}{
                return ${this.attrHelper.isStatic(element) ? `${this.name(element.$container, gen)}::` : 'this->'}${element.attachedField?.ref?.name};
            }
            `;
    }

    protected declareReferenceGen(element: ast.Reference, _gen: boolean): string | undefined {
        return s`
        ${this.comment(element)}::Smp::IReference* ${element.name};
        `;
    }
    protected defineReferenceGen(_element: ast.Reference, _gen: boolean): string | undefined {
        return undefined;
    }

    protected initializeMembers(container: ast.WithBody, gen: boolean): string[] {
        const buffer: Array<string | undefined> = [];
        for (const c of this.constants(container))
            buffer.push(this.initializeConstant(c, gen));
        for (const c of container.elements.filter(ast.isProperty))
            buffer.push(this.initializeProperty(c, gen));
        for (const c of container.elements.filter(ast.isOperation))
            buffer.push(this.initializeOperation(c, gen));
        for (const c of container.elements.filter(ast.isEntryPoint))
            buffer.push(this.initializeEntryPoint(c, gen));
        for (const c of container.elements.filter(ast.isEventSink))
            buffer.push(this.initializeEventSink(c, gen));
        for (const c of container.elements.filter(ast.isEventSource))
            buffer.push(this.initializeEventSource(c, gen));
        for (const c of container.elements.filter(ast.isField))
            buffer.push(this.initializeField(c, gen));
        for (const c of container.elements.filter(ast.isAssociation))
            buffer.push(this.initializeAssociation(c, gen));
        for (const c of container.elements.filter(ast.isContainer))
            buffer.push(this.initializeContainer(c, gen));
        for (const c of container.elements.filter(ast.isReference))
            buffer.push(this.initializeReference(c, gen));
        return buffer.filter(v => v !== undefined);
    }

    protected declareMember(element: ast.NamedElement, initialVisibility: VisibilityKind, declaration: string | undefined, buffer: string[]): VisibilityKind {
        let visibility = initialVisibility;
        if (declaration !== undefined) {
            visibility = getRealVisibility(element);
            buffer.push(`${visibility !== initialVisibility ? VisibilityKind[visibility] + ':\n' : ''}${declaration}`);
        }
        return visibility;
    }

    protected declareMembers(container: ast.WithBody, initialVisibility: VisibilityKind): string {
        const buffer: string[] = [];
        let current = initialVisibility;
        for (const c of this.constants(container))
            current = this.declareMember(c, current, this.declareConstant(c), buffer);
        for (const c of container.elements.filter(ast.isProperty))
            current = this.declareMember(c, current, this.declareProperty(c), buffer);
        for (const c of container.elements.filter(ast.isOperation))
            current = this.declareMember(c, current, this.declareOperation(c), buffer);
        for (const c of container.elements.filter(ast.isEntryPoint))
            current = this.declareMember(c, current, this.declareEntryPoint(c), buffer);
        for (const c of container.elements.filter(ast.isEventSink))
            current = this.declareMember(c, current, this.declareEventSink(c), buffer);
        for (const c of container.elements.filter(ast.isEventSource))
            current = this.declareMember(c, current, this.declareEventSource(c), buffer);
        for (const c of container.elements.filter(ast.isField))
            current = this.declareMember(c, current, this.declareField(c), buffer);
        for (const c of container.elements.filter(ast.isAssociation))
            current = this.declareMember(c, current, this.declareAssociation(c), buffer);
        for (const c of container.elements.filter(ast.isContainer))
            current = this.declareMember(c, current, this.declareContainer(c), buffer);
        for (const c of container.elements.filter(ast.isReference))
            current = this.declareMember(c, current, this.declareReference(c), buffer);
        return buffer.join('\n');
    }

    protected declareMembersGen(container: ast.WithBody, initialVisibility: VisibilityKind, gen: boolean): string {
        const buffer: string[] = [];
        let current = initialVisibility;
        for (const c of this.constants(container))
            current = this.declareMember(c, current, this.declareConstantGen(c, gen), buffer);
        for (const c of container.elements.filter(ast.isProperty))
            current = this.declareMember(c, current, this.declarePropertyGen(c, gen), buffer);
        for (const c of container.elements.filter(ast.isOperation))
            current = this.declareMember(c, current, this.declareOperationGen(c, gen), buffer);
        for (const c of container.elements.filter(ast.isEntryPoint))
            current = this.declareMember(c, current, this.declareEntryPointGen(c, gen), buffer);
        for (const c of container.elements.filter(ast.isEventSink))
            current = this.declareMember(c, current, this.declareEventSinkGen(c, gen), buffer);
        for (const c of container.elements.filter(ast.isEventSource))
            current = this.declareMember(c, current, this.declareEventSourceGen(c, gen), buffer);
        for (const c of container.elements.filter(ast.isField))
            current = this.declareMember(c, current, this.declareFieldGen(c, gen), buffer);
        for (const c of container.elements.filter(ast.isAssociation))
            current = this.declareMember(c, current, this.declareAssociationGen(c, gen), buffer);
        for (const c of container.elements.filter(ast.isContainer))
            current = this.declareMember(c, current, this.declareContainerGen(c, gen), buffer);
        for (const c of container.elements.filter(ast.isReference))
            current = this.declareMember(c, current, this.declareReferenceGen(c, gen), buffer);
        return buffer.join('\n');
    }

    protected defineMembers(container: ast.WithBody, _useGenPattern: boolean): string {
        return container.elements.map(this.define, this).filter(v => v !== undefined).join('\n');
    }
    protected defineMembersGen(container: ast.WithBody, useGenPattern: boolean): string {
        return container.elements.map(element => this.defineGen(element, useGenPattern), this).filter(v => v !== undefined).join('\n');
    }

    protected override declareProperty(element: ast.Property): string | undefined {
        if (!element.attachedField && this.attrHelper.isVirtual(element) && !this.attrHelper.isAbstract(element)) {
            switch (getAccessKind(element)) {
                case 'readOnly':
                    return this.declarePropertyGetter(element);
                case 'writeOnly':
                    return this.declarePropertySetter(element);
                case 'readWrite':
                default:
                    return s`
                        ${this.declarePropertyGetter(element)}
                        ${this.declarePropertySetter(element)}
                        `;
            }
        }
        return undefined;
    }

    protected declarePropertySetter(element: ast.Property): string | undefined {
        return `void set_${element.name}(${this.type(element)} value)${this.attrHelper.isConst(element) ? ' const' : ''} override;`;
    }

    protected declarePropertyGetter(element: ast.Property): string | undefined {
        return `${this.type(element)} get_${element.name}()${this.attrHelper.isConstGetter(element) ? ' const' : ''} override;`;
    }

    protected override defineProperty(element: ast.Property): string | undefined {
        if (!element.attachedField && this.attrHelper.isVirtual(element) && !this.attrHelper.isAbstract(element)) {
            switch (getAccessKind(element)) {
                case 'readOnly':
                    return this.definePropertyGetter(element);
                case 'writeOnly':
                    return this.definePropertySetter(element);
                case 'readWrite':
                default:
                    return s`
                        ${this.definePropertyGetter(element)}
                        ${this.definePropertySetter(element)}
                        `;
            }
        }
        return undefined;
    }

    protected definePropertySetter(element: ast.Property): string | undefined {
        return s`
            void ${element.$container.name}::set_${element.name}(${this.type(element)} value)${this.attrHelper.isConst(element) ? ' const' : ''}{
                // TODO
            }
            `;
    }

    protected definePropertyGetter(element: ast.Property): string | undefined {
        return s`
            ${this.type(element)} ${element.$container.name}::get_${element.name}()${this.attrHelper.isConstGetter(element) ? ' const' : ''}{
                ${this.type(element)} ret {};
                return ret;
            }
            `;
    }
}