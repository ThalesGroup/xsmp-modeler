// -----------------------------------------------------------------------------
// File Name    : Ratio.h
// -----------------------------------------------------------------------------
/// @file demo/support/Ratio.h
// This file is auto-generated, Do not edit otherwise your changes will be lost

#ifndef DEMO_SUPPORT_RATIO_H_
#define DEMO_SUPPORT_RATIO_H_

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
        /// Universally unique identifier of type Ratio.
        constexpr ::Smp::Uuid Uuid_Ratio { 0x33333333U, 0x3333U, 0x4333U, 0x8333U, 0x333333333333U };
        using Ratio  = ::Smp::Float64;
        void _Register_Ratio(::Smp::Publication::ITypeRegistry* registry);
    } // namespace support
} // namespace demo

#endif // DEMO_SUPPORT_RATIO_H_
