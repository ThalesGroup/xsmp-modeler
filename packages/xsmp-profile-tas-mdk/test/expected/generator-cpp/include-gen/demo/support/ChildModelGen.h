// -----------------------------------------------------------------------------
// File Name    : ChildModelGen.h
// -----------------------------------------------------------------------------
/// @file demo/support/ChildModelGen.h
// This file is auto-generated, Do not edit otherwise your changes will be lost

#ifndef DEMO_SUPPORT_CHILDMODELGEN_H_
#define DEMO_SUPPORT_CHILDMODELGEN_H_

// ----------------------------------------------------------------------------
// --------------------------- Forward Declarations ---------------------------
// ----------------------------------------------------------------------------

namespace demo
{
    namespace support
    {
        class ChildModel;
    } // namespace support
} // namespace demo

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <functional>
#include <Smp/ISimulator.h>
#include <Smp/PrimitiveTypes.h>
#include <Smp/Publication/ITypeRegistry.h>
#include <type_traits>

// ----------------------------------------------------------------------------
// --------------------------- Types and Interfaces ---------------------------
// ----------------------------------------------------------------------------

namespace demo
{
    namespace support
    {
                 /// Universally unique identifier of type ChildModel.
                 constexpr ::Smp::Uuid Uuid_ChildModel { 0xffffffffU, 0xffffU, 0x4fffU, 0x8fffU, 0xffffffffffffU };

                 class ChildModelGen: public ::TasMdk::Model
                 {
                 friend class ::demo::support::ChildModel;

                 ::Smp::Bool childState;

                 // ------------------------------------------------------------------------------------
                 // ------------------------- Constructors/Destructor -------------------------
                 // ------------------------------------------------------------------------------------
                 public:
                     /// Constructor setting name, description and parent.
                     /// @param name Name of new model instance.
                     /// @param description Description of new model instance.
                     /// @param parent Parent of new model instance.
                     /// @param type_registry Reference to global type registry.
                     ChildModelGen(
                             ::Smp::String8 name,
                             ::Smp::String8 description,
                             ::Smp::IObject* parent,
                             ::Smp::Publication::ITypeRegistry* type_registry);


                     /// Virtual destructor to release memory.
                     ~ChildModelGen() override;

                     static ::TasMdk::Request::Handler<ChildModelGen>::CollectionType requestHandlers;

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
        void ChildModelGen::PopulateRequestHandlers(
            [[maybe_unused]] _Type* bluePrint,
            [[maybe_unused]] typename ::TasMdk::Request::Handler<_Type>::CollectionType& handlers)
        {


        }
    } // namespace support
} // namespace demo

#endif // DEMO_SUPPORT_CHILDMODELGEN_H_
