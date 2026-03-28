// -----------------------------------------------------------------------------
// File Name    : ChildModelGen.cpp
// -----------------------------------------------------------------------------
/// @file demo/support/ChildModelGen.cpp
// This file is auto-generated, Do not edit otherwise your changes will be lost

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <demo/support/ChildModel.h>
#include <Xsmp/ComponentHelper.h>


namespace demo::support
{
    //--------------------------- Constructor -------------------------
    ChildModelGen::ChildModelGen(
        ::Smp::String8 name,
        ::Smp::String8 description,
        ::Smp::IComposite* parent,
        ::Smp::ISimulator* simulator):
        // Base class
        ::Xsmp::Model(name, description, parent, simulator),
                                                                               // Field childState
                                                           childState {false} { }

    void ChildModelGen::Publish(::Smp::IPublication* receiver) {
        // Call parent class implementation first
        ::Xsmp::Model::Publish(receiver);

        // Publish field childState
        receiver->PublishField(
            "childState", // Name
            "", // Description
            &childState, // Address
            ::Smp::ViewKind::VK_All, // View Kind
            true, // State
            false, // Input
            false // Output
        );
        // Call user DoPublish if any
        ::Xsmp::Component::Helper::Publish<::demo::support::ChildModel>(this, receiver);
    }

    void ChildModelGen::Configure(::Smp::Services::ILogger* logger, ::Smp::Services::ILinkRegistry* linkRegistry) {
        // Call parent implementation first
        ::Xsmp::Model::Configure(logger, linkRegistry);

        // Call user DoConfigure if any
        ::Xsmp::Component::Helper::Configure<::demo::support::ChildModel>(this, logger, linkRegistry);
    }

    void ChildModelGen::Connect(::Smp::ISimulator* simulator) {
        // Call parent implementation first
        ::Xsmp::Model::Connect(simulator);

        // Call user DoConnect if any
        ::Xsmp::Component::Helper::Connect<::demo::support::ChildModel>(this, simulator);
    }

    void ChildModelGen::Disconnect() {
        if (this->GetState() == ::Smp::ComponentStateKind::CSK_Connected) {
            // Call user DoDisconnect if any
            ::Xsmp::Component::Helper::Disconnect<::demo::support::ChildModel>(this);
        }

        // Call parent implementation last, to remove references to the Simulator and its services
        ::Xsmp::Model::Disconnect();
    }

    const ::Smp::Uuid& ChildModelGen::GetUuid() const {
        return Uuid_ChildModel;
    }

} // namespace demo::support