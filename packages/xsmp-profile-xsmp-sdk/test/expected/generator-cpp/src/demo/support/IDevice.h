// -----------------------------------------------------------------------------
// File Name    : IDevice.h
// -----------------------------------------------------------------------------
/// @file demo/support/IDevice.h

#ifndef DEMO_SUPPORT_IDEVICE_H_
#define DEMO_SUPPORT_IDEVICE_H_

// Include the generated header file
#include <demo/support/IDeviceGen.h>

namespace demo::support
{
    class IDevice: public IDeviceGen {
    public:
        ~IDevice() override = default;
    };
} // namespace demo::support

#endif // DEMO_SUPPORT_IDEVICE_H_