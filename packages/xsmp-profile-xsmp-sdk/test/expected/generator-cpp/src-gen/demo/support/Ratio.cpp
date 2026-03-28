// -----------------------------------------------------------------------------
// File Name    : Ratio.cpp
// -----------------------------------------------------------------------------
/// @file demo/support/Ratio.cpp
// This file is auto-generated, Do not edit otherwise your changes will be lost

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <demo/support/Ratio.h>
#include <limits>


namespace demo::support
{
        void _Register_Ratio(::Smp::Publication::ITypeRegistry* registry) {
        registry->AddFloatType(
            "Ratio", // Name
            "", // Description
            ::demo::support::Uuid_Ratio, // UUID
            std::numeric_limits<::Smp::Float64>::lowest(), // Minimum
            std::numeric_limits<::Smp::Float64>::max(), // Maximum
            true, // Minimum inclusive
            true, // Maximum inclusive
            "", // Unit
            ::Smp::PrimitiveTypeKind::PTK_Float64 // Primitive Type Kind
        );
    }
} // namespace demo::support