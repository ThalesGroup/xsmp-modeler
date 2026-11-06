import * as ast from '../../generated/ast.js';
import * as fs from 'node:fs';
import { expandToString as s } from 'langium/generate';
import { fqn, getAccessKind, getRealVisibility, isInput, isOutput, isState, isString8 } from '../../utils/xsmp-utils.js';
import { CppGenerator, CxxStandard } from './generator.js';
import { isClangFormatEnabled, type GenerationContext, type GenerationPreparationContext } from '../generator.js';
import { ClangFormatter } from './clang-format.js';
import type { GeneratedFiles } from '../generated-files.js';
import type { XsmpSharedServices } from '../../xsmp-module.js';
import * as Path from 'node:path';
import { VisibilityKind } from '../../utils/visibility-kind.js';

export abstract class GapPatternCppGenerator extends CppGenerator {

    protected static readonly defaultIncludeGenFolder = 'src-gen';
    protected static readonly defaultSourceGenFolder = 'src-gen';
    protected includeGenFolder = GapPatternCppGenerator.defaultIncludeGenFolder;
    protected sourceGenFolder = GapPatternCppGenerator.defaultSourceGenFolder;
    constructor(services: XsmpSharedServices, cxxStandard: CxxStandard) {
        super(services, cxxStandard);
    }

    override prepare(context: GenerationPreparationContext): GeneratedFiles {
        const formatter = isClangFormatEnabled() ? new ClangFormatter() : undefined;
        return context.createFiles({
            generatedInclude: { directory: this.includeGenFolder, writeMode: 'if-changed', cleanup: 'directory', formatter },
            generatedSource: { directory: this.sourceGenFolder, writeMode: 'if-changed', cleanup: 'directory', formatter },
            userInclude: { directory: this.includeFolder, writeMode: 'if-missing', formatter },
            userSource: { directory: this.sourceFolder, writeMode: 'if-missing', formatter },
        });
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

    protected override generateType(type: ast.Type, { files, acceptTask }: GenerationContext, notice: string | undefined) {
        const qualifiedName = fqn(type, '/');
        const header = qualifiedName + '.h';
        const source = qualifiedName + '.cpp';

        // A user header also requests the generation-gap pattern for value types.
        const includePathExist = fs.existsSync(files.resolvePath('userInclude', header));
        const useGenerationGapPattern = includePathExist || this.useGenerationGapPattern(type);
        if (useGenerationGapPattern) {
            acceptTask(() => this.generateOptionalFile(files, 'userInclude', header, () => this.generateHeader(header, type, notice), true));
        }
        acceptTask(() => this.generateOptionalFile(files, 'userSource', source, () => this.generateSource(source, type, notice, useGenerationGapPattern), true));

        const qualifiedNameGen = this.name(qualifiedName, useGenerationGapPattern);
        const generatedHeader = qualifiedNameGen + '.h';
        const generatedSource = qualifiedNameGen + '.cpp';
        acceptTask(() => this.generateOptionalFile(files, 'generatedInclude', generatedHeader, () => this.generateHeaderGen(generatedHeader, type, useGenerationGapPattern, notice)));
        acceptTask(() => this.generateOptionalFile(files, 'generatedSource', generatedSource, () => this.generateSourceGen(generatedSource, type, useGenerationGapPattern, notice)));
    }

    private async generateOptionalFile(
        files: GeneratedFiles,
        output: string,
        path: string,
        render: () => Promise<string | undefined>,
        userFile = false,
    ): Promise<void> {
        // Some types have no source file at all. Preserve this distinction without passing
        // undefined to the writer, and avoid rendering existing generation-gap user files.
        if (userFile && fs.existsSync(files.resolvePath(output, path))) {
            // Register existing outputs too. The fallback runs only if the file disappears
            // before the writer checks it; a missing optional body must not create an empty file.
            await files.write(output, path, async () => {
                const content = await render();
                if (content === undefined) {
                    throw new Error(`Optional user file disappeared during generation: ${files.resolvePath(output, path)}`);
                }
                return content;
            });
            return;
        }
        const content = await render();
        if (content !== undefined) {
            await files.write(output, path, content);
        }
    }

    public async generateHeader(path: string, type: ast.Type, notice: string | undefined) {
        let body: string | undefined;
        switch (type.$type) {
            case ast.Class.$type:
                body = await this.generateClassHeader(type as ast.Class);
                break;
            case ast.Exception.$type:
                body = await this.generateExceptionHeader(type as ast.Exception);
                break;
            case ast.Structure.$type:
                body = await this.generateStructureHeader(type as ast.Structure);
                break;
            case ast.Integer.$type:
                body = await this.generateIntegerHeader(type as ast.Integer);
                break;
            case ast.Float.$type:
                body = await this.generateFloatHeader(type as ast.Float);
                break;
            case ast.Model.$type:
            case ast.Service.$type:
                body = await this.generateComponentHeader(type as ast.Component);
                break;
            case ast.Interface.$type:
                body = await this.generateInterfaceHeader(type as ast.Interface);
                break;
            case ast.ArrayType.$type:
                body = await this.generateArrayHeader(type as ast.ArrayType);
                break;
            case ast.Enumeration.$type:
                body = await this.generateEnumerationHeader(type as ast.Enumeration);
                break;
            case ast.StringType.$type:
                body = await this.generateStringHeader(type as ast.StringType);
                break;
            case ast.NativeType.$type:
                body = await this.generateNativeTypeHeader(type as ast.NativeType);
                break;
            case ast.ValueReference.$type:
                body = await this.generateValueReferenceHeader(type as ast.ValueReference);
                break;
        }
        if (body?.length) {
            const guard = this.guard(type);
            return s`
                ${notice}
                ${this.fileBanner(Path.basename(path), '// -----------------------------------------------------------------------------')}
                /// @file ${fqn(type, '/')}.h

                #ifndef ${guard}
                #define ${guard}

                // Include the generated header file
                #include <${fqn(type, '/')}Gen.h>

                ${this.namespace(type, body)}

                #endif // ${guard}
                `;
        }
        return undefined;
    }

    public async generateSource(path: string, type: ast.Type, notice: string | undefined, gen = this.useGenerationGapPattern(type)) {
        let body: string | undefined;
        switch (type.$type) {
            case ast.Class.$type:
                body = await this.generateClassSource(type as ast.Class, gen);
                break;
            case ast.Exception.$type:
                body = await this.generateExceptionSource(type as ast.Exception, gen);
                break;
            case ast.Structure.$type:
                body = await this.generateStructureSource(type as ast.Structure);
                break;
            case ast.Integer.$type:
                body = await this.generateIntegerSource(type as ast.Integer);
                break;
            case ast.Float.$type:
                body = await this.generateFloatSource(type as ast.Float);
                break;
            case ast.Model.$type:
            case ast.Service.$type:
                body = await this.generateComponentSource(type as ast.Component, gen);
                break;
            case ast.Interface.$type:
                body = await this.generateInterfaceSource(type as ast.Interface);
                break;
            case ast.ArrayType.$type:
                body = await this.generateArraySource(type as ast.ArrayType);
                break;
            case ast.Enumeration.$type:
                body = await this.generateEnumerationSource(type as ast.Enumeration);
                break;
            case ast.StringType.$type:
                body = await this.generateStringSource(type as ast.StringType);
                break;
            case ast.NativeType.$type:
                body = await this.generateNativeTypeSource(type as ast.NativeType);
                break;
            case ast.ValueReference.$type:
                body = await this.generateValueReferenceSource(type as ast.ValueReference);
                break;
        }
        if (body?.length) {
            return s`
                ${notice}
                ${this.fileBanner(Path.basename(path), '// -----------------------------------------------------------------------------')}
                /// @file ${fqn(type, '/')}.cpp

                #include <${fqn(type, '/')}.h>
                ${ast.isWithBody(type) ? this.includes(type.elements.flatMap(element => ast.isOperation(element) ? [
                    ...this.sourceIncludesParameter(element.returnParameter),
                    ...element.parameter.flatMap(parameter => this.sourceIncludesParameter(parameter)),
                ] : []).filter(include => include !== type)) : undefined}
                ${ast.isWithBody(type) && type.elements.some(element => ast.isOperation(element)
                    ? element.returnParameter && this.attrHelper.isByReference(element.returnParameter)
                    : ast.isProperty(element) && this.attrHelper.isByReference(element)) ? '#include <stdexcept>' : undefined}

                ${this.namespace(type, body)}
                `;
        }
        return undefined;
    }
    public async generateHeaderGen(path: string, type: ast.Type, gen: boolean, notice: string | undefined) {
        let body: string | undefined;
        switch (type.$type) {
            case ast.Class.$type:
                body = await this.generateClassHeaderGen(type as ast.Class, gen);
                break;
            case ast.Exception.$type:
                body = await this.generateExceptionHeaderGen(type as ast.Exception, gen);
                break;
            case ast.Structure.$type:
                body = await this.generateStructureHeaderGen(type as ast.Structure, gen);
                break;
            case ast.Integer.$type:
                body = await this.generateIntegerHeaderGen(type as ast.Integer, gen);
                break;
            case ast.Float.$type:
                body = await this.generateFloatHeaderGen(type as ast.Float, gen);
                break;
            case ast.Model.$type:
            case ast.Service.$type:
                body = await this.generateComponentHeaderGen(type as ast.Component, gen);
                break;
            case ast.Interface.$type:
                body = await this.generateInterfaceHeaderGen(type as ast.Interface, gen);
                break;
            case ast.ArrayType.$type:
                body = await this.generateArrayHeaderGen(type as ast.ArrayType, gen);
                break;
            case ast.Enumeration.$type:
                body = await this.generateEnumerationHeaderGen(type as ast.Enumeration, gen);
                break;
            case ast.StringType.$type:
                body = await this.generateStringHeaderGen(type as ast.StringType, gen);
                break;
            case ast.NativeType.$type:
                body = await this.generateNativeTypeHeaderGen(type as ast.NativeType, gen);
                break;
            case ast.ValueReference.$type:
                body = await this.generateValueReferenceHeaderGen(type as ast.ValueReference, gen);
                break;
        }
        if (body?.length) {
            const guard = this.name(fqn(type, '_'), gen).toUpperCase() + '_H_';
            return s`
                ${notice}
                ${this.fileBanner(Path.basename(path), '// -----------------------------------------------------------------------------')}
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

                `;
        }
        return undefined;
    }

    public async generateSourceGen(path: string, type: ast.Type, gen: boolean, notice: string | undefined) {
        let body: string | undefined;
        switch (type.$type) {
            case ast.Class.$type:
                body = await this.generateClassSourceGen(type as ast.Class, gen);
                break;
            case ast.Exception.$type:
                body = await this.generateExceptionSourceGen(type as ast.Exception, gen);
                break;
            case ast.Structure.$type:
                body = await this.generateStructureSourceGen(type as ast.Structure, gen);
                break;
            case ast.Integer.$type:
                body = await this.generateIntegerSourceGen(type as ast.Integer, gen);
                break;
            case ast.Float.$type:
                body = await this.generateFloatSourceGen(type as ast.Float, gen);
                break;
            case ast.Model.$type:
            case ast.Service.$type:
                body = await this.generateComponentSourceGen(type as ast.Component, gen);
                break;
            case ast.Interface.$type:
                body = await this.generateInterfaceSourceGen(type as ast.Interface, gen);
                break;
            case ast.ArrayType.$type:
                body = await this.generateArraySourceGen(type as ast.ArrayType, gen);
                break;
            case ast.Enumeration.$type:
                body = await this.generateEnumerationSourceGen(type as ast.Enumeration, gen);
                break;
            case ast.StringType.$type:
                body = await this.generateStringSourceGen(type as ast.StringType, gen);
                break;
            case ast.NativeType.$type:
                body = await this.generateNativeTypeSourceGen(type as ast.NativeType, gen);
                break;
            case ast.ValueReference.$type:
                body = await this.generateValueReferenceSourceGen(type as ast.ValueReference, gen);
                break;
        }
        if (body?.length) {
            return s`
                ${notice}
                ${this.fileBanner(Path.basename(path), '// -----------------------------------------------------------------------------')}
                /// @file ${this.name(fqn(type, '/'), gen)}.cpp
                // This file is auto-generated, Do not edit otherwise your changes will be lost

                ${this.includes([...this.sourceIncludes(type), type])} 

                ${this.sourcePrologue(type)}${this.namespace(type, body)}
                `;
        }
        return undefined;
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
    async generateClassSource(type: ast.Class, gen = false): Promise<string | undefined> {
        return s`
            ${this.defineMembers(type, gen)}
            `;
    }
    async generateClassHeaderGen(type: ast.Class, gen: boolean): Promise<string | undefined> {
        const base = this.fqn(type.base?.ref, ast.isException(type) ? '::Smp::Exception' : undefined);
        const name = this.name(type, gen);
        const constructor = !(this.attrHelper.attributeBoolValue(type, 'Attributes.NoConstructor') ?? false)
            && !type.elements.filter(ast.isOperation).some(operation => this.attrHelper.isConstructor(operation) && operation.parameter.length === 0);
        const destructor = !(this.attrHelper.attributeBoolValue(type, 'Attributes.NoDestructor') ?? false);
        return s`
        ${gen ? `class ${type.name};` : ''}
        ${this.comment(type)}class ${name}${base ? `: public ${base}` : ''}
        {
            ${gen ? `friend class ${this.fqn(type)};` : ''}
        public:
            static void _Register(::Smp::Publication::ITypeRegistry* registry);
            
            ${constructor ? `${name}() = default;` : ''}
            ${destructor ? `~${name}() noexcept = default;` : ''}
            ${name}(const ${name}&) = default;
            
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
            ${fields.map(f => `type->AddField(
    "${f.name}", // Name
    ${this.description(f)}, // Description
    ${this.uuid(f.type.ref)}, // Type UUID
    offsetof(${type.name}, ${f.name}), // Field offset
    ${this.viewKind(f)}, // View Kind
    ${isState(f)}, // State
    ${isInput(f)}, // Input
    ${isOutput(f)} // Output
    );`).join('\n')}
        }
        
        ${this.uuidDefinition(type)}
        `;
    }
    async generateExceptionHeader(type: ast.Exception): Promise<string | undefined> {
        return this.generateClassHeader(type);
    }

    async generateExceptionSource(type: ast.Exception, gen = false): Promise<string | undefined> {
        return this.generateClassSource(type, gen);
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
    );`).join('\n')}
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
                "${this.escapeString(this.docHelper.getUnit(type))}", // Unit
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
            "${this.escapeString(this.docHelper.getUnit(type))}", // Unit
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

    async generateComponentSource(type: ast.Component, gen = true): Promise<string | undefined> {
        return s`
        void ${type.name}::DoPublish( ::Smp::IPublication* receiver) {
        }
        
        void ${type.name}::DoConfigure(::Smp::Services::ILogger* logger, ::Smp::Services::ILinkRegistry* linkRegistry) {
        }
        
        void ${type.name}::DoConnect(::Smp::ISimulator* simulator) {
        }
        
        void ${type.name}::DoDisconnect() {
        }
        ${this.defineMembers(type, gen)}
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
                case ast.Association.$type: return this.initializeAssociation(element as ast.Association, gen);
                case ast.Constant.$type: return this.initializeConstant(element as ast.Constant, gen);
                case ast.Container.$type: return this.initializeContainer(element as ast.Container, gen);
                case ast.EntryPoint.$type: return this.initializeEntryPoint(element as ast.EntryPoint, gen);
                case ast.EventSink.$type: return this.initializeEventSink(element as ast.EventSink);
                case ast.EventSource.$type: return this.initializeEventSource(element as ast.EventSource, gen);
                case ast.Field.$type: return this.initializeField(element as ast.Field, gen);
                case ast.Operation.$type: return this.initializeOperation(element as ast.Operation, gen);
                case ast.Property.$type: return this.initializeProperty(element as ast.Property, gen);
                case ast.Reference_.$type: return this.initializeReference(element as ast.Reference_, gen);
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
            case ast.Association.$type: return this.declareAssociationGen(element as ast.Association, gen);
            case ast.Constant.$type: return this.declareConstantGen(element as ast.Constant, gen);
            case ast.Container.$type: return this.declareContainerGen(element as ast.Container, gen);
            case ast.EntryPoint.$type: return this.declareEntryPointGen(element as ast.EntryPoint, gen);
            case ast.EventSink.$type: return this.declareEventSinkGen(element as ast.EventSink, gen);
            case ast.EventSource.$type: return this.declareEventSourceGen(element as ast.EventSource, gen);
            case ast.Field.$type: return this.declareFieldGen(element as ast.Field, gen);
            case ast.Operation.$type: return this.declareOperationGen(element as ast.Operation, gen);
            case ast.Property.$type: return this.declarePropertyGen(element as ast.Property, gen);
            case ast.Reference.$type: return this.declareReferenceGen(element as ast.Reference, gen);
            default: return undefined;
        }
    }
    protected defineGen(element: ast.NamedElement, gen: boolean): string | undefined {
        switch (element.$type) {
            case ast.Association.$type: return this.defineAssociationGen(element as ast.Association, gen);
            case ast.Constant.$type: return this.defineConstantGen(element as ast.Constant, gen);
            case ast.Container.$type: return this.defineContainerGen(element as ast.Container, gen);
            case ast.EntryPoint.$type: return this.defineEntryPointGen(element as ast.EntryPoint, gen);
            case ast.EventSink.$type: return this.defineEventSinkGen(element as ast.EventSink, gen);
            case ast.EventSource.$type: return this.defineEventSourceGen(element as ast.EventSource, gen);
            case ast.Field.$type: return this.defineFieldGen(element as ast.Field, gen);
            case ast.Operation.$type: return this.defineOperationGen(element as ast.Operation, gen);
            case ast.Property.$type: return this.definePropertyGen(element as ast.Property, gen);
            case ast.Reference.$type: return this.defineReferenceGen(element as ast.Reference, gen);
            default: return undefined;
        }
    }

    protected declareAssociationGen(element: ast.Association, _gen: boolean): string | undefined {
        return s`
            ${this.comment(element)}${this.attrHelper.isStatic(element) ? 'static ' : ''}${this.attrHelper.isMutable(element) ? 'mutable ' : ''}${this.type(element)} ${element.name};
            `;
    }
    protected defineAssociationGen(element: ast.Association, gen: boolean): string | undefined {
        if (this.attrHelper.isStatic(element)) {
            return `${this.type(element)} ${this.name(element.$container, gen)}::${element.name}{};`;
        }
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
        if (this.attrHelper.isConstructor(op)) { // components already inherit their constructors in the class header
            if (ast.isComponent(op.$container)) return undefined;
            const firstConstructor = op.$container.elements.find(element => ast.isOperation(element) && this.attrHelper.isConstructor(element));
            return op === firstConstructor ? `using ${this.name(op.$container, true)}::${this.name(op.$container, true)};` : undefined;
        }
        if (this.attrHelper.isVirtual(op) && !this.attrHelper.isAbstract(op)) // override virtual methods
            return `${this.comment(op)}${this.type(op.returnParameter)} ${this.operationName(op)}(${op.parameter.map(param => this.declareParameter(param)).join(', ')})${this.attrHelper.isConst(op) ? ' const' : ''} override;`;
        return undefined;
    }
    defaultReturn(param: ast.ReturnParameter, generatedOwner = false): string {
        const instance = !generatedOwner && !this.attrHelper.isStatic(param.$container) && param.type.ref === param.$container.$container;
        if (this.attrHelper.isByPointer(param)) {
            if (instance)
                return 'this';
            return 'nullptr';
        }
        if (instance)
            return '*this';
        return this.getDefaultValueForType(param.type.ref);
    }
    protected override defineOperation(op: ast.Operation, gen = false): string | undefined {
        if (this.attrHelper.isConstructor(op)) // constructor declared in gen folder
            return undefined;
        const result = op.returnParameter;
        const isStatic = this.attrHelper.isStatic(op);
        const isVirtual = this.attrHelper.isVirtual(op);
        const generatedOwner = gen && (isStatic || !isVirtual);
        const needsReference = result && this.attrHelper.isByReference(result)
            && (result.type.ref !== op.$container || this.attrHelper.isByPointer(result) || isStatic || generatedOwner
                || this.attrHelper.isConst(op) && !this.attrHelper.isConst(result));
        if (isStatic || !isVirtual || !this.attrHelper.isAbstract(op))
            return `${this.type(op.returnParameter)} ${this.name(op.$container, generatedOwner)}::${this.operationName(op)}(${op.parameter.map(param => this.defineParameter(param)).join(', ')})${!isStatic && this.attrHelper.isConst(op) ? ' const' : ''} {
    // TODO
    ${needsReference ? 'throw std::logic_error("Operation is not implemented.");' : result ? `return ${this.defaultReturn(result, generatedOwner)};` : ''}
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
            const visibilityHeader = visibility === initialVisibility ? '' : `${VisibilityKind[visibility]}:\n`;
            buffer.push(`${visibilityHeader}${declaration}`);
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

    protected defineMembers(container: ast.WithBody, useGenPattern: boolean): string {
        return container.elements.map(element => ast.isOperation(element) ? this.defineOperation(element, useGenPattern) : this.define(element)).filter(v => v !== undefined).join('\n');
    }
    protected defineMembersGen(container: ast.WithBody, useGenPattern: boolean): string {
        return container.elements.map(element => this.defineGen(element, useGenPattern)).filter(v => v !== undefined).join('\n');
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
        return `void set_${element.name}(${this.type(element)} value) override;`;
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
            void ${element.$container.name}::set_${element.name}(${this.type(element)} value){
                // TODO
            }
            `;
    }

    protected definePropertyGetter(element: ast.Property): string | undefined {
        return s`
            ${this.type(element)} ${element.$container.name}::get_${element.name}()${this.attrHelper.isConstGetter(element) ? ' const' : ''}{
                ${this.attrHelper.isByReference(element) ? 'throw std::logic_error("Property getter is not implemented.");' : s`
                    ${this.type(element)} ret {};
                    return ret;
                    `}
            }
            `;
    }
}
