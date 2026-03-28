// -----------------------------------------------------------------------------
// File Name    : Counter.h
// -----------------------------------------------------------------------------
/// @file demo/support/Counter.h
// This file is auto-generated, Do not edit otherwise your changes will be lost

#ifndef DEMO_SUPPORT_COUNTER_H_
#define DEMO_SUPPORT_COUNTER_H_

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <Smp/PrimitiveTypes.h>
#include <Smp/Publication/ITypeRegistry.h>

// ----------------------------------------------------------------------------
// --------------------------- Types and Interfaces ---------------------------
// ----------------------------------------------------------------------------

namespace demo
{
    namespace support
    {
        /// Universally unique identifier of type Counter.
        constexpr ::Smp::Uuid Uuid_Counter { 0x22222222U, 0x2222U, 0x4222U, 0x8222U, 0x222222222222U };
        using Counter  = ::Smp::Int32;
        void _Register_Counter(::Smp::Publication::ITypeRegistry* registry);
    } // namespace support
} // namespace demo

#endif // DEMO_SUPPORT_COUNTER_H_
