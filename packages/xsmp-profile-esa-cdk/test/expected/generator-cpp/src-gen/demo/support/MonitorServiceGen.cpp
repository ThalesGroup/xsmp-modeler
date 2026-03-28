// -----------------------------------------------------------------------------
// File Name    : MonitorServiceGen.cpp
// -----------------------------------------------------------------------------
/// @file demo/support/MonitorServiceGen.cpp
// This file is auto-generated, Do not edit otherwise your changes will be lost

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <demo/support/MonitorService.h>
#include <esa/ecss/smp/cdk/Request.h>
#include <Smp/IPublication.h>


namespace demo
{
    namespace support
    {
        //--------------------------- Constructor -------------------------
        MonitorServiceGen::MonitorServiceGen(
            ::Smp::String8 name,
            ::Smp::String8 description,
            ::Smp::IComposite* parent,
            ::Smp::ISimulator* simulator):
            // Base class
            ::esa::ecss::smp::cdk::Service(name, description, parent, simulator),
                                                                                                    // Field running
                                                                                running {false} {

        }

        /// Virtual destructor that is called by inherited classes as well.
        MonitorServiceGen::~MonitorServiceGen() {

        }

        void MonitorServiceGen::Publish(::Smp::IPublication* receiver) {
            // Call parent class implementation first
            ::esa::ecss::smp::cdk::Service::Publish(receiver);

            if (requestHandlers.empty()) {
                PopulateRequestHandlers<MonitorServiceGen>(this, requestHandlers);
            }

            // Publish field running
            receiver->PublishField(
                "running", // Name
                "", // Description
                &running, // Address
                ::Smp::ViewKind::VK_All, // View Kind
                true, // State
                false, // Input
                false // Output
            );
            // Publish operation start
            receiver->PublishOperation(
                "start", // Name
                "", // Description
                ::Smp::ViewKind::VK_All // View Kind
            );


            // Publish Property Running
            receiver->PublishProperty(
                "Running", // Name
                "", // Description
                ::Smp::Uuids::Uuid_Bool, // Type UUID
                ::Smp::AccessKind::AK_ReadWrite, // Access Kind
                ::Smp::ViewKind::VK_All // View Kind
            );

            dynamic_cast<::demo::support::MonitorService*>(this)->DoPublish(receiver);
        }

        void MonitorServiceGen::Configure(::Smp::Services::ILogger* logger, ::Smp::Services::ILinkRegistry* linkRegistry) {
            // Call parent implementation first
            ::esa::ecss::smp::cdk::Service::Configure(logger, linkRegistry);

            dynamic_cast<::demo::support::MonitorService*>(this)->DoConfigure(logger, linkRegistry);
        }

        void MonitorServiceGen::Connect(::Smp::ISimulator* simulator) {
            // Call parent implementation first
            ::esa::ecss::smp::cdk::Service::Connect(simulator);

            dynamic_cast<::demo::support::MonitorService*>(this)->DoConnect(simulator);
        }

        void MonitorServiceGen::Disconnect() {
            if (this->GetState() == ::Smp::ComponentStateKind::CSK_Connected) {
                dynamic_cast<::demo::support::MonitorService*>(this)->DoDisconnect();
            }

            // Call parent implementation last, to remove references to the Simulator and its services
            ::esa::ecss::smp::cdk::Service::Disconnect();
        }

        void MonitorServiceGen::DoPublish(::Smp::IPublication*) {
        }

        void MonitorServiceGen::DoConfigure( ::Smp::Services::ILogger*, ::Smp::Services::ILinkRegistry*){
        }

        void MonitorServiceGen::DoConnect( ::Smp::ISimulator*){
        }

        void MonitorServiceGen::DoDisconnect(){
        }


                        void MonitorServiceGen::Invoke(::Smp::IRequest* request) {
                            if (!request) {
                                return;
                            }
                            if (auto it = _requestHandlers.find(request->GetOperationName());
                                    it != _requestHandlers.end()) {
                                it->second(this, request);
                            } else {
                                // pass the request down to the base class
                                ::esa::ecss::smp::cdk::Service::Invoke(request);
                            }
                        }


        const ::Smp::Uuid& MonitorServiceGen::GetUuid() const {
            return Uuid_MonitorService;
        }
        ::Smp::Bool MonitorServiceGen::get_Running(){
            return this->running;
        }
        void MonitorServiceGen::set_Running(::Smp::Bool value) {
            this->running = value;
        }
    } // namespace support
} // namespace demo