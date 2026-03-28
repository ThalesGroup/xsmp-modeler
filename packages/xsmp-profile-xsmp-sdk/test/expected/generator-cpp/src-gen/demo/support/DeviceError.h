// -----------------------------------------------------------------------------
// File Name    : DeviceError.h
// -----------------------------------------------------------------------------
/// @file demo/support/DeviceError.h
// This file is auto-generated, Do not edit otherwise your changes will be lost

#ifndef DEMO_SUPPORT_DEVICEERROR_H_
#define DEMO_SUPPORT_DEVICEERROR_H_

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <Smp/Publication/ITypeRegistry.h>

// ----------------------------------------------------------------------------
// --------------------------- Types and Interfaces ---------------------------
// ----------------------------------------------------------------------------

namespace demo::support
{

    class DeviceError: public ::Smp::Exception
    {

    public:
        static void _Register(::Smp::Publication::ITypeRegistry* registry);

        //«IF constructor»DeviceError () = default;«ENDIF»
        //«IF destructor»~DeviceError () noexcept = default;«ENDIF»
        //DeviceError (const DeviceError &) = default;


    };

    /// Universally unique identifier of type DeviceError.
    inline constexpr ::Smp::Uuid Uuid_DeviceError { 0xaaaaaaaaU, 0xaaaaU, 0x4aaaU, 0x8aaaU, 0xaaaaaaaaaaaaU };
} // namespace demo::support

#endif // DEMO_SUPPORT_DEVICEERROR_H_
