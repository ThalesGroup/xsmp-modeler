// -----------------------------------------------------------------------------
// File Name    : IDeviceGen.h
// -----------------------------------------------------------------------------
/// @file demo/support/IDeviceGen.h
// This file is auto-generated, Do not edit otherwise your changes will be lost

#ifndef DEMO_SUPPORT_IDEVICEGEN_H_
#define DEMO_SUPPORT_IDEVICEGEN_H_

// ----------------------------------------------------------------------------
// --------------------------- Forward Declarations ---------------------------
// ----------------------------------------------------------------------------

namespace demo::support
{
    class IDevice;
} // namespace demo::support

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <demo/support/Ratio.h>
#include <Smp/PrimitiveTypes.h>
#include <Smp/Uuid.h>

// ----------------------------------------------------------------------------
// --------------------------- Types and Interfaces ---------------------------
// ----------------------------------------------------------------------------

namespace demo::support
{
    class IDeviceGen {
        public:
        virtual ~IDeviceGen () = default;
        static constexpr ::Smp::Bool Ready{false};
        /// Get connected.
        /// @return Current value of property connected.
        virtual ::Smp::Bool get_connected()=0;
        /// Set connected.
        /// @param value New value of property connected to set.
        virtual void set_connected(::Smp::Bool value)=0;
        virtual ::Smp::Bool ping(::demo::support::Ratio requested, ::Smp::Float64* measured)=0;
    };

    /// Universally unique identifier of type IDevice.
    inline constexpr ::Smp::Uuid Uuid_IDevice { 0xbbbbbbbbU, 0xbbbbU, 0x4bbbU, 0x8bbbU, 0xbbbbbbbbbbbbU };
} // namespace demo::support

#endif // DEMO_SUPPORT_IDEVICEGEN_H_
