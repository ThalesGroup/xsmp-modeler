// -----------------------------------------------------------------------------
// File Name    : Counter.cpp
// -----------------------------------------------------------------------------
/// @file demo/support/Counter.cpp
// This file is auto-generated, Do not edit otherwise your changes will be lost

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <demo/support/Counter.h>
#include <limits>


namespace demo::support
{
    void _Register_Counter(::Smp::Publication::ITypeRegistry* registry) {
        registry->AddIntegerType(
            "Counter", // Name
            "", // Description
            ::demo::support::Uuid_Counter, // UUID
            std::numeric_limits<::Smp::Int32>::min(), // Minimum
            std::numeric_limits<::Smp::Int32>::max(), // Maximum
            "", // Unit
            ::Smp::PrimitiveTypeKind::PTK_Int32 // Primitive Type Kind
        );
    }
} // namespace demo::support