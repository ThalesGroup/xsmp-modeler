// -----------------------------------------------------------------------------
// File Name    : Label.cpp
// -----------------------------------------------------------------------------
/// @file demo/support/Label.cpp
// This file is auto-generated, Do not edit otherwise your changes will be lost

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <demo/support/Label.h>
#include <Smp/Publication/IType.h>


namespace demo
{
    namespace support
    {
        void _Register_Label(::Smp::Publication::ITypeRegistry* registry) {
            registry->AddStringType(
                "Label", // Name
                "", // Description
                ::demo::support::Uuid_Label, // UUID
                32 // Length
                );
        }
    } // namespace support
} // namespace demo