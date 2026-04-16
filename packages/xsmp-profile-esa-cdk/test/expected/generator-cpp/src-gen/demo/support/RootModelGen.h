// -----------------------------------------------------------------------------
// File Name    : RootModelGen.h
// -----------------------------------------------------------------------------
/// @file demo/support/RootModelGen.h
// This file is auto-generated, Do not edit otherwise your changes will be lost

#ifndef DEMO_SUPPORT_ROOTMODELGEN_H_
#define DEMO_SUPPORT_ROOTMODELGEN_H_

// ----------------------------------------------------------------------------
// --------------------------- Forward Declarations ---------------------------
// ----------------------------------------------------------------------------

namespace demo
{
    namespace support
    {
        class RootModel;
    } // namespace support
} // namespace demo

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <demo/support/ChildModel.h>
#include <demo/support/Counter.h>
#include <demo/support/CounterArray.h>
#include <demo/support/IDevice.h>
#include <demo/support/Label.h>
#include <demo/support/Payload.h>
#include <demo/support/Ratio.h>
#include <esa/ecss/smp/cdk/Aggregate.h>
#include <esa/ecss/smp/cdk/Composite.h>
#include <esa/ecss/smp/cdk/Container.h>
#include <esa/ecss/smp/cdk/EntryPointPublisher.h>
#include <esa/ecss/smp/cdk/EventConsumer.h>
#include <esa/ecss/smp/cdk/EventProvider.h>
#include <esa/ecss/smp/cdk/EventSourceVoid.h>
#include <esa/ecss/smp/cdk/Model.h>
#include <esa/ecss/smp/cdk/Reference.h>
#include <map>
#include <Smp/IComposite.h>
#include <Smp/IEntryPoint.h>
#include <Smp/ISimulator.h>
#include <Smp/PrimitiveTypes.h>
#include <Smp/Publication/ITypeRegistry.h>

// ----------------------------------------------------------------------------
// --------------------------- Types and Interfaces ---------------------------
// ----------------------------------------------------------------------------

namespace demo
{
    namespace support
    {
        /// Universally unique identifier of type RootModel.
        constexpr ::Smp::Uuid Uuid_RootModel { 0x12121212U, 0x1212U, 0x4212U, 0x8212U, 0x121212121212U };

        class RootModelGen: public ::esa::ecss::smp::cdk::Model, public virtual ::demo::support::IDevice, public virtual ::esa::ecss::smp::cdk::Composite, public virtual ::esa::ecss::smp::cdk::Aggregate, public virtual ::esa::ecss::smp::cdk::EventProvider, public virtual ::esa::ecss::smp::cdk::EventConsumer, public virtual ::esa::ecss::smp::cdk::EntryPointPublisher
        {
        friend class ::demo::support::RootModel;
        public:
        /// Constructor setting name, description, parent and simulator.
        /// @param name Name of new Model instance.
        /// @param description Description of new Model instance.
        /// @param parent Parent of new Model instance.
        /// @param simulator The simulator instance.
        RootModelGen(::Smp::String8 name,
                ::Smp::String8 description,
                ::Smp::IComposite* parent,
                ::Smp::ISimulator* simulator);
        /// deleted copy constructor
        RootModelGen(const RootModelGen&) = delete;
        /// deleted move constructor
        RootModelGen(RootModelGen&&) = delete;
        /// deleted copy assignment
        RootModelGen& operator=(const RootModelGen&) = delete;
        /// deleted move assignment
        RootModelGen& operator=(RootModelGen&&) = delete;

        /// Virtual destructor to release memory.
        ~RootModelGen() override = default;

        /// Request the Model to publish its fields, properties and
        /// operations against the provided publication receiver.
        /// @param   receiver Publication receiver.
        /// @throws  Smp::InvalidComponentState
        void Publish(::Smp::IPublication* receiver) override;

        /// Request the Model to perform any custom configuration. The
        /// component can create and configure other components using the field
        /// values of its published fields.
        /// @param   logger Logger service for logging of error messages during
        ///          configuration.
        /// @param   linkRegistry Reference to the link registry services, so
        ///          that the Model can register links that it creates
        ///          during configuration.
        /// @throws  Smp::InvalidComponentState
        void Configure( ::Smp::Services::ILogger* logger, ::Smp::Services::ILinkRegistry* linkRegistry) override;

        /// Allow the Model to connect to the simulator and its simulation
        /// services.
        /// @param   simulator Simulation Environment that hosts the Model.
        /// @throws  Smp::InvalidComponentState
        void Connect( ::Smp::ISimulator* simulator) override;

        /// Ask the Model to disconnect from the simulator and all its
        /// simulation services.
        /// @throws  Smp::InvalidComponentState
        void Disconnect() override;

        /// Get Universally Unique Identifier of the Model.
        /// @return  Universally Unique Identifier of the Model.
        const ::Smp::Uuid& GetUuid() const override;

                    private:
                        template <typename _Type> static void PopulateRequestHandlers(_Type* bluePrint, typename ::esa::ecss::smp::cdk::RequestContainer<_Type>::Map& handlers);
                        static ::esa::ecss::smp::cdk::RequestContainer<RootModelGen>::Map requestHandlers;

                    public:
                        /// Dynamically invoke an operation using a request object that has
                        /// been created and filled with parameter values by the caller.
                        /// @param   request Request object to invoke.
                        /// @throws  Smp::InvalidOperationName
                        /// @throws  Smp::InvalidParameterCount
                        /// @throws  Smp::InvalidParameterType
                        void Invoke(::Smp::IRequest* request) override;


        private:
        /// Get connected.
        /// @return Current value of property connected.
        virtual ::Smp::Bool get_connected();
        /// Set connected.
        /// @param value New value of property connected to set.
        virtual void set_connected(::Smp::Bool value);
        virtual ::Smp::Bool ping(::demo::support::Ratio requested, ::Smp::Float64* measured)=0;
        public:
        ::Smp::IEntryPoint* main;
        virtual void _main() = 0;
        ::Smp::IEventSink* onTick;
        virtual void _onTick(::Smp::IObject* sender, ::demo::support::Counter) = 0;
        ::esa::ecss::smp::cdk::EventSourceVoid *onDone;
        private:
        ::demo::support::Label name;
        ::demo::support::CounterArray counters;
        ::demo::support::Payload payload;
        ::Smp::Bool connectedState;
        public:
        ::esa::ecss::smp::cdk::Container<::Smp::IComposite>* child;
        ::esa::ecss::smp::cdk::Reference<::demo::support::IDevice>* deviceRef;
        ::esa::ecss::smp::cdk::Reference<::demo::support::ChildModel>* childRef;
        };


                    template <typename _Type>
                    void RootModelGen::PopulateRequestHandlers(_Type* bluePrint, typename ::esa::ecss::smp::cdk::RequestContainer<_Type>::Map& handlers)
                    {
                        typedef ::esa::ecss::smp::cdk::RequestContainer<_Type> Help;

                        // ---- Operations ----
                        Help::template AddIfMissing<«IF o.returnParameter !== null»«o.returnParameter.type()»«ELSE»void«ENDIF»«FOR param : o.parameter BEFORE ', ' SEPARATOR ', '»«param.type()»«ENDFOR»>(
             handlers,
             "ping",
             ::Smp::PrimitiveTypeKind::PTK_Bool,
             static_cast<«IF o.returnParameter !== null»«o.returnParameter.type()»«ELSE»void«ENDIF»(«container.name(useGenPattern)»::*)(«FOR param : o.parameter SEPARATOR ', '»«param.type()»«ENDFOR»)«IF o.isConst»const«ENDIF»>(&«container.name(useGenPattern)»::«o.name»));

         if (handlers.find("ping") == handlers.end()) {
             handlers["ping"] = [](_Type & component, [[maybe_unused]] ::Smp::IRequest* request) {
             auto p_requested = static_cast<::demo::support::Ratio>(request->GetParameterValue(req->GetParameterIndex("requested")));
             ::Smp::Float64 p_measured;
             /// Invoke ping
             request->SetReturnValue({::Smp::PrimitiveTypeKind::PTK_Bool, component.ping(p_requested, &p_measured)});

             request->SetParameterValue(request->GetParameterIndex("measured"), p_measured);
             };
         }

                        ::esa::ecss::smp::cdk::«t.eClass.name»::PopulateRequestHandlers<_Type>(bluePrint, handlers);
                    }



    } // namespace support
} // namespace demo

#endif // DEMO_SUPPORT_ROOTMODELGEN_H_
