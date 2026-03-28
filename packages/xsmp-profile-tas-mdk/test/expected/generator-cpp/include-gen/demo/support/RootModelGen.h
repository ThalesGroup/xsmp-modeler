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
#include <demo/support/CounterArray.h>
#include <demo/support/IDevice.h>
#include <demo/support/Label.h>
#include <demo/support/Payload.h>
#include <demo/support/Ratio.h>
#include <functional>
#include <Smp/IComposite.h>
#include <Smp/IEntryPoint.h>
#include <Smp/ISimulator.h>
#include <Smp/PrimitiveTypes.h>
#include <Smp/Publication/ITypeRegistry.h>
#include <TasMdk/Container.h>
#include <TasMdk/EventSource.h>
#include <TasMdk/Reference_tpl.h>
#include <type_traits>

// ----------------------------------------------------------------------------
// --------------------------- Types and Interfaces ---------------------------
// ----------------------------------------------------------------------------

namespace demo
{
    namespace support
    {
                 /// Universally unique identifier of type RootModel.
                 constexpr ::Smp::Uuid Uuid_RootModel { 0x12121212U, 0x1212U, 0x4212U, 0x8212U, 0x121212121212U };

                 class RootModelGen: public ::TasMdk::Model, public virtual ::demo::support::IDevice
                 {
                 friend class ::demo::support::RootModel;

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
                 ::TasMdk::EventSource *onDone;
                 private:
                 ::demo::support::Label name;
                 ::demo::support::CounterArray counters;
                 ::demo::support::Payload payload;
                 ::Smp::Bool connectedState;
                 public:
                 ::TasMdk::Container<::Smp::IComposite>* child;
                 ::TasMdk::Reference<::demo::support::IDevice>* deviceRef;
                 ::TasMdk::Reference<::demo::support::ChildModel>* childRef;

                 // ------------------------------------------------------------------------------------
                 // ------------------------- Constructors/Destructor -------------------------
                 // ------------------------------------------------------------------------------------
                 public:
                     /// Constructor setting name, description and parent.
                     /// @param name Name of new model instance.
                     /// @param description Description of new model instance.
                     /// @param parent Parent of new model instance.
                     /// @param type_registry Reference to global type registry.
                     RootModelGen(
                             ::Smp::String8 name,
                             ::Smp::String8 description,
                             ::Smp::IObject* parent,
                             ::Smp::Publication::ITypeRegistry* type_registry);


                     /// Virtual destructor to release memory.
                     ~RootModelGen() override;

                     static ::TasMdk::Request::Handler<RootModelGen>::CollectionType requestHandlers;

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
        void RootModelGen::PopulateRequestHandlers(
            [[maybe_unused]] _Type* bluePrint,
            [[maybe_unused]] typename ::TasMdk::Request::Handler<_Type>::CollectionType& handlers)
        {
                     if (handlers.find("ping") == handlers.end()) {
                         handlers["ping"] = [](_Type & component, [[maybe_unused]] ::Smp::IRequest* request) {
                         ::demo::support::Ratio p_requested;
                         ::TasMdk::Request::initParameter(p_requested, request, "requested", ::Smp::PrimitiveTypeKind::PTK_Float64);
                         ::Smp::Float64 p_measured;
                         /// Invoke ping
                         request->SetReturnValue({::Smp::PrimitiveTypeKind::PTK_Bool, component.ping(p_requested, &p_measured)});

                         ::TasMdk::Request::setParameter(request, "measured", {::Smp::PrimitiveTypeKind::PTK_Float64, p_measured});
                         };
                     }

                     if (handlers.find("get_connected") == handlers.end()) {
                         handlers["get_connected"] = [](_Type & component, ::Smp::IRequest* request) {
                             /// Invoke get_connected
                             request->SetReturnValue({::Smp::PrimitiveTypeKind::PTK_Bool, component.get_connected()});
                         };
                     }


                     if (handlers.find("set_connected") == handlers.end()) {
                         handlers["set_connected"] = [](_Type & component, ::Smp::IRequest* request) {
                             /// Invoke set_connected
                             ::Smp::Bool connected;
                             ::TasMdk::Request::initParameter(connected, request, "connected", ::Smp::PrimitiveTypeKind::PTK_Bool);
                             component.set_connected(connected);
                         };
                     }

        }
    } // namespace support
} // namespace demo

#endif // DEMO_SUPPORT_ROOTMODELGEN_H_
