// -----------------------------------------------------------------------------
// File Name    : RootModel.h
// -----------------------------------------------------------------------------
/// @file demo/support/RootModel.h

#ifndef DEMO_SUPPORT_ROOTMODEL_H_
#define DEMO_SUPPORT_ROOTMODEL_H_

// Include the generated header file
#include <demo/support/RootModelGen.h>

namespace demo::support
{
    class RootModel: public RootModelGen {
    public:
        /// Re-use parent constructor
        using RootModelGen::RootModelGen;

        /// Virtual destructor to release memory.
        ~RootModel() noexcept override = default;

    private:
        // visibility to call DoPublish / DoConfigure / DoConnect / DoDisconnect
        friend class ::Xsmp::Component::Helper;

        /// Publish fields, operations and properties of the Model.
        /// @param receiver Publication receiver.
        void DoPublish(::Smp::IPublication* receiver);

        /// Perform any custom configuration of the Model.
        /// @param logger Logger to use for log messages during Configure().
        /// @param linkRegistry Link Registry to use for registration of
        ///         links created during Configure() or later.
        void DoConfigure(::Smp::Services::ILogger* logger, ::Smp::Services::ILinkRegistry* linkRegistry);

        /// Connect the Model to the simulator and its simulation
        /// services.
        /// @param simulator Simulation Environment that hosts the Model.
        void DoConnect(::Smp::ISimulator* simulator);

        /// Disconnect the Model from the simulator and all its
        /// simulation services.
        void DoDisconnect();

        ::Smp::Bool ping(::demo::support::Ratio requested, ::Smp::Float64* measured) override;
        public:
        void _main() override;
        void _onTick(::Smp::IObject* sender, ::demo::support::Counter) override;
    };
} // namespace demo::support

#endif // DEMO_SUPPORT_ROOTMODEL_H_