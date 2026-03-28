// -----------------------------------------------------------------------------
// File Name    : ChildModel.h
// -----------------------------------------------------------------------------
/// @file demo/support/ChildModel.h

#ifndef DEMO_SUPPORT_CHILDMODEL_H_
#define DEMO_SUPPORT_CHILDMODEL_H_

// Include the generated header file
#include <demo/support/ChildModelGen.h>

namespace demo
{
    namespace support
    {
        class ChildModel: public ChildModelGen {
        public:
            /// Constructor setting name, description and parent.
            /// @param name Name of new model instance.
            /// @param description Description of new model instance.
            /// @param parent Parent of new model instance.
            /// @param type_registry Reference to global type registry.
            ChildModel(
                    ::Smp::String8 name,
                    ::Smp::String8 description,
                    ::Smp::IObject* parent,
                    ::Smp::Publication::ITypeRegistry* type_registry);

            /// Virtual destructor to release memory.
            ~ChildModel() noexcept override = default;


        };
    } // namespace support
} // namespace demo

#endif // DEMO_SUPPORT_CHILDMODEL_H_