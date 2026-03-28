// -----------------------------------------------------------------------------
// File Name    : MonitorServiceGen.h
// -----------------------------------------------------------------------------
/// @file demo/support/MonitorServiceGen.h
// This file is auto-generated, Do not edit otherwise your changes will be lost

#ifndef DEMO_SUPPORT_MONITORSERVICEGEN_H_
#define DEMO_SUPPORT_MONITORSERVICEGEN_H_

// ----------------------------------------------------------------------------
// --------------------------- Forward Declarations ---------------------------
// ----------------------------------------------------------------------------

namespace demo::support
{
    class MonitorService;
} // namespace demo::support

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <functional>
#include <map>
#include <Smp/IComposite.h>
#include <Smp/IRequest.h>
#include <Smp/ISimulator.h>
#include <Smp/PrimitiveTypes.h>
#include <Smp/Publication/ITypeRegistry.h>
#include <string_view>
#include <Xsmp/Service.h>

// ----------------------------------------------------------------------------
// --------------------------- Types and Interfaces ---------------------------
// ----------------------------------------------------------------------------

namespace demo::support
{
    /// Universally unique identifier of type MonitorService.
    inline constexpr ::Smp::Uuid Uuid_MonitorService { 0xeeeeeeeeU, 0xeeeeU, 0x4eeeU, 0x8eeeU, 0xeeeeeeeeeeeeU };

    class MonitorServiceGen: public ::Xsmp::Service
    {
    friend class ::demo::support::MonitorService;
    public:
    /// Constructor setting name, description, parent and simulator.
    /// @param name Name of new Service instance.
    /// @param description Description of new Service instance.
    /// @param parent Parent of new Service instance.
    /// @param simulator The simulator instance.
    MonitorServiceGen(::Smp::String8 name,
            ::Smp::String8 description,
            ::Smp::IComposite* parent,
            ::Smp::ISimulator* simulator);
    /// deleted copy constructor
    MonitorServiceGen(const MonitorServiceGen&) = delete;
    /// deleted move constructor
    MonitorServiceGen(MonitorServiceGen&&) = delete;
    /// deleted copy assignment
    MonitorServiceGen& operator=(const MonitorServiceGen&) = delete;
    /// deleted move assignment
    MonitorServiceGen& operator=(MonitorServiceGen&&) = delete;

    /// Virtual destructor to release memory.
    ~MonitorServiceGen() override = default;

    /// Request the Service to publish its fields, properties and
    /// operations against the provided publication receiver.
    /// @param   receiver Publication receiver.
    /// @throws  Smp::InvalidComponentState
    void Publish(::Smp::IPublication* receiver) override;

    /// Request the Service to perform any custom configuration. The
    /// component can create and configure other components using the field
    /// values of its published fields.
    /// @param   logger Logger service for logging of error messages during
    ///          configuration.
    /// @param   linkRegistry Reference to the link registry services, so
    ///          that the Service can register links that it creates
    ///          during configuration.
    /// @throws  Smp::InvalidComponentState
    void Configure( ::Smp::Services::ILogger* logger, ::Smp::Services::ILinkRegistry* linkRegistry) override;

    /// Allow the Service to connect to the simulator and its simulation
    /// services.
    /// @param   simulator Simulation Environment that hosts the Service.
    /// @throws  Smp::InvalidComponentState
    void Connect( ::Smp::ISimulator* simulator) override;

    /// Ask the Service to disconnect from the simulator and all its
    /// simulation services.
    /// @throws  Smp::InvalidComponentState
    void Disconnect() override;

    /// Get Universally Unique Identifier of the Service.
    /// @return  Universally Unique Identifier of the Service.
    const ::Smp::Uuid& GetUuid() const override;

                private:
                static std::map<std::string_view, std::function<void(MonitorServiceGen*, ::Smp::IRequest*)>> _requestHandlers;

                public:
                    /// Dynamically invoke an operation using a request object that has
                    /// been created and filled with parameter values by the caller.
                    /// @param   request Request object to invoke.
                    /// @throws  Smp::InvalidOperationName
                    /// @throws  Smp::InvalidParameterCount
                    /// @throws  Smp::InvalidParameterType
                    void Invoke(::Smp::IRequest* request) override;


    private:
    /// Get Running.
    /// @return Current value of property Running.
    virtual ::Smp::Bool get_Running();
    /// Set Running.
    /// @param value New value of property Running to set.
    virtual void set_Running(::Smp::Bool value);
    virtual void start()=0;
    ::Smp::Bool running;
    };
} // namespace demo::support

#endif // DEMO_SUPPORT_MONITORSERVICEGEN_H_
