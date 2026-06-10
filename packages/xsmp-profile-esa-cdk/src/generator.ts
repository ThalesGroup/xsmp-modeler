import { GapPatternCppGenerator, CxxStandard, type Include } from '@xsmp/core/generator/cpp';
import type { XsmpSharedServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast';
import { expandToString as s } from 'langium/generate';
import { VisibilityKind } from '@xsmp/core/utils';
import { getXsmpVersion } from '@xsmp/core';

export class EsaCdkGenerator extends GapPatternCppGenerator {
    constructor(services: XsmpSharedServices) {
        super(services, CxxStandard.CXX_STD_11);
    }
    protected override generatedBy(): string {
        return `EsaCdkGenerator-${getXsmpVersion()}`;
    }
    override registerModel(model: ast.Model): string {
        return s`
        // Register factory for Model ${model.name}
        simulator->RegisterFactory(new ::esa::ecss::smp::cdk::Factory<${this.fqn(model)}>(
                            "${model.name}", // Name
                             ${this.description(model)}, // Description
                            simulator, // Simulator
                            ${this.uuid(model)} // UUID
                            ));
        
        `;
    }

    override factoryIncludes(): Include[] {
        return ['esa/ecss/smp/cdk/Factory.h'];
    }

    override async generateArrayHeaderGen(type: ast.ArrayType, gen: boolean): Promise<string | undefined> {
        const name = this.name(type, gen);
        return s`
        ${this.comment(type)}using ${name} = ::esa::ecss::smp::cdk::Array<${this.fqn(type.itemType.ref)}, ${this.expression(type.size)}>;

        ${this.uuidDeclaration(type)}
        
        void _Register_${type.name}(::Smp::Publication::ITypeRegistry* registry);
        `;
    }
    override headerIncludesArray(type: ast.ArrayType): Include[] {
        return [...super.headerIncludesArray(type), 'esa/ecss/smp/cdk/Array.h'];
    }

    override async generateStringHeaderGen(type: ast.StringType, gen: boolean): Promise<string | undefined> {
        return s`
        ${this.comment(type)}using ${this.name(type, gen)} = ::esa::ecss::smp::cdk::String<${this.expression(type.length)}>;

        ${this.uuidDeclaration(type)}
        
        void _Register_${type.name}(::Smp::Publication::ITypeRegistry* registry);
        `;
    }
    override headerIncludesString(type: ast.StringType): Include[] {
        return [...super.headerIncludesString(type), 'esa/ecss/smp/cdk/String.h'];
    }

    override headerIncludesContainer(element: ast.Container): Include[] {
        return ['esa/ecss/smp/cdk/Container.h', ...super.headerIncludesContainer(element)];
    }

    protected override declareContainerGen(element: ast.Container): string | undefined {
        return s`
        ${this.comment(element)}::esa::ecss::smp::cdk::Container<${this.fqn(element.type.ref)}>* ${element.name};
        `;
    }
    protected override initializeContainer(element: ast.Container): string | undefined {
        return s`
        // Container: ${element.name}
        ${element.name} {new ::esa::ecss::smp::cdk::Container<${this.fqn(element.type.ref)}>(
            "${element.name}",
            ${this.description(element)},
            this,
            simulator,
            ${this.lower(element)}, 
            ${this.upper(element)})}
        
        `;
    }

    protected override constructContainer(element: ast.Container): string | undefined {
        return s`
        // Add container ${element.name}
        this->AddContainer(${element.name});
        `;
    }

    protected override declareReferenceGen(element: ast.Reference): string | undefined {
        return s`
        ${this.comment(element)}::esa::ecss::smp::cdk::Reference<${this.fqn(element.interface.ref)}>* ${element.name};
        `;
    }
    override headerIncludesReference(element: ast.Reference): Include[] {
        return ['esa/ecss/smp/cdk/Reference.h', ...super.headerIncludesReference(element)];
    }

    protected override initializeReference(element: ast.Reference): string | undefined {
        return s`
        // Reference: ${element.name}
        ${element.name} {new ::esa::ecss::smp::cdk::Reference<${this.fqn(element.interface.ref)}>(
            "${element.name}",
            ${this.description(element)},
            this,
            simulator,
            ${this.lower(element)},
            ${this.upper(element)})}
        
        `;
    }
    protected override constructReference(element: ast.Reference): string | undefined {
        return s`
        // Add reference ${element.name}
        this->AddReference(${element.name});
        `;
    }

    override headerIncludesEntryPoint(element: ast.EntryPoint): Include[] {
        return ['Smp/IEntryPoint.h', ...super.headerIncludesEntryPoint(element)];
    }
    override sourceIncludesEntryPoint(element: ast.EntryPoint): Include[] {
        return ['esa/ecss/smp/cdk/EntryPoint.h', ...super.sourceIncludesEntryPoint(element)];
    }
    protected override initializeEntryPoint(element: ast.EntryPoint, gen: boolean): string | undefined {
        return s`
        // EntryPoint: ${element.name}
        ${element.name}{ new ::esa::ecss::smp::cdk::EntryPoint(
            "${element.name}", // Name
            ${this.description(element)}, // Description
            this,
            simulator,
            &${this.name(element.$container, gen)}::_${element.name})}
        
        `;
    }
    protected override constructEntryPoint(element: ast.EntryPoint): string | undefined {
        return s`
    if (!this->GetEntryPoint("${element.name}"))
    {
        // Use existing implementation to manage Entry Points
        this->AddEntryPoint(${element.name});
    }
    else
    {
        Log(Smp::Services::ILogger::LMK_Error, "EntryPoint ${element.name} redeclared");
    }
    `;
    }
    override sourceIncludesEventSink(element: ast.EventSink): Include[] {
        if (this.eventType(element))
            return ['esa/ecss/smp/cdk/EventSinkArg.h', ...super.sourceIncludesEventSink(element)];
        return ['esa/ecss/smp/cdk/EventSinkVoid.h', ...super.sourceIncludesEventSink(element)];
    }
    protected override initializeEventSink(element: ast.EventSink, gen: boolean): string | undefined {
        const eventType = this.eventType(element);
        if (eventType)
            return s`
            // Event Sink: ${element.name}
            ${element.name}{ new ::esa::ecss::smp::cdk::EventSinkArg<${this.fqn(eventType)}>(
                "${element.name}", // Name
                ${this.description(element)}, // Description
                this,
                simulator,
                &${this.name(element.$container, gen)}::_${element.name})}
            
            `;
        return s`
        // Event Sink: ${element.name}
        ${element.name}{ new ::esa::ecss::smp::cdk::EventSinkVoid(
            "${element.name}", // Name
            ${this.description(element)}, // Description
            this,
            simulator,
            &${this.name(element.$container, gen)}::_${element.name})}
        
        `;
    }
    protected override constructEventSink(element: ast.EventSink): string | undefined {
        return s`
        // Add event sink ${element.name}
        this->AddEventSink(${element.name});
        `;
    }

    protected override declareEventSourceGen(element: ast.EventSource, _gen: boolean): string | undefined {
        const eventType = this.eventType(element);
        if (eventType)
            return s`
        ${this.comment(element)}::esa::ecss::smp::cdk::EventSourceArg<${this.fqn(eventType)}> *${element.name};
        `;

        return s`
        ${this.comment(element)}::esa::ecss::smp::cdk::EventSourceVoid *${element.name};
        `;
    }
    override headerIncludesEventSource(element: ast.EventSource): Include[] {
        return [this.eventType(element) ? 'esa/ecss/smp/cdk/EventSourceArg.h' : 'esa/ecss/smp/cdk/EventSourceVoid.h', ...super.headerIncludesEventSource(element)];
    }
    protected override initializeEventSource(element: ast.EventSource, _gen: boolean): string | undefined {
        const eventType = this.eventType(element);
        if (eventType)
            return s`
            // Event Source: ${element.name}
            ${element.name}{ new ::esa::ecss::smp::cdk::EventSourceArg<${this.fqn(eventType)}>(
                "${element.name}", // Name
                ${this.description(element)}, // Description
                this,
                simulator)}
            
            `;
        return s`
        // Event Source: ${element.name}
        ${element.name}{ new ::esa::ecss::smp::cdk::EventSourceVoid(
            "${element.name}", // Name
            ${this.description(element)}, // Description
            this,
            simulator)}
        
        `;

    }
    protected override constructEventSource(element: ast.EventSource): string | undefined {
        return s`
        // Add event source ${element.name}
        this->AddEventSource(${element.name});
        `;
    }
    override headerIncludesComponent(type: ast.Component): Include[] {

        const includes = super.headerIncludesComponent(type);
        includes.push('Smp/ISimulator.h', 'Smp/IComposite.h', 'Smp/PrimitiveTypes.h');

        if (!type.base) {
            includes.push(`esa/ecss/smp/cdk/${type.$type}.h`);
        }
        if (this.hasInvokableMembers(type)) {
            includes.push('map', 'Smp/IRequest.h', 'esa/ecss/smp/cdk/Request.h', 'esa/ecss/smp/cdk/RequestContainer.h');
        }
        if (type.elements.some(ast.isContainer)) {
            includes.push('esa/ecss/smp/cdk/Composite.h');
        }
        if (type.elements.some(ast.isReference)) {
            includes.push('esa/ecss/smp/cdk/Aggregate.h');
        }
        if (type.elements.some(ast.isEventSource)) {
            includes.push('esa/ecss/smp/cdk/EventProvider.h');
        }
        if (type.elements.some(ast.isEventSink)) {
            includes.push('esa/ecss/smp/cdk/EventConsumer.h');
        }
        if (type.elements.some(ast.isEntryPoint)) {
            includes.push('esa/ecss/smp/cdk/EntryPointPublisher.h');
        }

        return includes;
    }
    override sourceIncludesComponent(type: ast.Component): Include[] {
        const includes = super.sourceIncludesComponent(type);

        if (this.hasInvokableMembers(type)) {
            includes.push('Smp/IPublication.h', 'esa/ecss/smp/cdk/Request.h');
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
                // ${type.name}Gen call DoPublish/DoConfigure/DoConnect/DoDisconnect
                friend class ${this.fqn(type)}Gen;
                
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

    override async generateStructureHeaderGen(type: ast.Structure, gen: boolean): Promise<string | undefined> {
        const fields = type.elements.filter(ast.isField).filter(field => !this.attrHelper.isStatic(field));
        const hasConstructor = fields.some(field => field.default !== undefined);
        const name = this.name(type, gen);
        const constructorDeclaration = hasConstructor ? s`
            ${name}() = default;
            ~${name}() = default;
            ${name}(const ${name}&) = default;
            ${name}(${name}&&) = default;
            ${name}(${fields.map(field => `${this.fqn(field.type.ref)} ${field.name}`).join(', ')}):
            ${fields.map(field => `${field.name}(${field.name})`).join(', ')} {}
            ${name}& operator=(const ${name}&) = default;
        ` : undefined;

        return s`
        ${this.comment(type)}struct ${name}
        {
           ${this.declareMembersGen(type, VisibilityKind.public, gen)}

            ${constructorDeclaration}

            static void _Register(::Smp::Publication::ITypeRegistry* registry);
        };
        
        ${this.uuidDeclaration(type)}
        `;
    }

    protected override componentBase(type: ast.Component): string | undefined {
        return type.base ? this.fqn(type.base.ref) : `::esa::ecss::smp::cdk::${type.$type}`;
    }
    private hasInvokableMembers(type: ast.Component): boolean {
        return this.getInvokableOperations(type).length > 0;
    }
    private getInvokableOperations(type: ast.Component): ast.Operation[] {
        return type.elements.filter(ast.isOperation).filter(operation => this.isInvokable(operation));
    }
    protected override isInvokable(element: ast.Invokable): boolean {
        if (!ast.isOperation(element)) {
            return super.isInvokable(element);
        }
        if (!super.isInvokable(element)) {
            return false;
        }
        return this.attrHelper.getViewKind(element) !== undefined
            && element.parameter.every(param =>
                ast.isSimpleType(param.type.ref)
                && !ast.isStringType(param.type.ref)
                && param.direction !== 'out'
                && param.direction !== 'inout');
    }
    protected override componentBases(type: ast.Component): string[] {
        const bases = super.componentBases(type);
        if (type.elements.some(ast.isContainer))
            bases.push('public virtual ::esa::ecss::smp::cdk::Composite');
        if (type.elements.some(ast.isReference))
            bases.push('public virtual ::esa::ecss::smp::cdk::Aggregate');
        if (type.elements.some(ast.isEventSource))
            bases.push('public virtual ::esa::ecss::smp::cdk::EventProvider');
        if (type.elements.some(ast.isEventSink))
            bases.push('public virtual ::esa::ecss::smp::cdk::EventConsumer');
        if (type.elements.some(ast.isEntryPoint))
            bases.push('public virtual ::esa::ecss::smp::cdk::EntryPointPublisher');
        return bases;
    }

    override async generateComponentHeaderGen(type: ast.Component, gen: boolean): Promise<string | undefined> {
        const name = this.name(type, gen);
        const bases = this.componentBases(type);
        const hasInvokableMembers = this.hasInvokableMembers(type);
        const requestHandlerDeclarations = hasInvokableMembers ? s`
            private:
                template <typename _Type> static void PopulateRequestHandlers(_Type* bluePrint, typename ::esa::ecss::smp::cdk::RequestContainer<_Type>::Map& handlers);
                static ::esa::ecss::smp::cdk::RequestContainer<${name}>::Map requestHandlers;

            public:
                /// Dynamically invoke an operation using a request object that has 
                /// been created and filled with parameter values by the caller.
                /// @param   request Request object to invoke.
                /// @throws  Smp::InvalidOperationName
                /// @throws  Smp::InvalidParameterCount
                /// @throws  Smp::InvalidParameterType
                void Invoke(::Smp::IRequest* request) override;
            ` : undefined;
        const populateRequestHandlersDefinition = hasInvokableMembers ? s`
            template <typename _Type>
            void ${name}::PopulateRequestHandlers(_Type* bluePrint, typename ::esa::ecss::smp::cdk::RequestContainer<_Type>::Map& handlers) 
            {
                typedef ::esa::ecss::smp::cdk::RequestContainer<_Type> Help;
                
                // ---- Operations ----
                ${this.getInvokableOperations(type).map(operation => this.generateRqHandlerOperation(operation, gen)).join('\n')}
                
                ::esa::ecss::smp::cdk::${type.$type}::PopulateRequestHandlers<_Type>(bluePrint, handlers);
            }
            ` : undefined;
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
            ~${name}() override;
            
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
            ${requestHandlerDeclarations}
            
            ${this.declareMembersGen(type, VisibilityKind.public, gen)}
            };

            ${populateRequestHandlersDefinition}

            `;
    }

    override async generateComponentSourceGen(type: ast.Component, gen: boolean): Promise<string | undefined> {
        const name = this.name(type, gen);
        const base = this.componentBase(type);
        const fqn = this.fqn(type);
        const initializer = this.initializeMembers(type, gen);
        const hasInvokableMembers = this.hasInvokableMembers(type);
        const populateRequestHandlers = hasInvokableMembers ? s`
            if (requestHandlers.empty()) {
                PopulateRequestHandlers<${name}>(this, requestHandlers);
            }
            ` : undefined;
        const requestHandlerDefinitions = hasInvokableMembers ? s`
            ::esa::ecss::smp::cdk::RequestContainer<${name}>::Map ${name}::requestHandlers;

            void ${name}::Invoke(::Smp::IRequest* request) {
                if (!request) {
                    return;
                }
                auto it = requestHandlers.find(request->GetOperationName());
                if (it != requestHandlers.end()) {
                    it->second->Execute(*this, request);
                } else {
                    // pass the request down to the base class
                    ${base}::Invoke(request);
                }
            }
            ` : undefined;
        return s`
            //--------------------------- Constructor -------------------------
            ${name}::${name}(
                ::Smp::String8 name,
                ::Smp::String8 description,
                ::Smp::IComposite* parent,
                ::Smp::ISimulator* simulator):
                // Base class
                ${base}(name, description, parent, simulator)${initializer.length > 0 ? `,
                    ${initializer.join(',\n')}` : ''} { 
                ${this.constructMembers(type)}
            }

            /// Virtual destructor that is called by inherited classes as well.
            ${name}::~${name}() {
                ${this.finalizeMembers(type)}
            }

            void ${name}::Publish(::Smp::IPublication* receiver) {
                // Call parent class implementation first
                ${base}::Publish(receiver);
                
                ${populateRequestHandlers}
                
                ${this.publishMembers(type)}
                
                dynamic_cast<${fqn}*>(this)->DoPublish(receiver);
            }
            
            void ${name}::Configure(::Smp::Services::ILogger* logger, ::Smp::Services::ILinkRegistry* linkRegistry) {
                // Call parent implementation first
                ${base}::Configure(logger, linkRegistry);

                dynamic_cast<${fqn}*>(this)->DoConfigure(logger, linkRegistry);
            }
            
            void ${name}::Connect(::Smp::ISimulator* simulator) {
                // Call parent implementation first
                ${base}::Connect(simulator);
                    
                dynamic_cast<${fqn}*>(this)->DoConnect(simulator);
            }
            
            void ${name}::Disconnect() {
                if (this->GetState() == ::Smp::ComponentStateKind::CSK_Connected) {
                    dynamic_cast<${fqn}*>(this)->DoDisconnect();
                }

                // Call parent implementation last, to remove references to the Simulator and its services
                ${base}::Disconnect();
            }

            ${requestHandlerDefinitions}
            const ::Smp::Uuid& ${name}::GetUuid() const {
                return Uuid_${type.name};
            }
            ${this.uuidDefinition(type)}
            ${this.defineMembersGen(type, gen)}
            `;
    }

    protected generateRqHandlerOperation(op: ast.Operation, _gen: boolean): string {
        const r = op.returnParameter;
        const returnType = this.type(r);
        const parameterTypes = op.parameter.map(param => this.type(param));
        const templateArguments = [returnType, ...parameterTypes].join(', ');
        const containerType = this.name(op.$container, _gen);
        const pointerType = `${returnType} (${containerType}::*)(${parameterTypes.join(', ')})${this.attrHelper.isConst(op) ? ' const' : ''}`;
        return s`
            Help::template AddIfMissing<${templateArguments}>(
                handlers,
                "${op.name}",
                ${this.primitiveTypeKind(r?.type.ref)},
                static_cast<${pointerType}>(&${containerType}::${this.operationName(op)}));
            `;
    }

}
