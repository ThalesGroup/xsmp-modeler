// -----------------------------------------------------------------------------
// File Name    : Label.h
// -----------------------------------------------------------------------------
/// @file demo/support/Label.h
// This file is auto-generated, Do not edit otherwise your changes will be lost

#ifndef DEMO_SUPPORT_LABEL_H_
#define DEMO_SUPPORT_LABEL_H_

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <Smp/Publication/ITypeRegistry.h>
#include <TasMdk/Types/String.h>

// ----------------------------------------------------------------------------
// --------------------------- Types and Interfaces ---------------------------
// ----------------------------------------------------------------------------

namespace demo
{
    namespace support
    {
        using Label = ::TasMdk::Types::String<32>;

        /// Universally unique identifier of type Label.
        constexpr ::Smp::Uuid Uuid_Label { 0x44444444U, 0x4444U, 0x4444U, 0x8444U, 0x444444444444U };

        void _Register_Label(::Smp::Publication::ITypeRegistry* registry);
    } // namespace support
} // namespace demo

#endif // DEMO_SUPPORT_LABEL_H_
