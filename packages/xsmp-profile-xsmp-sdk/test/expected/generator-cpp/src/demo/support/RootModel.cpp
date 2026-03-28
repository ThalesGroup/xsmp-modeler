// -----------------------------------------------------------------------------
// File Name    : RootModel.cpp
// -----------------------------------------------------------------------------
/// @file demo/support/RootModel.cpp

#include <demo/support/RootModel.h>

namespace demo::support
{
    void RootModel::DoPublish( ::Smp::IPublication* receiver) {
    }

    void RootModel::DoConfigure(::Smp::Services::ILogger* logger, ::Smp::Services::ILinkRegistry* linkRegistry) {
    }

    void RootModel::DoConnect(::Smp::ISimulator* simulator) {
    }

    void RootModel::DoDisconnect() {
    }
    void RootModel::_main() {
        // TODO implement EntryPoint main

    }
    void RootModel::_onTick(::Smp::IObject* sender, ::demo::support::Counter) {
        // TODO implement EventSink onTick

    }
    ::Smp::Bool RootModel::ping(::demo::support::Ratio requested, ::Smp::Float64* measured) {
                        // TODO
                        return false;
                    }

} // namespace demo::support