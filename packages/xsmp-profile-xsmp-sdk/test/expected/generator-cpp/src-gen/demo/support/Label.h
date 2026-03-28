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
#include <Xsmp/String.h>

// ----------------------------------------------------------------------------
// --------------------------- Types and Interfaces ---------------------------
// ----------------------------------------------------------------------------

namespace demo::support
{
    using Label = ::Xsmp::String<32>;

    /// Universally unique identifier of type Label.
    inline constexpr ::Smp::Uuid Uuid_Label { 0x44444444U, 0x4444U, 0x4444U, 0x8444U, 0x444444444444U };

    void _Register_Label(::Smp::Publication::ITypeRegistry* registry);
} // namespace demo::support

#endif // DEMO_SUPPORT_LABEL_H_
