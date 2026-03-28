// -----------------------------------------------------------------------------
// File Name    : Mode.cpp
// -----------------------------------------------------------------------------
/// @file demo/support/Mode.cpp
// This file is auto-generated, Do not edit otherwise your changes will be lost

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <demo/support/Mode.h>
#include <Smp/Publication/IEnumerationType.h>
#include <Smp/Version.h>


namespace demo
{
    namespace support
    {
        void _Register_Mode(::Smp::Publication::ITypeRegistry* registry) {
        auto *type = registry->AddEnumerationType(
            "Mode", // Name
            "", // Description
            #if ECSS_SMP_VERSION < 202503L
            ::demo::support::Uuid_Mode, // UUID
            sizeof(::demo::support::Mode) // Size
            #else
            ::demo::support::Uuid_Mode  // UUID
            #endif
            );

        // Register the Literals of the Enumeration
        type->AddLiteral("Off", "", static_cast<::Smp::Int32>(::demo::support::Mode::Off));
        type->AddLiteral("On", "", static_cast<::Smp::Int32>(::demo::support::Mode::On));
        }
    } // namespace support
} // namespace demo