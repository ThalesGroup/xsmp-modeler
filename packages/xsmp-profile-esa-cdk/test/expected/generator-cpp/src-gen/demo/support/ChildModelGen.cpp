// -----------------------------------------------------------------------------
// File Name    : ChildModelGen.cpp
// -----------------------------------------------------------------------------
/// @file demo/support/ChildModelGen.cpp
// This file is auto-generated, Do not edit otherwise your changes will be lost

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <demo/support/ChildModel.h>


namespace demo
{
    namespace support
    {
        //--------------------------- Constructor -------------------------
        ChildModelGen::ChildModelGen(
            ::Smp::String8 name,
            ::Smp::String8 description,
            ::Smp::IComposite* parent,
            ::Smp::ISimulator* simulator):
            // Base class
            ::esa::ecss::smp::cdk::Model(name, description, parent, simulator),
                                                                                                  // Field childState
                                                                              childState {false} {

        }

        /// Virtual destructor that is called by inherited classes as well.
        ChildModelGen::~ChildModelGen() {

        }

        void ChildModelGen::Publish(::Smp::IPublication* receiver) {
            // Call parent class implementation first
            ::esa::ecss::smp::cdk::Model::Publish(receiver);

            if (requestHandlers.empty()) {
                PopulateRequestHandlers<ChildModelGen>(this, requestHandlers);
            }

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

            dynamic_cast<::demo::support::ChildModel*>(this)->DoPublish(receiver);
        }

        void ChildModelGen::Configure(::Smp::Services::ILogger* logger, ::Smp::Services::ILinkRegistry* linkRegistry) {
            // Call parent implementation first
            ::esa::ecss::smp::cdk::Model::Configure(logger, linkRegistry);

            dynamic_cast<::demo::support::ChildModel*>(this)->DoConfigure(logger, linkRegistry);
        }

        void ChildModelGen::Connect(::Smp::ISimulator* simulator) {
            // Call parent implementation first
            ::esa::ecss::smp::cdk::Model::Connect(simulator);

            dynamic_cast<::demo::support::ChildModel*>(this)->DoConnect(simulator);
        }

        void ChildModelGen::Disconnect() {
            if (this->GetState() == ::Smp::ComponentStateKind::CSK_Connected) {
                dynamic_cast<::demo::support::ChildModel*>(this)->DoDisconnect();
            }

            // Call parent implementation last, to remove references to the Simulator and its services
            ::esa::ecss::smp::cdk::Model::Disconnect();
        }

        void ChildModelGen::DoPublish(::Smp::IPublication*) {
        }

        void ChildModelGen::DoConfigure( ::Smp::Services::ILogger*, ::Smp::Services::ILinkRegistry*){
        }

        void ChildModelGen::DoConnect( ::Smp::ISimulator*){
        }

        void ChildModelGen::DoDisconnect(){
        }

        const ::Smp::Uuid& ChildModelGen::GetUuid() const {
            return Uuid_ChildModel;
        }

    } // namespace support
} // namespace demo