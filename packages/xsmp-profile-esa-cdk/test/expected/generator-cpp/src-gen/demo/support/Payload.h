// -----------------------------------------------------------------------------
// File Name    : Payload.h
// -----------------------------------------------------------------------------
/// @file demo/support/Payload.h
// This file is auto-generated, Do not edit otherwise your changes will be lost

#ifndef DEMO_SUPPORT_PAYLOAD_H_
#define DEMO_SUPPORT_PAYLOAD_H_

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <demo/support/Counter.h>
#include <Smp/PrimitiveTypes.h>
#include <Smp/Publication/ITypeRegistry.h>

// ----------------------------------------------------------------------------
// --------------------------- Types and Interfaces ---------------------------
// ----------------------------------------------------------------------------

namespace demo
{
    namespace support
    {
        struct Payload
        {
           static constexpr ::Smp::Bool DefaultEnabled{true};
           ::Smp::Bool enabled{false};
           ::demo::support::Counter count{0};

            static void _Register(::Smp::Publication::ITypeRegistry* registry);
        };

        /// Universally unique identifier of type Payload.
        constexpr ::Smp::Uuid Uuid_Payload { 0x88888888U, 0x8888U, 0x4888U, 0x8888U, 0x888888888888U };
    } // namespace support
} // namespace demo

#endif // DEMO_SUPPORT_PAYLOAD_H_
