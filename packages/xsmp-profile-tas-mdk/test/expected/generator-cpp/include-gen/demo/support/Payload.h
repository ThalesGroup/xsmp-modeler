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
#include <TasMdk/Types/Structure.h>

// ----------------------------------------------------------------------------
// --------------------------- Types and Interfaces ---------------------------
// ----------------------------------------------------------------------------

namespace demo
{
    namespace support
    {
        struct Payload {
            static constexpr ::Smp::Bool DefaultEnabled{true};
            ::Smp::Bool enabled{false};
            ::demo::support::Counter count{0};


                        Payload() = default;
                        ~Payload() = default;
                        Payload(const Payload&) = default;
                        Payload(Payload&&) = default;
                        Payload(::Smp::Bool enabled, ::demo::support::Counter count):
                        enabled(enabled), count(count) {}
                        Payload& operator=(const Payload&) = default;
            static void _Register(::Smp::Publication::ITypeRegistry* registry);
        };

        /// Universally unique identifier of type Payload.
        constexpr ::Smp::Uuid Uuid_Payload { 0x88888888U, 0x8888U, 0x4888U, 0x8888U, 0x888888888888U };


                    template<bool ...Opts>
                    struct _Payload : public ::TasMdk::Types::StructureType<Opts...>
                    {
                        // the equivalent raw_type
                        using raw_type = ::demo::support::Payload;

                        // constructor
                        _Payload (const std::string& name, const std::string& description,
                                Smp::IObject *parent, Smp::ViewKind view,
                                const Smp::Publication::ITypeRegistry *type_registry, Smp::Uuid typeUuid,
                                const raw_type &default_value = raw_type{}) :
                                ::TasMdk::Types::StructureType<Opts...>(name, description, parent, view, type_registry->GetType(typeUuid)),
                               /// enabled initialization
        enabled{"enabled", "", this, view,  type_registry, ::Smp::Uuids::Uuid_Bool, default_value.enabled},
        /// count initialization
        count{"count", "", this, view,  type_registry, ::demo::support::Uuid_Counter, default_value.count} {
                        }

                        // copy operator
                        _Payload & operator=(const _Payload &other)
                        {
                            enabled = other.enabled;
        count = other.count;
                            return *this;
                        }

                        // copy operator from raw_type
                        _Payload & operator=(const raw_type &other)
                        {
                            enabled = other.enabled;
        count = other.count;
                            return *this;
                        }

                        // convert to raw_type
                        operator raw_type() const noexcept
                        {
                            return {enabled, count};
                        }
                         typename ::TasMdk::SimpleField<::Smp::Bool>::in<Opts...>::type enabled;
         typename ::TasMdk::SimpleField<::demo::support::Counter>::in<Opts...>::type count;
                    };
    } // namespace support
} // namespace demo

#endif // DEMO_SUPPORT_PAYLOAD_H_
