// -----------------------------------------------------------------------------
// File Name    : ChildModelGen.h
// -----------------------------------------------------------------------------
/// @file demo/support/ChildModelGen.h
// This file is auto-generated, Do not edit otherwise your changes will be lost

#ifndef DEMO_SUPPORT_CHILDMODELGEN_H_
#define DEMO_SUPPORT_CHILDMODELGEN_H_

// ----------------------------------------------------------------------------
// --------------------------- Forward Declarations ---------------------------
// ----------------------------------------------------------------------------

namespace demo
{
    namespace support
    {
        class ChildModel;
    } // namespace support
} // namespace demo

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <esa/ecss/smp/cdk/Model.h>
#include <Smp/IComposite.h>
#include <Smp/ISimulator.h>
#include <Smp/PrimitiveTypes.h>
#include <Smp/Publication/ITypeRegistry.h>

// ----------------------------------------------------------------------------
// --------------------------- Types and Interfaces ---------------------------
// ----------------------------------------------------------------------------

namespace demo
{
    namespace support
    {
        /// Universally unique identifier of type ChildModel.
        constexpr ::Smp::Uuid Uuid_ChildModel { 0xffffffffU, 0xffffU, 0x4fffU, 0x8fffU, 0xffffffffffffU };

        class ChildModelGen: public ::esa::ecss::smp::cdk::Model
        {
        friend class ::demo::support::ChildModel;
        public:
        /// Constructor setting name, description, parent and simulator.
        /// @param name Name of new Model instance.
        /// @param description Description of new Model instance.
        /// @param parent Parent of new Model instance.
        /// @param simulator The simulator instance.
        ChildModelGen(::Smp::String8 name,
                ::Smp::String8 description,
                ::Smp::IComposite* parent,
                ::Smp::ISimulator* simulator);
        /// deleted copy constructor
        ChildModelGen(const ChildModelGen&) = delete;
        /// deleted move constructor
        ChildModelGen(ChildModelGen&&) = delete;
        /// deleted copy assignment
        ChildModelGen& operator=(const ChildModelGen&) = delete;
        /// deleted move assignment
        ChildModelGen& operator=(ChildModelGen&&) = delete;

        /// Virtual destructor to release memory.
        ~ChildModelGen() override = default;

        /// Request the Model to publish its fields, properties and
        /// operations against the provided publication receiver.
        /// @param   receiver Publication receiver.
        /// @throws  Smp::InvalidComponentState
        void Publish(::Smp::IPublication* receiver) override;

        /// Request the Model to perform any custom configuration. The
        /// component can create and configure other components using the field
        /// values of its published fields.
        /// @param   logger Logger service for logging of error messages during
        ///          configuration.
        /// @param   linkRegistry Reference to the link registry services, so
        ///          that the Model can register links that it creates
        ///          during configuration.
        /// @throws  Smp::InvalidComponentState
        void Configure( ::Smp::Services::ILogger* logger, ::Smp::Services::ILinkRegistry* linkRegistry) override;

        /// Allow the Model to connect to the simulator and its simulation
        /// services.
        /// @param   simulator Simulation Environment that hosts the Model.
        /// @throws  Smp::InvalidComponentState
        void Connect( ::Smp::ISimulator* simulator) override;

        /// Ask the Model to disconnect from the simulator and all its
        /// simulation services.
        /// @throws  Smp::InvalidComponentState
        void Disconnect() override;

        /// Get Universally Unique Identifier of the Model.
        /// @return  Universally Unique Identifier of the Model.
        const ::Smp::Uuid& GetUuid() const override;

        private:
        ::Smp::Bool childState;
        };


    } // namespace support
} // namespace demo

#endif // DEMO_SUPPORT_CHILDMODELGEN_H_
