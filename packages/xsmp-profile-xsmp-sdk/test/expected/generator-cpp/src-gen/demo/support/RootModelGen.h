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

namespace demo::support
{
    class RootModel;
} // namespace demo::support

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
#include <map>
#include <Smp/IComposite.h>
#include <Smp/IRequest.h>
#include <Smp/ISimulator.h>
#include <Smp/PrimitiveTypes.h>
#include <Smp/Publication/ITypeRegistry.h>
#include <string_view>
#include <Xsmp/Aggregate.h>
#include <Xsmp/Composite.h>
#include <Xsmp/Container.h>
#include <Xsmp/EntryPoint.h>
#include <Xsmp/EntryPointPublisher.h>
#include <Xsmp/EventConsumer.h>
#include <Xsmp/EventProvider.h>
#include <Xsmp/EventSink.h>
#include <Xsmp/EventSource.h>
#include <Xsmp/Model.h>
#include <Xsmp/Reference.h>

// ----------------------------------------------------------------------------
// --------------------------- Types and Interfaces ---------------------------
// ----------------------------------------------------------------------------

namespace demo::support
{
    /// Universally unique identifier of type RootModel.
    inline constexpr ::Smp::Uuid Uuid_RootModel { 0x12121212U, 0x1212U, 0x4212U, 0x8212U, 0x121212121212U };

    class RootModelGen: public ::Xsmp::Model, public virtual ::demo::support::IDevice, public virtual ::Xsmp::Composite, public virtual ::Xsmp::Aggregate, public virtual ::Xsmp::EventProvider, public virtual ::Xsmp::EventConsumer, public virtual ::Xsmp::EntryPointPublisher
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
                static std::map<std::string_view, std::function<void(RootModelGen*, ::Smp::IRequest*)>> _requestHandlers;

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
    ::Xsmp::EntryPoint main;
    virtual void _main() = 0;
    ::Xsmp::EventSink<::demo::support::Counter> onTick;
    virtual void _onTick(::Smp::IObject* sender, ::demo::support::Counter) = 0;
    ::Xsmp::EventSource<> onDone;
    private:
    ::demo::support::Label name;
    ::demo::support::CounterArray counters;
    ::demo::support::Payload payload;
    ::Smp::Bool connectedState;
    public:
    ::Xsmp::Container<::Smp::IComposite> child;
    ::Xsmp::Reference<::demo::support::IDevice> deviceRef;
    ::Xsmp::Reference<::demo::support::ChildModel> childRef;
    };
} // namespace demo::support

#endif // DEMO_SUPPORT_ROOTMODELGEN_H_
