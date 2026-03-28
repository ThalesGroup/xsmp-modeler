// -----------------------------------------------------------------------------
// File Name    : ChildModel.cpp
// -----------------------------------------------------------------------------
/// @file demo/support/ChildModel.cpp

#include <demo/support/ChildModel.h>

namespace demo
{
    namespace support
    {
        ChildModel::ChildModel(
                ::Smp::String8 name,
                ::Smp::String8 description,
                ::Smp::IObject* parent,
                ::Smp::Publication::ITypeRegistry* type_registry)
                : ChildModelGen::ChildModelGen(name, description, parent, type_registry) {
            // Publish_Callback = std::bind(&ChildModel::_publishHook, this, std::placeholders::_1);

            // Configure_Callback = std::bind(&ChildModel::_configureHook, this, std::placeholders::_1, std::placeholders::_2);

            // Connect_Callback = std::bind(&ChildModel::_connectHook, this, std::placeholders::_1);

            // Disconnect_Callback = std::bind(&ChildModel::_disconnectHook, this);
        }


    } // namespace support
} // namespace demo