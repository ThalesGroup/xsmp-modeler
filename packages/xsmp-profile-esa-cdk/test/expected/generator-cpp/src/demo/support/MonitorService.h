// -----------------------------------------------------------------------------
// File Name    : MonitorService.h
// -----------------------------------------------------------------------------
/// @file demo/support/MonitorService.h

#ifndef DEMO_SUPPORT_MONITORSERVICE_H_
#define DEMO_SUPPORT_MONITORSERVICE_H_

// Include the generated header file
#include <demo/support/MonitorServiceGen.h>

namespace demo
{
    namespace support
    {
        class MonitorService: public MonitorServiceGen {
        public:
            /// Constructor setting name, description and parent.
            /// @param name Name of new model instance.
            /// @param description Description of new model instance.
            /// @param parent Parent of new model instance.
            /// @param type_registry Reference to global type registry.
            MonitorService(
                    ::Smp::String8 name,
                    ::Smp::String8 description,
                    ::Smp::IObject* parent,
                    ::Smp::Publication::ITypeRegistry* type_registry);

            /// Virtual destructor to release memory.
            ~MonitorService() noexcept override = default;

            private:
            void start() override;
        };
    } // namespace support
} // namespace demo

#endif // DEMO_SUPPORT_MONITORSERVICE_H_