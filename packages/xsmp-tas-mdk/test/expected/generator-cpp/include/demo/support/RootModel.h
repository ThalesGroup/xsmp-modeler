// -----------------------------------------------------------------------------
// File Name    : RootModel.h
// -----------------------------------------------------------------------------
/// @file demo/support/RootModel.h

#ifndef XSMP_TYPE_4_demo_7_support_9_RootModel_H_
#define XSMP_TYPE_4_demo_7_support_9_RootModel_H_

// Include the generated header file
#include <demo/support/RootModelGen.h>

namespace demo
{
    namespace support
    {
        class RootModel: public RootModelGen {
        public:
            /// Constructor setting name, description and parent.
            /// @param name Name of new model instance.
            /// @param description Description of new model instance.
            /// @param parent Parent of new model instance.
            /// @param type_registry Reference to global type registry.
            RootModel(
                    ::Smp::String8 name,
                    ::Smp::String8 description,
                    ::Smp::IObject* parent,
                    ::Smp::Publication::ITypeRegistry* type_registry);

            /// Virtual destructor to release memory.
            ~RootModel() noexcept override = default;

            private:
            ::Smp::Bool ping(::demo::support::Ratio requested, ::Smp::Float64* measured) override;
            public:
            void _main() override;
            void _onTick(::Smp::IObject* sender, ::demo::support::Counter) override;
        };
    } // namespace support
} // namespace demo

#endif // XSMP_TYPE_4_demo_7_support_9_RootModel_H_