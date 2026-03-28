// -----------------------------------------------------------------------------
// File Name    : Payload.h
// -----------------------------------------------------------------------------
/// @file demo/support/Payload.h
// This file is auto-generated, Do not edit otherwise your changes will be lost

#ifndef DEMO_SUPPORT_PAYLOAD_H_
#define DEMO_SUPPORT_PAYLOAD_H_

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <demo/support/Counter.h>
#include <Smp/PrimitiveTypes.h>
#include <Smp/Publication/ITypeRegistry.h>

// ----------------------------------------------------------------------------
// --------------------------- Types and Interfaces ---------------------------
// ----------------------------------------------------------------------------

namespace demo::support
{
    struct Payload {
        static constexpr ::Smp::Bool DefaultEnabled{true};
        ::Smp::Bool enabled{false};
        ::demo::support::Counter count{0};

        static void _Register(::Smp::Publication::ITypeRegistry* registry);

        template<typename _BASE> struct _Field : public _BASE {
            _Field(::Smp::Publication::ITypeRegistry *typeRegistry, ::Smp::Uuid typeUuid,
                   ::Smp::String8 name, ::Smp::String8 description = "", ::Smp::IObject *parent = nullptr,
                   ::Smp::ViewKind view = ::Smp::ViewKind::VK_All, const ::demo::support::Payload &value = {}) :
                   _BASE(typeRegistry, typeUuid, name ,description, parent, view),
                   // Field enabled
                   enabled{
                       typeRegistry, // Type Registry
                       ::Smp::Uuids::Uuid_Bool, //Type UUID
                       "enabled", // Name
                       "", // Description
                       this, // Parent
                       view, // View Kind
                       value.enabled // Value
                   },
                   // Field count
                   count{
                       typeRegistry, // Type Registry
                       ::demo::support::Uuid_Counter, //Type UUID
                       "count", // Name
                       "", // Description
                       this, // Parent
                       view, // View Kind
                       value.count // Value
                   }
            {
            }
            _Field(const _Field&) = delete;
            _Field& operator = (const _Field&) = delete;

            // copy operator from ::demo::support::Payload
            _Field & operator=(const ::demo::support::Payload &other) {
                this->enabled = other.enabled;
                this->count = other.count;
                return *this;
            }

            // implicit convertion to ::demo::support::Payload
            operator ::demo::support::Payload() const noexcept {
                return {enabled, count};
            }

            // Fields declaration
            typename _BASE::template Field<::Smp::Bool> enabled;
            typename _BASE::template Field<::demo::support::Counter> count;
           };
    };

    /// Universally unique identifier of type Payload.
    inline constexpr ::Smp::Uuid Uuid_Payload { 0x88888888U, 0x8888U, 0x4888U, 0x8888U, 0x888888888888U };
} // namespace demo::support

#endif // DEMO_SUPPORT_PAYLOAD_H_
