// -----------------------------------------------------------------------------
// File Name    : LabelRef.h
// -----------------------------------------------------------------------------
/// @file demo/support/LabelRef.h
// This file is auto-generated, Do not edit otherwise your changes will be lost

#ifndef DEMO_SUPPORT_LABELREF_H_
#define DEMO_SUPPORT_LABELREF_H_

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <demo/support/Label.h>

// ----------------------------------------------------------------------------
// --------------------------- Types and Interfaces ---------------------------
// ----------------------------------------------------------------------------

namespace demo
{
    namespace support
    {
        using LabelRef = ::demo::support::Label *;

        /// Universally unique identifier of type LabelRef.
        constexpr ::Smp::Uuid Uuid_LabelRef { 0x55555555U, 0x5555U, 0x4555U, 0x8555U, 0x555555555555U };
    } // namespace support
} // namespace demo

#endif // DEMO_SUPPORT_LABELREF_H_
