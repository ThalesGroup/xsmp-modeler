import { GapPatternCppGenerator, CxxStandard, type Include } from 'xsmp/generator/cpp';
import type { XsmpSharedServices } from 'xsmp';
import * as ast from 'xsmp/ast';
import { expandToString as s } from 'langium/generate';
import { getAccessKind, isInput, isOutput, isState, VisibilityKind } from 'xsmp/utils';
import { xsmpVersion } from 'xsmp';

export class XsmpSdkGenerator extends GapPatternCppGenerator {
    constructor(services: XsmpSharedServices) {
        super(services, CxxStandard.CXX_STD_17);
    }
    protected override generatedBy(): string {
        return `XsmpSdkGenerator-${xsmpVersion}`;
    }
    override registerModel(model: ast.Model): string {
        return s`
        // Register factory for Model ${model.name}
        simulator->RegisterFactory(::Xsmp::Factory::Create<${this.fqn(model)}>(
            "${model.name}", // Name
            ${this.description(model)}, // Description
            simulator, // Simulator
            ${this.uuid(model)} // UUID
            ));
        
        `;
    }

    override factoryIncludes(): Include[] {
        return ['Xsmp/Factory.h'];
    }

    override async generateArrayHeaderGen(type: ast.ArrayType, gen: boolean): Promise<string | undefined> {
        return s`
        ${this.comment(type)}using ${this.name(type, gen)} = ::Xsmp::Array<${this.fqn(type.itemType.ref)}, ${this.expression(type.size)}>${this.attrHelper.isSimpleArray(type) ? '::simple' : ''};

        ${this.uuidDeclaration(type)}
        
        void _Register_${type.name}(::Smp::Publication::ITypeRegistry* registry);
        `;
    }
    override headerIncludesArray(type: ast.ArrayType): Include[] {
        return [...super.headerIncludesArray(type), 'Xsmp/Array.h'];
    }

    override async generateStringHeaderGen(type: ast.StringType, gen: boolean): Promise<string | undefined> {
        return s`
        ${this.comment(type)}using ${this.name(type, gen)} = ::Xsmp::String<${this.expression(type.length)}>;

        ${this.uuidDeclaration(type)}
        
        void _Register_${type.name}(::Smp::Publication::ITypeRegistry* registry);
        `;
    }
    override headerIncludesString(type: ast.StringType): Include[] {
        return [...super.headerIncludesString(type), 'Xsmp/String.h'];
    }

    override headerIncludesContainer(element: ast.Container): Include[] {
        return ['Xsmp/Container.h', ...super.headerIncludesContainer(element)];
    }

    protected override declareContainerGen(element: ast.Container): string | undefined {
        return s`
        ${this.comment(element)}::Xsmp::Container<${this.fqn(element.type.ref)}> ${element.name};
        `;
    }
    protected override initializeContainer(element: ast.Container): string | undefined {
        return s`
        // Container ${element.name}
        ${element.name} { 
            "${element.name}", // Name
            ${this.description(element)}, // Description
            this, // Parent
            ${this.lower(element)}, // Lower bound
            ${this.upper(element)} // Upper bound
        }
        `;
    }

    protected override declareReferenceGen(element: ast.Reference): string | undefined {
        return s`
        ${this.comment(element)}::Xsmp::Reference<${this.fqn(element.interface.ref)}> ${element.name};
        `;
    }
    override headerIncludesReference(element: ast.Reference): Include[] {
        return ['Xsmp/Reference.h', ...super.headerIncludesReference(element)];
    }

    protected override initializeReference(element: ast.Reference): string | undefined {
        return s`
        // Reference ${element.name}
        ${element.name}{
            "${element.name}", // Name
            ${this.description(element)}, // Description
            this, // Parent
            ${this.lower(element)}, // Lower bound
            ${this.upper(element)} // Upper bound
        }
        `;
    }

    protected override declareEntryPointGen(element: ast.EntryPoint, gen: boolean): string | undefined {
        return s`
        ${this.comment(element)}::Xsmp::EntryPoint ${element.name}; 
        virtual void _${element.name}()${gen ? ' = 0' : ''};
        `;
    }
    override headerIncludesEntryPoint(_element: ast.EntryPoint): Include[] {
        return ['Xsmp/EntryPoint.h'];
    }
    protected override initializeEntryPoint(element: ast.EntryPoint, _gen: boolean): string | undefined {
        return s`
        // EntryPoint ${element.name}
        ${element.name}{
            "${element.name}", // Name
            ${this.description(element)}, // Description
            this, // Parent
            [this]{this->_${element.name}();} // Callback
        }
        `;
    }

    protected override declareEventSinkGen(element: ast.EventSink, gen: boolean): string | undefined {
        const eventType = this.eventType(element);

        return s`
        ${this.comment(element)}::Xsmp::EventSink<${this.fqn(eventType)}> ${element.name};
        virtual void _${element.name}(::Smp::IObject* sender${eventType ? `, ${this.fqn(eventType)}` : ''})${gen ? ' = 0' : ''};
        `;
    }
    override headerIncludesEventSink(element: ast.EventSink): Include[] {
        return ['Xsmp/EventSink.h', ...super.headerIncludesEventSink(element)];
    }
    protected override initializeEventSink(element: ast.EventSink, _gen: boolean): string | undefined {
        const eventType = this.eventType(element);

        if (eventType) {
            return s`
        // EventSink ${element.name}
        ${element.name}{
            "${element.name}", // Name
            ${this.description(element)}, // Description
            this, // Parent
            [this](::Smp::IObject *sender, ${this.fqn(eventType)} value) {this->_${element.name}(sender, value);}, // Callback
            ${this.primitiveTypeKind(eventType)} // Primitive Type Kind
        }
        `;
        }
        else {
            return s`
        // EventSink ${element.name}
        ${element.name}{
            "${element.name}", // Name
            ${this.description(element)}, // Description
            this, // Parent
            [this](::Smp::IObject *sender) {this->_${element.name}(sender);} // Callback
        }
        `;
        }
    }

    protected override declareEventSourceGen(element: ast.EventSource, _gen: boolean): string | undefined {
        const eventType = this.eventType(element);
        return s`
        ${this.comment(element)}::Xsmp::EventSource<${this.fqn(eventType)}> ${element.name};
        `;
    }
    override headerIncludesEventSource(element: ast.EventSource): Include[] {
        return ['Xsmp/EventSource.h', ...super.headerIncludesEventSource(element)];
    }
    protected override initializeEventSource(element: ast.EventSource, _gen: boolean): string | undefined {
        const eventType = this.eventType(element);
        return s`
        // EventSource ${element.name}
        ${element.name}{
            "${element.name}", // Name
            ${this.description(element)}, // Description
            this${eventType ? `, // Parent\n    ${this.primitiveTypeKind(eventType)} // Primitive Type Kind` : ' // Parent'} 
        }
        `;

    }

    override async generateStructureHeaderGen(type: ast.Structure, gen: boolean): Promise<string | undefined> {
        const fields = type.elements.filter(ast.isField).filter(field => !this.attrHelper.isStatic(field));
        const rawFqn = this.name(this.fqn(type), gen);
        return s`
        ${this.comment(type)}struct ${this.name(type, gen)} {
            ${this.declareMembersGen(type, VisibilityKind.public, gen)}

            static void _Register(::Smp::Publication::ITypeRegistry* registry);

            template<typename _BASE> struct _Field : public _BASE {
                _Field(::Smp::Publication::ITypeRegistry *typeRegistry, ::Smp::Uuid typeUuid,
                       ::Smp::String8 name, ::Smp::String8 description = "", ::Smp::IObject *parent = nullptr,
                       ::Smp::ViewKind view = ::Smp::ViewKind::VK_All, const ${rawFqn} &value = {}) :
                       _BASE(typeRegistry, typeUuid, name ,description, parent, view)${fields.length === 0 ? '' : ','}
                       ${fields.map(field => s`
                            // Field ${field.name}
                            ${field.name}{
                                typeRegistry, // Type Registry
                                ${this.uuid(field.type.ref)}, //Type UUID
                                "${field.name}", // Name
                                ${this.description(field)}, // Description
                                this, // Parent
                                ${this.viewKind(field, 'view')}, // View Kind
                                value.${field.name} // Value
                            }
                            `).join(',\n')}
                {
                }
                _Field(const _Field&) = delete;
                _Field& operator = (const _Field&) = delete;

                // copy operator from ${rawFqn}
                _Field & operator=(const ${rawFqn} &other) {
                    ${fields.map(field => `this->${field.name} = other.${field.name};`).join('\n')}
                    return *this;
                }
                
                // implicit convertion to ${rawFqn}
                operator ${rawFqn}() const noexcept {
                    return {${fields.map(field => field.name).join(', ')}};
                }
                
                ${fields.length === 0 ? '' : '// Fields declaration'}
                ${fields.map(field => `${this.comment(field)}${this.attrHelper.isMutable(field) ? 'mutable ' : ''}typename _BASE::template Field<${this.fqn(field.type.ref)}>${isState(field) ? '' : '::transient'}${isInput(field) ? '::input' : ''}${isOutput(field) ? '::output' : ''}${this.attrHelper.isForcible(field) ? '::forcible' : ''}${this.attrHelper.isFailure(field) ? '::failure' : ''} ${field.name};`).join('\n')}
               };
        };
        
        ${this.uuidDeclaration(type)}
        `;
    }

    override sourceIncludesComponent(type: ast.Component): Include[] {
        const includes = super.sourceIncludesComponent(type);
        includes.push('Xsmp/ComponentHelper.h');

        if (this.hasInvokableMembers(type)) {
            includes.push('Xsmp/Request.h');
        }
        return includes;
    }
    override  headerIncludesComponent(type: ast.Component): Include[] {
        const includes = super.headerIncludesComponent(type);
        includes.push('Smp/ISimulator.h');
        includes.push('Smp/IComposite.h');
        includes.push('Smp/PrimitiveTypes.h');

        if (!type.base) {
            includes.push(`Xsmp/${type.$type}.h`);
        }
        if (this.hasInvokableMembers(type)) {
            includes.push('map');
            includes.push('Smp/IRequest.h');
            includes.push('functional');
            includes.push('string_view');
        }
        if (type.elements.some(ast.isContainer)) {
            includes.push('Xsmp/Composite.h');
        }
        if (type.elements.some(ast.isReference)) {
            includes.push('Xsmp/Aggregate.h');
        }
        if (type.elements.some(ast.isEventSource)) {
            includes.push('Xsmp/EventProvider.h');
        }
        if (type.elements.some(ast.isEventSink)) {
            includes.push('Xsmp/EventConsumer.h');
        }
        if (type.elements.some(ast.isEntryPoint)) {
            includes.push('Xsmp/EntryPointPublisher.h');
        }
        if (this.hasFailureField(type)) {
            includes.push('Xsmp/FallibleModel.h');
        }
        return includes;
    }

    override async generateComponentHeader(type: ast.Component): Promise<string | undefined> {
        return s`
            ${this.comment(type)}class ${type.name}: public ${type.name}Gen {
            public:
                /// Re-use parent constructor
                using ${type.name}Gen::${type.name}Gen;
                
                /// Virtual destructor to release memory.
                ~${type.name}() noexcept override = default;
                
            private:
                // visibility to call DoPublish / DoConfigure / DoConnect / DoDisconnect
                friend class ::Xsmp::Component::Helper;
                
                /// Publish fields, operations and properties of the ${type.$type}.
                /// @param receiver Publication receiver.
                void DoPublish(::Smp::IPublication* receiver);
                
                /// Perform any custom configuration of the ${type.$type}.
                /// @param logger Logger to use for log messages during Configure().
                /// @param linkRegistry Link Registry to use for registration of
                ///         links created during Configure() or later.
                void DoConfigure(::Smp::Services::ILogger* logger, ::Smp::Services::ILinkRegistry* linkRegistry);
                
                /// Connect the ${type.$type} to the simulator and its simulation 
                /// services.
                /// @param simulator Simulation Environment that hosts the ${type.$type}.
                void DoConnect(::Smp::ISimulator* simulator);
                
                /// Disconnect the ${type.$type} from the simulator and all its 
                /// simulation services.
                void DoDisconnect();
            
                ${this.declareMembers(type, VisibilityKind.private)}
            };
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
            public:
            /// Constructor setting name, description, parent and simulator.
            /// @param name Name of new ${type.$type} instance.
            /// @param description Description of new ${type.$type} instance.
            /// @param parent Parent of new ${type.$type} instance.
            /// @param simulator The simulator instance.
            ${name}(::Smp::String8 name,
                    ::Smp::String8 description,
                    ::Smp::IComposite* parent,
                    ::Smp::ISimulator* simulator);
            /// deleted copy constructor
            ${name}(const ${name}&) = delete;
            /// deleted move constructor
            ${name}(${name}&&) = delete;
            /// deleted copy assignment
            ${name}& operator=(const ${name}&) = delete;
            /// deleted move assignment
            ${name}& operator=(${name}&&) = delete;
            
            /// Virtual destructor to release memory.
            ~${name}() override = default;
            
            /// Request the ${type.$type} to publish its fields, properties and 
            /// operations against the provided publication receiver.
            /// @param   receiver Publication receiver.
            /// @throws  Smp::InvalidComponentState
            void Publish(::Smp::IPublication* receiver) override;
            
            /// Request the ${type.$type} to perform any custom configuration. The 
            /// component can create and configure other components using the field
            /// values of its published fields.
            /// @param   logger Logger service for logging of error messages during
            ///          configuration.
            /// @param   linkRegistry Reference to the link registry services, so 
            ///          that the ${type.$type} can register links that it creates 
            ///          during configuration.
            /// @throws  Smp::InvalidComponentState
            void Configure( ::Smp::Services::ILogger* logger, ::Smp::Services::ILinkRegistry* linkRegistry) override;
            
            /// Allow the ${type.$type} to connect to the simulator and its simulation 
            /// services.
            /// @param   simulator Simulation Environment that hosts the ${type.$type}.
            /// @throws  Smp::InvalidComponentState
            void Connect( ::Smp::ISimulator* simulator) override;
            
            /// Ask the ${type.$type} to disconnect from the simulator and all its 
            /// simulation services.
            /// @throws  Smp::InvalidComponentState
            void Disconnect() override;
            
            /// Get Universally Unique Identifier of the ${type.$type}.
            /// @return  Universally Unique Identifier of the ${type.$type}.
            const ::Smp::Uuid& GetUuid() const override;
            ${this.hasInvokableMembers(type) ? `
            private:
            static std::map<std::string_view, std::function<void(${name}*, ::Smp::IRequest*)>> _requestHandlers;

            public:
                /// Dynamically invoke an operation using a request object that has 
                /// been created and filled with parameter values by the caller.
                /// @param   request Request object to invoke.
                /// @throws  Smp::InvalidOperationName
                /// @throws  Smp::InvalidParameterCount
                /// @throws  Smp::InvalidParameterType
                void Invoke(::Smp::IRequest* request) override;
            `: undefined}
            
            ${this.declareMembersGen(type, VisibilityKind.public, gen)}
            };
            `;
    }
    protected override componentBase(type: ast.Component): string | undefined {
        return type.base ? this.fqn(type.base.ref) : `::Xsmp::${type.$type}`;
    }
    protected override componentBases(type: ast.Component): string[] {
        const bases = super.componentBases(type);
        if (type.elements.some(ast.isContainer))
            bases.push('public virtual ::Xsmp::Composite');
        if (type.elements.some(ast.isReference))
            bases.push('public virtual ::Xsmp::Aggregate');
        if (type.elements.some(ast.isEventSource))
            bases.push('public virtual ::Xsmp::EventProvider');
        if (type.elements.some(ast.isEventSink))
            bases.push('public virtual ::Xsmp::EventConsumer');
        if (type.elements.some(ast.isEntryPoint))
            bases.push('public virtual ::Xsmp::EntryPointPublisher');
        if (this.hasFailureField(type))
            bases.push('public virtual ::Xsmp::FallibleModel');
        return bases;
    }

    override async generateComponentSourceGen(type: ast.Component, gen: boolean): Promise<string | undefined> {
        const name = this.name(type, gen);
        const base = this.componentBase(type);
        const fqn = this.fqn(type);
        const initializer = this.initializeMembers(type, gen);
        return s`
            //--------------------------- Constructor -------------------------
            ${name}::${name}(
                ::Smp::String8 name,
                ::Smp::String8 description,
                ::Smp::IComposite* parent,
                ::Smp::ISimulator* simulator):
                // Base class
                ${base}(name, description, parent, simulator)${initializer.length > 0 ? `,
                    ${initializer.join(',\n')}` : ''} { }
            
            void ${name}::Publish(::Smp::IPublication* receiver) {
                // Call parent class implementation first
                ${base}::Publish(receiver);
                
                ${this.publishMembers(type)}
                // Call user DoPublish if any
                ::Xsmp::Component::Helper::Publish<${fqn}>(this, receiver);
            }
            
            void ${name}::Configure(::Smp::Services::ILogger* logger, ::Smp::Services::ILinkRegistry* linkRegistry) {
                // Call parent implementation first
                ${base}::Configure(logger, linkRegistry);

                // Call user DoConfigure if any
                ::Xsmp::Component::Helper::Configure<${fqn}>(this, logger, linkRegistry);
            }
            
            void ${name}::Connect(::Smp::ISimulator* simulator) {
                // Call parent implementation first
                ${base}::Connect(simulator);
                    
                // Call user DoConnect if any
                ::Xsmp::Component::Helper::Connect<${fqn}>(this, simulator);
            }
            
            void ${name}::Disconnect() {
                if (this->GetState() == ::Smp::ComponentStateKind::CSK_Connected) {
                    // Call user DoDisconnect if any
                    ::Xsmp::Component::Helper::Disconnect<${fqn}>(this);
                }

                // Call parent implementation last, to remove references to the Simulator and its services
                ${base}::Disconnect();
            }
            
            ${this.hasInvokableMembers(type) ? `
                std::map<std::string_view, std::function<void(${name}*, ::Smp::IRequest*)>> ${name}::_requestHandlers{
                    ${this.getInvokableOperations(type).map(operation => this.generateRqHandlerOperation(operation, gen)).join('\n')}
                    ${this.getInvokableProperties(type).map(property => this.generateRqHandlerProperty(property, gen)).join('\n')}
                };
                
                void ${name}::Invoke(::Smp::IRequest* request) {
                    if (!request) {
                        return;
                    }
                    if (auto it = _requestHandlers.find(request->GetOperationName());
                            it != _requestHandlers.end()) {
                        it->second(this, request);
                    } else {
                        // pass the request down to the base class
                        ${base}::Invoke(request);
                    }
                }

                `: undefined}
            const ::Smp::Uuid& ${name}::GetUuid() const {
                return Uuid_${type.name};
            }
            ${this.uuidDefinition(type)}
            ${this.defineMembersGen(type, gen)}
            `;
    }

    protected generateRqHandlerOperation(op: ast.Operation, gen: boolean): string {
        const r = op.returnParameter;
        const invokation = `component->${this.operationName(op)}(${op.parameter.map(param => `${this.attrHelper.isByPointer(param) ? '&' : ''}p_${param.name}`).join(', ')})`;
        return s`
            // Handler for Operation ${op.name}
            {"${op.name}",
            [](${this.name(op.$container, gen)}* component, ::Smp::IRequest *${r || op.parameter.length > 0 ? 'request' : ''}) {
                ${op.parameter.map(param => this.initParameter(param)).join('\n')}
                ${r ? `::Xsmp::Request::setReturnValue(request, ${this.primitiveTypeKind(r.type.ref)}, ${invokation})` : `${invokation}`};
                ${op.parameter.map(param => this.setParameter(param)).join('\n')}
            }},

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
                return `${this.fqn(param.type.ref)} p_${param.name}${this.directListInitializer(param.default)};`;
            case 'in':
            case 'inout':
                // declare and initialize the parameter
                if (ast.isSimpleType(param.type.ref)) {
                    return `auto p_${param.name} = ::Xsmp::Request::get<${this.fqn(param.type.ref)}>(component, request, "${param.name}", ${this.primitiveTypeKind(param.type.ref)}${param.default ? `, ${this.expression(param.default)}` : ''});`;
                }
                return `auto p_${param.name} = ::Xsmp::Request::get<${this.fqn(param.type.ref)}>(component, request, "${param.name}", ${this.uuid(param.type.ref)}${param.default ? `, ${this.expression(param.default)}` : ''});`;
        }
    }

    setParameter(param: ast.Parameter): string | undefined {
        switch (param.direction ?? 'in') {
            case 'out':
            case 'inout':
                if (ast.isSimpleType(param.type.ref)) {
                    return `::Xsmp::Request::set(component, request, "${param.name}", ${this.primitiveTypeKind(param.type.ref)}, p_${param.name});`;
                }
                return `::Xsmp::Request::set(component, request, "${param.name}", ${this.uuid(param.type.ref)}, p_${param.name});`;
            case 'in':
                // do nothing
                return undefined;
        }
    }

    protected generateRqHandlerProperty(property: ast.Property, gen: boolean): string {
        const accessKind = getAccessKind(property);
        const cmp = this.name(property.$container, gen);
        return s`
            ${accessKind !== 'writeOnly' ? `
                // Getter handler for Property ${property.name}
                {"get_${property.name}",
                [](${cmp}* component, ::Smp::IRequest *request) {
                    ::Xsmp::Request::setReturnValue(request, ${this.primitiveTypeKind(property.type.ref)}, component->get_${property.name}());
                }},
                
                `: undefined}
            ${accessKind !== 'readOnly' ? `
                // Setter handler for Property ${property.name}
                {"set_${property.name}",
                [](${cmp}* component, ::Smp::IRequest *request) {
                    component->set_${property.name}(::Xsmp::Request::get<${this.fqn(property.type.ref)}>(component, request, "${property.name}", ${this.primitiveTypeKind(property.type.ref)}));
                }},
                
                `: undefined}
            `;
    }
    private isCdkFieldType(type: ast.Type | undefined): boolean {
        if (ast.isClass(type))
            return false;
        if (ast.isStructure(type))
            return type.elements.filter(ast.isField).some(field => this.isCdkField(field));
        if (ast.isArrayType(type))
            return this.isCdkFieldType(type.itemType.ref);
        return false;
    }

    private hasInvokableMembers(type: ast.Component): boolean {
        return type.elements.filter(ast.isInvokable).some(element => this.isInvokable(element));
    }

    private getInvokableOperations(type: ast.Component): ast.Operation[] {
        return type.elements.filter(ast.isOperation).filter(operation => this.isInvokable(operation));
    }

    private getInvokableProperties(type: ast.Component): ast.Property[] {
        return type.elements.filter(ast.isProperty).filter(property => this.isInvokable(property));
    }

    private hasFailureField(type: ast.Component): boolean {
        return type.$type === ast.Model.$type && type.elements.some(element => ast.isField(element) && this.attrHelper.isFailure(element));
    }

    protected override isCdkField(field: ast.Field): boolean {
        const key = { id: 'isCdkField', value: field };
        return this.cache.get(key, () => ast.isComponent(field.$container) && !this.attrHelper.isStatic(field) && !ast.isClass(field.type.ref) && (isOutput(field) || this.attrHelper.isFailure(field) || this.attrHelper.isForcible(field) || this.isCdkFieldType(field.type.ref))) as boolean;
    }
    override headerIncludesField(field: ast.Field): Include[] {
        if (this.isCdkField(field)) {
            return [...super.headerIncludesField(field), 'Xsmp/Field.h'];
        }
        return super.headerIncludesField(field);
    }
    protected override declareFieldGen(field: ast.Field, _gen: boolean): string | undefined {
        if (this.isCdkField(field)) {
            return s`
                ${this.comment(field)}${this.attrHelper.isMutable(field) ? 'mutable ' : ''}::Xsmp::Field<${this.fqn(field.type.ref)}>${isState(field) ? '' : '::transient'}${isInput(field) ? '::input' : ''}${isOutput(field) ? '::output' : ''}${this.attrHelper.isForcible(field) ? '::forcible' : ''}${this.attrHelper.isFailure(field) ? '::failure' : ''} ${field.name};
                `;
        }
        return super.declareFieldGen(field, _gen);
    }
    protected override initializeField(field: ast.Field, _gen: boolean = false): string | undefined {
        if (this.isCdkField(field)) {
            return s`
                // Field ${field.name}
                ${field.name}{
                    simulator->GetTypeRegistry(), // Type Registry
                    ${this.uuid(field.type.ref)}, // Type UUID
                    "${field.name}", // Name
                    ${this.description(field)}, // Description
                    this, // Parent
                    ${this.viewKind(field)}${field.default ? `, // View Kind\n    ${this.expression(field.default)} // Default value` : ' // View Kind'}
                }
                `;
        }
        return super.initializeField(field, _gen);
    }
}
