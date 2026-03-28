// -----------------------------------------------------------------------------
// File Name    : DeviceError.cpp
// -----------------------------------------------------------------------------
/// @file demo/support/DeviceError.cpp
// This file is auto-generated, Do not edit otherwise your changes will be lost

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <cstddef>
#include <demo/support/DeviceError.h>
#include <Smp/Publication/IClassType.h>


namespace demo
{
    namespace support
    {

        void DeviceError::_Register(::Smp::Publication::ITypeRegistry* registry)
        {
            registry->AddClassType(
                "DeviceError", // Name
                "", // Description
                ::demo::support::Uuid_DeviceError, // UUID
                ::Smp::Uuids::Uuid_Void // Base Class UUID
                );



        }

    } // namespace support
} // namespace demo