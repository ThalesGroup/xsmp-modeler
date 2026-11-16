// -----------------------------------------------------------------------------
// File Name    : IDevice.h
// -----------------------------------------------------------------------------
/// @file demo/support/IDevice.h

#ifndef XSMP_TYPE_4_demo_7_support_7_IDevice_H_
#define XSMP_TYPE_4_demo_7_support_7_IDevice_H_

// Include the generated header file
#include <demo/support/IDeviceGen.h>

namespace demo
{
    namespace support
    {
        class IDevice: public IDeviceGen {
        public:
            ~IDevice() override = default;
        };
    } // namespace support
} // namespace demo

#endif // XSMP_TYPE_4_demo_7_support_7_IDevice_H_