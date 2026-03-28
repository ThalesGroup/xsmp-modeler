// -----------------------------------------------------------------------------
// File Name    : Payload.cpp
// -----------------------------------------------------------------------------
/// @file demo/support/Payload.cpp
// This file is auto-generated, Do not edit otherwise your changes will be lost

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <cstddef>
#include <demo/support/Payload.h>
#include <Smp/Publication/IStructureType.h>


namespace demo::support
{

    void Payload::_Register(::Smp::Publication::ITypeRegistry* registry)
    {
            auto *type = registry->AddStructureType(
            "Payload", // Name
            "", // Description
            ::demo::support::Uuid_Payload // UUID
            );

        // Register the Fields of the Class
        type->AddField(
                            "enabled", // Name
                            "", // Description
                            ::Smp::Uuids::Uuid_Bool, // Type UUID
                            offsetof(Payload, enabled), // Field offset
                            ::Smp::ViewKind::VK_All, // View Kind
                            true, // State
                            false, // Input
                            false // Output
                            );
                        type->AddField(
                            "count", // Name
                            "", // Description
                            ::demo::support::Uuid_Counter, // Type UUID
                            offsetof(Payload, count), // Field offset
                            ::Smp::ViewKind::VK_All, // View Kind
                            true, // State
                            false, // Input
                            false // Output
                            );

    }

} // namespace demo::support