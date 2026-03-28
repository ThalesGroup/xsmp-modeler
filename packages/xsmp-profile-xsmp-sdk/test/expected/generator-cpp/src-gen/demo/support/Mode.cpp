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


namespace demo::support
{
    void _Register_Mode(::Smp::Publication::ITypeRegistry* registry) {
    auto *type = registry->AddEnumerationType(
        "Mode", // Name
        "", // Description
        ::demo::support::Uuid_Mode, // UUID
        sizeof(::demo::support::Mode) // Size
        );

    // Register the Literals of the Enumeration
    type->AddLiteral("Off", "", static_cast<::Smp::Int32>(::demo::support::Mode::Off));
    type->AddLiteral("On", "", static_cast<::Smp::Int32>(::demo::support::Mode::On));
    }
} // namespace demo::support