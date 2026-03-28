// -----------------------------------------------------------------------------
// File Name    : MonitorService.cpp
// -----------------------------------------------------------------------------
/// @file demo/support/MonitorService.cpp

#include <demo/support/MonitorService.h>

namespace demo
{
    namespace support
    {
        MonitorService::MonitorService(
                ::Smp::String8 name,
                ::Smp::String8 description,
                ::Smp::IObject* parent,
                ::Smp::Publication::ITypeRegistry* type_registry)
                : MonitorServiceGen::MonitorServiceGen(name, description, parent, type_registry) {
            // Publish_Callback = std::bind(&MonitorService::_publishHook, this, std::placeholders::_1);

            // Configure_Callback = std::bind(&MonitorService::_configureHook, this, std::placeholders::_1, std::placeholders::_2);

            // Connect_Callback = std::bind(&MonitorService::_connectHook, this, std::placeholders::_1);

            // Disconnect_Callback = std::bind(&MonitorService::_disconnectHook, this);
        }

        void MonitorService::start() {
                            // TODO

                        }

    } // namespace support
} // namespace demo