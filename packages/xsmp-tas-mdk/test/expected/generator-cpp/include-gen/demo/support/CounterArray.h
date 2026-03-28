// -----------------------------------------------------------------------------
// File Name    : CounterArray.h
// -----------------------------------------------------------------------------
/// @file demo/support/CounterArray.h
// This file is auto-generated, Do not edit otherwise your changes will be lost

#ifndef DEMO_SUPPORT_COUNTERARRAY_H_
#define DEMO_SUPPORT_COUNTERARRAY_H_

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <demo/support/Counter.h>
#include <Smp/Publication/ITypeRegistry.h>
#include <TasMdk/Types/Array.h>

// ----------------------------------------------------------------------------
// --------------------------- Types and Interfaces ---------------------------
// ----------------------------------------------------------------------------

namespace demo
{
    namespace support
    {
        using CounterArray = ::TasMdk::Types::Array<::demo::support::Counter, 3>;

        /// Universally unique identifier of type CounterArray.
        constexpr ::Smp::Uuid Uuid_CounterArray { 0x66666666U, 0x6666U, 0x4666U, 0x8666U, 0x666666666666U };

        void _Register_CounterArray(::Smp::Publication::ITypeRegistry* registry);

        template<bool ...Opts>
        using _CounterArray = TasMdk::Types::SimpleArrayType<::demo::support::Counter, 3, Opts...>;
    } // namespace support
} // namespace demo

#endif // DEMO_SUPPORT_COUNTERARRAY_H_
