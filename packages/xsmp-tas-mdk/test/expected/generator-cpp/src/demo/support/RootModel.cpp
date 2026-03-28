// -----------------------------------------------------------------------------
// File Name    : RootModel.cpp
// -----------------------------------------------------------------------------
/// @file demo/support/RootModel.cpp

#include <demo/support/RootModel.h>

namespace demo
{
    namespace support
    {
        RootModel::RootModel(
                ::Smp::String8 name,
                ::Smp::String8 description,
                ::Smp::IObject* parent,
                ::Smp::Publication::ITypeRegistry* type_registry)
                : RootModelGen::RootModelGen(name, description, parent, type_registry) {
            // Publish_Callback = std::bind(&RootModel::_publishHook, this, std::placeholders::_1);

            // Configure_Callback = std::bind(&RootModel::_configureHook, this, std::placeholders::_1, std::placeholders::_2);

            // Connect_Callback = std::bind(&RootModel::_connectHook, this, std::placeholders::_1);

            // Disconnect_Callback = std::bind(&RootModel::_disconnectHook, this);
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

    } // namespace support
} // namespace demo