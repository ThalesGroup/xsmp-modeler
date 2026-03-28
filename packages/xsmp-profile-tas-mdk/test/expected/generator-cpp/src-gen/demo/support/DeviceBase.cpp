// -----------------------------------------------------------------------------
// File Name    : DeviceBase.cpp
// -----------------------------------------------------------------------------
/// @file demo/support/DeviceBase.cpp
// This file is auto-generated, Do not edit otherwise your changes will be lost

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <cstddef>
#include <demo/support/DeviceBase.h>
#include <Smp/Publication/IClassType.h>
#include <Smp/Publication/IPublishOperation.h>


namespace demo
{
    namespace support
    {
        constexpr ::Smp::Bool DeviceBase::HasState;
        ::Smp::Bool DeviceBase::get_Active(){
            return this->active;
        }
        void DeviceBase::set_Active(::Smp::Bool value) {
            this->active = value;
        }
        void DeviceBase::_Register(::Smp::Publication::ITypeRegistry* registry)
        {
            auto *type = registry->AddClassType(
                "DeviceBase", // Name
                "", // Description
                ::demo::support::Uuid_DeviceBase, // UUID
                ::Smp::Uuids::Uuid_Void // Base Class UUID
                );

            // Register the Fields of the Class

                              type->AddField(
                                "active", // Name
                                "", // Description
                                ::Smp::Uuids::Uuid_Bool, // Type UUID
                                offsetof(DeviceBase, active), // Field offset
                                ::Smp::ViewKind::VK_All, // View Kind
                                true, // State
                                false, // Input
                                false // Output
                                );

        }

    } // namespace support
} // namespace demo