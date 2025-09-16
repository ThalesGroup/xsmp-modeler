import { GapPatternCppGenerator } from '../../generator/cpp/gap-pattern-generator.js';
import type { XsmpSharedServices } from '../../xsmp-module.js';
import { CxxStandard, type Include } from '../../generator/cpp/generator.js';
import * as ast from '../../generated/ast.js';
import { expandToString as s } from 'langium/generate';
import { getAccessKind, isInput, isOutput, isState } from '../../utils/xsmp-utils.js';
import { VisibilityKind } from '../../utils/visibility-kind.js';
import { xsmpVersion } from '../../version.js';

export class TasMdkGenerator extends GapPatternCppGenerator {
    constructor(services: XsmpSharedServices) {
        super(services, CxxStandard.CXX_STD_11);
        this.includeGenFolder = 'include-gen';
        this.includeFolder = 'include';
    }
    protected override generatedBy(): string {
        return `TasMdkGenerator-${xsmpVersion}`;
    }
    override registerModel(model: ast.Model): string {
        return s`
        // Register factory for Model ${model.name}
        simulator->RegisterFactory(new ::TasMdk::Factory(
                            "${model.name}", // name
                             ${this.description(model)}, // description
                            simulator, // parent
                            ${this.uuid(model)}, // UUID
                            "${this.fqn(model)}",// type name
                            [](::Smp::String8 name,
                                ::Smp::String8 description,
                                ::Smp::IObject* parent,
                                ::Smp::Publication::ITypeRegistry* type_registry) {
                                    return new ${this.fqn(model)}(name, description, parent, type_registry);
                                }, // instantiation callback
                            typeRegistry // type registry
                            ));
        
        `;
    }

    override factoryIncludes(): Include[] {
        return ['TasMdk/Factory.h'];
    }

    override async generateArrayHeaderGen(type: ast.ArrayType, gen: boolean): Promise<string | undefined> {
        const name = this.name(type, gen);
        const isSimple = this.attrHelper.attributeBoolValue(type, 'Attributes.SimpleArray') ?? ast.isSimpleType(type.itemType.ref);
        return s`
        ${this.comment(type)}using ${name} = ::TasMdk::Types::Array<${this.fqn(type.itemType.ref)}, ${this.expression(type.size)}>;

        ${this.uuidDeclaration(type)}
        
        void _Register_${type.name}(::Smp::Publication::ITypeRegistry* registry);

        template<bool ...Opts>
        using _${name} = TasMdk::Types::${isSimple ? 'SimpleArrayType' : 'ArrayType'}<${this.field_fqn(type.itemType.ref)}, ${this.expression(type.size)}, Opts...>;
        `;
    }
    override headerIncludesArray(type: ast.ArrayType): Include[] {
        return [...super.headerIncludesArray(type), 'TasMdk/Types/Array.h'];
    }

    override async generateStringHeaderGen(type: ast.StringType, gen: boolean): Promise<string | undefined> {
        return s`
        ${this.comment(type)}using ${this.name(type, gen)} = ::TasMdk::Types::String<${this.expression(type.length)}>;

        ${this.uuidDeclaration(type)}
        
        void _Register_${type.name}(::Smp::Publication::ITypeRegistry* registry);
        `;
    }
    override headerIncludesString(type: ast.StringType): Include[] {
        return [...super.headerIncludesString(type), 'TasMdk/Types/String.h'];
    }

    override headerIncludesContainer(element: ast.Container): Include[] {
        return ['TasMdk/Container.h', ...super.headerIncludesContainer(element)];
    }

    protected override declareContainerGen(element: ast.Container): string | undefined {
        return s`
        ${this.comment(element)}::TasMdk::Container<${this.fqn(element.type.ref)}>* ${element.name};
        `;
    }
    protected override initializeContainer(element: ast.Container): string | undefined {
        return s`
        // Container: ${element.name}
        ${element.name} {new ::TasMdk::Container<${this.fqn(element.type.ref)}>(
            "${element.name}",
            ${this.description(element)},
            this,
            _containers,
            ${this.lower(element)}, 
            ${this.upper(element)})}
        
        `;
    }

    protected override declareReferenceGen(element: ast.Reference): string | undefined {
        return s`
        ${this.comment(element)}::TasMdk::Reference<${this.fqn(element.interface.ref)}>* ${element.name};
        `;
    }
    override headerIncludesReference(element: ast.Reference): Include[] {
        return ['TasMdk/Reference_tpl.h', ...super.headerIncludesReference(element)];
    }

    protected override initializeReference(element: ast.Reference): string | undefined {
        return s`
        // Reference: ${element.name}
        ${element.name} {new ::TasMdk::Reference<${this.fqn(element.interface.ref)}>(
            "${element.name}",
            ${this.description(element)},
            this,
            _references,
            ${this.lower(element)},
            ${this.upper(element)})}
        
        `;
    }
    override headerIncludesEntryPoint(element: ast.EntryPoint): Include[] {
        return ['Smp/IEntryPoint.h', ...super.headerIncludesEntryPoint(element)];
    }
    override sourceIncludesEntryPoint(element: ast.EntryPoint): Include[] {
        return ['TasMdk/EntryPoint.h', ...super.sourceIncludesEntryPoint(element)];
    }
    protected override initializeEntryPoint(element: ast.EntryPoint, gen: boolean): string | undefined {
        return s`
        // EntryPoint: ${element.name}
        ${element.name}{ new ::TasMdk::EntryPoint(
            "${element.name}", // Name
            ${this.description(element)}, // Description
            this,
            _entrypoints,
            std::bind(&${this.name(element.$container, gen)}::_${element.name}, this))}
        
        `;
    }

    override sourceIncludesEventSink(element: ast.EventSink): Include[] {
        return ['TasMdk/EventSink.h', ...super.sourceIncludesEventSink(element)];
    }
    protected override initializeEventSink(element: ast.EventSink, gen: boolean): string | undefined {
        return s`
        // Event Sink: ${element.name}
        ${element.name}{ new ::TasMdk::EventSink(
            "${element.name}", // Name
            ${this.description(element)}, // Description
            this,
            _event_sinks,
            std::bind(&${this.name(element.$container, gen)}::_${element.name}, this, std::placeholders::_1))}
        
        `;
    }

    protected override declareEventSourceGen(element: ast.EventSource, _gen: boolean): string | undefined {
        return s`
        ${this.comment(element)}::TasMdk::EventSource *${element.name};
        `;
    }
    override headerIncludesEventSource(element: ast.EventSource): Include[] {
        return ['TasMdk/EventSource.h', ...super.headerIncludesEventSource(element)];
    }
    protected override initializeEventSource(element: ast.EventSource, _gen: boolean): string | undefined {
        return s`
        // Event Source: ${element.name}
        ${element.name}{ new ::TasMdk::EventSource(
            "${element.name}", // Name
            ${this.description(element)}, // Description
            this,
            _event_sources)}
        
        `;

    }

    override async generateStructureHeaderGen(type: ast.Structure, gen: boolean): Promise<string | undefined> {
        const fields = type.elements.filter(ast.isField).filter(field => !this.attrHelper.isStatic(field));
        const rawFqn = this.name(this.fqn(type), gen);
        const hasConstructor = fields.some(f => f.default !== undefined);
        const name = this.name(type, gen);

        return s`
        ${this.comment(type)}struct ${name} {
            ${this.declareMembersGen(type, VisibilityKind.public, gen)}

            ${hasConstructor ? `
            ${name}() = default;
            ~${name}() = default;
            ${name}(const ${name}&) = default;
            ${name}(${name}&&) = default;
            ${name}(${fields.map(f => `${this.fqn(f.type.ref)} ${f.name}`, this).join(', ')}):
            ${fields.map(f => `${f.name}(${f.name})`, this).join(', ')} {}
            ${name}& operator=(const ${name}&) = default;` : undefined}
            static void _Register(::Smp::Publication::ITypeRegistry* registry);
        };
        
        ${this.uuidDeclaration(type)}

        ${!gen ? `
            template<bool ...Opts>
            struct _${name} : public ::TasMdk::Types::StructureType<Opts...>
            {
                // the equivalent raw_type
                using raw_type = ${rawFqn};
                
                // constructor
                _${name} (const std::string& name, const std::string& description,
                        Smp::IObject *parent, Smp::ViewKind view,
                        const Smp::Publication::ITypeRegistry *type_registry, Smp::Uuid typeUuid,
                        const raw_type &default_value = raw_type{}) :
                        ::TasMdk::Types::StructureType<Opts...>(name, description, parent, view, type_registry->GetType(typeUuid))${fields.length === 0 ? '' : ','}
                       ${fields.map(f => s`
                            /// ${f.name} initialization
                            ${f.name}{"${f.name}", ${this.description(f)}, this->GetFields(), ${this.viewKind(f, 'view')},  type_registry, ${this.uuid(f.type.ref)}, default_value.${f.name}}
                            `, this).join(',\n')} {
                }
                
                // copy operator
                _${name} & operator=(const _${name} &other)
                {
                    ${fields.map(f => `${f.name} = other.${f.name};`, this).join('\n')}
                    return *this;
                }
                
                // copy operator from raw_type
                _${name} & operator=(const raw_type &other)
                {
                    ${fields.map(f => `${f.name} = other.${f.name};`, this).join('\n')}
                    return *this;
                }
                
                // convert to raw_type
                operator raw_type() const noexcept
                {
                    return {${fields.map(f => f.name).join(', ')}};
                }
                ${fields.map(f => `${this.structField(f)}`, this).join('\n')}
            };`: undefined}
        `;
    }
    protected field_fqn(reference?: ast.NamedElement): string {
        if (!reference) return '';
        const parent = reference.$container;
        if (ast.isNamedElement(parent)) {
            const key = { id: 'field_fqn', value: reference };
            return this.cache.get(key, () => `${this.fqn(parent, '::')}::${ast.isSimpleType(reference) ? '' : '_'}${reference.name}`) as string;
        }
        return '';
    }
    structField(field: ast.Field): string {
        let type: string;
        if (ast.isStructure(field.type.ref))
            type = `StructureField<${this.field_fqn(field.type.ref)}>`;
        else if (ast.isArrayType(field.type.ref))
            type = `ArrayField<${this.field_fqn(field.type.ref)}>`;
        else
            type = `SimpleField<${this.fqn(field.type.ref)}>`;

        return `${this.comment(field)}${this.attrHelper.isMutable(field) ? 'mutable ' : ''} typename ::TasMdk::${type}::in<Opts...>${isState(field) ? '' : '::transient'}${isInput(field) ? '::input' : ''}${isOutput(field) ? '::output' : ''}${this.attrHelper.isFailure(field) ? '::failure' : ''}${this.attrHelper.isForcible(field) ? '::forcible' : ''}${this.isOfInput(field) ? '::of_input' : ''}${this.isOfOutput(field) ? '::of_output' : ''}${this.isOfFailure(field) ? '::of_failure' : ''}::type ${field.name};`;
    }
    isOfInput(field: ast.Field): boolean {
        return this.attrHelper.attributeBoolValue(field, 'TasMdk.OfInput') ?? false;
    }
    isOfOutput(field: ast.Field): boolean {
        return this.attrHelper.attributeBoolValue(field, 'TasMdk.OfOutput') ?? false;
    }
    isOfFailure(field: ast.Field): boolean {
        return this.attrHelper.attributeBoolValue(field, 'TasMdk.OfFailure') ?? false;
    }

    override headerIncludesStructure(element: ast.Structure): Include[] {
        return ['TasMdk/Types/Structure.h', ...super.headerIncludesStructure(element)];
    }
    override headerIncludesComponent(type: ast.Component): Include[] {
        return ['Smp/ISimulator.h', 'type_traits', 'functional', ...super.headerIncludesComponent(type)];
    }
    override async generateComponentHeader(type: ast.Component): Promise<string | undefined> {
        return s`
            ${this.comment(type)}class ${type.name}: public ${type.name}Gen {
            public:
                /// Constructor setting name, description and parent.
                /// @param name Name of new model instance.
                /// @param description Description of new model instance.
                /// @param parent Parent of new model instance.
                /// @param type_registry Reference to global type registry.
                ${type.name}(
                        ::Smp::String8 name,
                        ::Smp::String8 description,
                        ::Smp::IObject* parent,
                        ::Smp::Publication::ITypeRegistry* type_registry);
                
                /// Virtual destructor to release memory.
                ~${type.name}() noexcept override = default;
            
                ${this.declareMembers(type, VisibilityKind.public)}
            };
            `;
    }
    override async generateComponentSource(type: ast.Component): Promise<string | undefined> {
        return s`
            ${type.name}::${type.name}(
                    ::Smp::String8 name,
                    ::Smp::String8 description,
                    ::Smp::IObject* parent,
                    ::Smp::Publication::ITypeRegistry* type_registry)
                    : ${this.name(type, true)}::${this.name(type, true)}(name, description, parent, type_registry) {
                // Publish_Callback = std::bind(&${type.name}::_publishHook, this, std::placeholders::_1);

                // Configure_Callback = std::bind(&${type.name}::_configureHook, this, std::placeholders::_1, std::placeholders::_2);

                // Connect_Callback = std::bind(&${type.name}::_connectHook, this, std::placeholders::_1);

                // Disconnect_Callback = std::bind(&${type.name}::_disconnectHook, this);
            }
            
            ${this.defineMembers(type, false)}
            `;
    }
    override async generateComponentHeaderGen(type: ast.Component, gen: boolean): Promise<string | undefined> {
        const name = this.name(type, gen);
        const bases = this.componentBases(type);
        return s`
            ${this.uuidDeclaration(type)}
            
            ${this.comment(type)}class ${name}${bases.length > 0 ? ':' : ''} ${bases.join(', ')}
            {
            ${gen ? `friend class ${this.fqn(type)};` : ''}

            ${this.declareMembersGen(type, VisibilityKind.private, gen)}

            // ------------------------------------------------------------------------------------
            // ------------------------- Constructors/Destructor -------------------------
            // ------------------------------------------------------------------------------------
            public:
                /// Constructor setting name, description and parent.
                /// @param name Name of new model instance.
                /// @param description Description of new model instance.
                /// @param parent Parent of new model instance.
                /// @param type_registry Reference to global type registry.
                ${name}(
                        ::Smp::String8 name,
                        ::Smp::String8 description,
                        ::Smp::IObject* parent,
                        ::Smp::Publication::ITypeRegistry* type_registry);

            
                /// Virtual destructor to release memory.
                ~${name}() override;
                
                static ::TasMdk::Request::Handler<${name}>::CollectionType requestHandlers;
                
            // ----------------------------------------------------------------------------------
			// ------------------------------- IComponent --------------------------------
			// ----------------------------------------------------------------------------------
            
                /// Publish fields, operations and properties of the model.
                /// @param receiver Publication receiver.
                void Publish(::Smp::IPublication* receiver) override;
            
                /// Request for configuration.
                /// @param logger Logger to use for log messages during Configure().
                /// @param linkRegistry Link Registry to use for registration of
                ///         links created during Configure() or later.
                void Configure( ::Smp::Services::ILogger* logger, ::Smp::Services::ILinkRegistry* linkRegistry) override;
            
                /// Connect model to simulator.
                /// @param simulator Simulation  Environment  that  hosts the model.
                ///
                void Connect(
                    ::Smp::ISimulator* simulator) override;
            
                /// Disconnect model to simulator.
                /// @throws Smp::InvalidComponentState
                void Disconnect() override;
            
                /// Return the Universally Unique Identifier of the Model.
                /// @return  Universally Unique Identifier of the Model.
                const Smp::Uuid& GetUuid() const override;
            
                /// Invoke the operation for the given request.
                /// @param request Request object to invoke.
                void Invoke(::Smp::IRequest* request) override;
            
            protected:
                /// It populates the static map of request handler to implement the invoke function.
                /// @param bluePrint an object to use as blue print if needed
                /// @param handlers the map to be populated.
                template <typename _Type>
                static void PopulateRequestHandlers(_Type* bluePrint, typename ::TasMdk::Request::Handler<_Type>::CollectionType& handlers);
                    
            private:
                /// Callback for custom publication
                std::function<void(::Smp::IPublication*)> Publish_Callback;
                /// Callback for custom configuration
                std::function<void(::Smp::Services::ILogger *, ::Smp::Services::ILinkRegistry*)> Configure_Callback;
                /// Callback for custom connection
                std::function<void(::Smp::ISimulator*)> Connect_Callback;
                /// Callback for custom disconnection
                std::function<void()> Disconnect_Callback;
            
            };
			template <typename _Type>
			void ${name}::PopulateRequestHandlers(
			    [[maybe_unused]] _Type* bluePrint,
			    [[maybe_unused]] typename ::TasMdk::Request::Handler<_Type>::CollectionType& handlers)
			{
                ${type.elements.filter(ast.isOperation).map(e => this.generateRqHandlerOperation(e, gen), this).join('\n')}
                ${type.elements.filter(ast.isProperty).map(e => this.generateRqHandlerProperty(e, gen), this).join('\n')}
			}
            `;
    }
    protected override componentBase(type: ast.Component): string | undefined {
        return type.base ? this.fqn(type.base.ref) : `::TasMdk::${type.$type}`;
    }

    override async generateComponentSourceGen(type: ast.Component, gen: boolean): Promise<string | undefined> {
        const name = this.name(type, gen);
        const base = this.componentBase(type);
        //const fqn = this.fqn(type);
        const initializer = this.initializeMembers(type, gen);
        return s`
            ::TasMdk::Request::Handler<${name}>::CollectionType ${name}::requestHandlers;
			
            void ${name}::Configure(::Smp::Services::ILogger* logger, ::Smp::Services::ILinkRegistry* linkRegistry) {
                // Call base implementation first
                ${base}::Configure(logger, linkRegistry);
                if (Configure_Callback) {
                    Configure_Callback(logger, linkRegistry);
			    }
            }

            void ${name}::Connect(::Smp::ISimulator* simulator) {
                // Call mdk implementation first
                ${base}::Connect(simulator);
                if (Connect_Callback) {
                    Connect_Callback(simulator);
                }
            }

            void ${name}::Disconnect() {
                if (Disconnect_Callback) {
                    Disconnect_Callback();
                }
                // Call parent implementation last, to remove references to the Simulator and its services
                ${base}::Disconnect();
            }
            
            ${name}::${name}(
                ::Smp::String8 name,
                ::Smp::String8 description,
                ::Smp::IObject* parent,
                ::Smp::Publication::ITypeRegistry* type_registry)
                : // Base class initialization
                ${base}(name, description, parent, type_registry)${initializer.length > 0 ? `,
                    ${initializer.join(',\n')}` : ''}
            { 
            }

            ${name}::~${name}() {
                ${this.finalizeMembers(type)}
            }

            void ${name}::Publish(::Smp::IPublication* receiver) {
                // Call base class implementation first
                ${base}::Publish(receiver);

                if (Publish_Callback) {
                    Publish_Callback(receiver);
                }
                
                // Populate the request handlers (only once)
                if (requestHandlers.empty()) {
                    PopulateRequestHandlers<${name}>(this, requestHandlers);
                }

                ${this.publishMembers(type)}
            }
            
   
            
            void ${name}::Invoke(::Smp::IRequest* request) {
                if (request == nullptr) {
                    return;
                }
                auto handler = requestHandlers.find(request->GetOperationName());
                if (handler != requestHandlers.end()) {
                    handler->second(*this, request);
                } else {
                    // pass the request down to the base model
                    ${base}::Invoke(request);
                }
            }
            const ::Smp::Uuid& ${name}::GetUuid() const {
                return Uuid_${type.name};
            }
            ${this.uuidDefinition(type)}
            ${this.defineMembersGen(type, gen)}
            `;
    }

    protected generateRqHandlerOperation(op: ast.Operation, _gen: boolean): string {
        const r = op.returnParameter;
        const invokation = `component.${this.operationName(op)}(${op.parameter.map(param => `${this.attrHelper.isByPointer(param) ? '&' : ''}p_${param.name}`, this).join(', ')})`;
        return s`
            if (handlers.find("${op.name}") == handlers.end()) {
                handlers["${op.name}"] = [](_Type & component, [[maybe_unused]] ::Smp::IRequest* request) {
                ${op.parameter.map(this.initParameter, this).join('\n')}
                /// Invoke ${op.name}
                ${r ? `request->SetReturnValue({${this.primitiveTypeKind(r.type.ref)}, ${invokation}})` : `${invokation}`};
                ${op.parameter.map(this.setParameter, this).join('\n')}
                };
            }
            `;
    }
    /*protected override isInvokable(element: ast.Invokable): boolean {
        if (ast.isOperation(element)) {
            if (element.returnParameter && !ast.isSimpleType(element.returnParameter.type.ref)) {
                return false;
            }
            return element.parameter.every(param => ast.isValueType(param.type.ref) && !ast.isClass(param.type.ref));
        }
        return super.isInvokable(element);
    }*/

    initParameter(param: ast.Parameter): string {
        switch (param.direction ?? 'in') {
            case 'out':
                // only declare the parameter
                return `${this.fqn(param.type.ref)} p_${param.name}${param.default ? this.directListInitializer(param.default) : ''};`;
            case 'in':
            case 'inout':
                // declare and initialize the parameter
                return s`
                ${this.fqn(param.type.ref)} p_${param.name}${param.default ? this.directListInitializer(param.default) : ''};
                ::TasMdk::Request::initParameter(p_${param.name}, request, "${param.name}", ${this.primitiveTypeKind(param.type.ref)}${param.default ? ', true' : ''});
                `;
        }
    }

    setParameter(param: ast.Parameter): string | undefined {
        switch (param.direction ?? 'in') {
            case 'out':
            case 'inout':
                if (ast.isStringType(param.type.ref)) {
                    return `::TasMdk::Request::setParameter(request, "${param.name}", {${this.primitiveTypeKind(param.type.ref)}, p_${param.name}.data()});`;
                }
                return `::TasMdk::Request::setParameter(request, "${param.name}", {${this.primitiveTypeKind(param.type.ref)}, p_${param.name}});`;
            case 'in':
                // do nothing
                return undefined;
        }
    }

    protected generateRqHandlerProperty(property: ast.Property, _gen: boolean): string {
        const accessKind = getAccessKind(property);
        return s`
            ${accessKind !== 'writeOnly' ? `
                if (handlers.find("get_${property.name}") == handlers.end()) {
                    handlers["get_${property.name}"] = [](_Type & component, ::Smp::IRequest* request) {
                        /// Invoke get_${property.name}
                        request->SetReturnValue({${this.primitiveTypeKind(property.type.ref)}, component.get_${property.name}()});
                    };
                }
                `: undefined}
            ${accessKind !== 'readOnly' ? `
                if (handlers.find("set_${property.name}") == handlers.end()) {
                    handlers["set_${property.name}"] = [](_Type & component, ::Smp::IRequest* request) {
                        /// Invoke set_${property.name}
                        ${this.fqn(property.type.ref)} ${property.name};
                        ::TasMdk::Request::initParameter(${property.name}, request, "${property.name}", ${this.primitiveTypeKind(property.type.ref)});
                        component.set_${property.name}(${property.name});
                    };
                }
                `: undefined}
            `;
    }
    private isCdkFieldType(type: ast.Type | undefined): boolean {
        if (ast.isClass(type))
            return false;
        if (ast.isStructure(type))
            return type.elements.filter(ast.isField).some(this.isCdkField, this);
        if (ast.isArrayType(type))
            return this.isCdkFieldType(type.itemType.ref);
        return false;
    }

    protected override isCdkField(field: ast.Field): boolean {
        const key = { id: 'isCdkField', value: field };
        return this.cache.get(key, () => ast.isComponent(field.$container) && !this.attrHelper.isStatic(field) && !ast.isClass(field.type.ref) &&
            (isOutput(field) || isInput(field) || this.attrHelper.isFailure(field) || this.attrHelper.isForcible(field) || this.isOfInput(field) || this.isOfOutput(field)
                || this.isOfFailure(field) || this.isCdkFieldType(field.type.ref))) as boolean;
    }
    override headerIncludesField(field: ast.Field): Include[] {
        if (this.isCdkField(field)) {
            return [...super.headerIncludesField(field), 'TasMdk/Field.h'];
        }
        return super.headerIncludesField(field);
    }
    protected override declareFieldGen(field: ast.Field, _gen: boolean): string | undefined {
        if (this.isCdkField(field)) {
            let type: string;
            if (ast.isStructure(field.type.ref))
                type = `StructureField<${this.field_fqn(field.type.ref)}>`;
            else if (ast.isArrayType(field.type.ref))
                type = `ArrayField<${this.field_fqn(field.type.ref)}>`;
            else
                type = `SimpleField<${this.fqn(field.type.ref)}>`;

            return `${this.comment(field)}${this.attrHelper.isMutable(field) ? 'mutable ' : ''} typename ::TasMdk::${type}${isState(field) ? '' : '::transient'}${isInput(field) ? '::input' : ''}${isOutput(field) ? '::output' : ''}${this.attrHelper.isFailure(field) ? '::failure' : ''}${this.attrHelper.isForcible(field) ? '::forcible' : ''}${this.isOfInput(field) ? '::of_input' : ''}${this.isOfOutput(field) ? '::of_output' : ''}${this.isOfFailure(field) ? '::of_failure' : ''}::type ${field.name};`;
        }
        return super.declareFieldGen(field, _gen);
    }
    protected override initializeField(field: ast.Field, _gen: boolean = false): string | undefined {
        if (this.isCdkField(field)) {
            return s`
                // Field ${field.name}
                ${field.name}{
                    "${field.name}", // Name
                    ${this.description(field)}, // Description
                    this, // Parent
                    ${this.viewKind(field)}, // View Kind
                    type_registry, // Type Registry
                    ${this.uuid(field.type.ref)}${field.default ? `, // Type UUID\n    ${this.expression(field.default)} // Default value` : ' // Type UUID'}
                }
                `;
        }
        return super.initializeField(field, _gen);
    }
}