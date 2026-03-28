// -----------------------------------------------------------------------------
// File Name    : CounterArray.cpp
// -----------------------------------------------------------------------------
/// @file demo/support/CounterArray.cpp
// This file is auto-generated, Do not edit otherwise your changes will be lost

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <demo/support/CounterArray.h>
#include <Smp/Publication/IArrayType.h>


namespace demo::support
{
    void _Register_CounterArray(::Smp::Publication::ITypeRegistry* registry) {
        registry->AddArrayType(
            "CounterArray", // Name
            "", // Description
            ::demo::support::Uuid_CounterArray, // UUID
            ::demo::support::Uuid_Counter, // Item Type UUID
            sizeof(::demo::support::Counter), // Item Type size
            3, // Number of elements
            false // Simple array
        );
    }
} // namespace demo::support