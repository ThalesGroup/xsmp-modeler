// -----------------------------------------------------------------------------
// File Name    : DeviceBase.h
// -----------------------------------------------------------------------------
/// @file demo/support/DeviceBase.h
// This file is auto-generated, Do not edit otherwise your changes will be lost

#ifndef DEMO_SUPPORT_DEVICEBASE_H_
#define DEMO_SUPPORT_DEVICEBASE_H_

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

        class DeviceBase
        {

        public:
            static void _Register(::Smp::Publication::ITypeRegistry* registry);

            //«IF constructor»DeviceBase () = default;«ENDIF»
            //«IF destructor»~DeviceBase () noexcept = default;«ENDIF»
            //DeviceBase (const DeviceBase &) = default;

           private:
           static constexpr ::Smp::Bool HasState{true};
           /// Get Active.
           /// @return Current value of property Active.
           ::Smp::Bool get_Active();
           /// Set Active.
           /// @param value New value of property Active to set.
           void set_Active(::Smp::Bool value);
           void reset();
           ::Smp::Bool active{false};
        };

        /// Universally unique identifier of type DeviceBase.
        constexpr ::Smp::Uuid Uuid_DeviceBase { 0x99999999U, 0x9999U, 0x4999U, 0x8999U, 0x999999999999U };
    } // namespace support
} // namespace demo

#endif // DEMO_SUPPORT_DEVICEBASE_H_
