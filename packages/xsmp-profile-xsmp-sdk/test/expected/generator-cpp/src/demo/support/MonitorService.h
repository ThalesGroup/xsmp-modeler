// -----------------------------------------------------------------------------
// File Name    : MonitorService.h
// -----------------------------------------------------------------------------
/// @file demo/support/MonitorService.h

#ifndef DEMO_SUPPORT_MONITORSERVICE_H_
#define DEMO_SUPPORT_MONITORSERVICE_H_

// Include the generated header file
#include <demo/support/MonitorServiceGen.h>

namespace demo::support
{
    class MonitorService: public MonitorServiceGen {
    public:
        /// Re-use parent constructor
        using MonitorServiceGen::MonitorServiceGen;

        /// Virtual destructor to release memory.
        ~MonitorService() noexcept override = default;

    private:
        // visibility to call DoPublish / DoConfigure / DoConnect / DoDisconnect
        friend class ::Xsmp::Component::Helper;

        /// Publish fields, operations and properties of the Service.
        /// @param receiver Publication receiver.
        void DoPublish(::Smp::IPublication* receiver);

        /// Perform any custom configuration of the Service.
        /// @param logger Logger to use for log messages during Configure().
        /// @param linkRegistry Link Registry to use for registration of
        ///         links created during Configure() or later.
        void DoConfigure(::Smp::Services::ILogger* logger, ::Smp::Services::ILinkRegistry* linkRegistry);

        /// Connect the Service to the simulator and its simulation
        /// services.
        /// @param simulator Simulation Environment that hosts the Service.
        void DoConnect(::Smp::ISimulator* simulator);

        /// Disconnect the Service from the simulator and all its
        /// simulation services.
        void DoDisconnect();

        void start() override;
    };
} // namespace demo::support

#endif // DEMO_SUPPORT_MONITORSERVICE_H_