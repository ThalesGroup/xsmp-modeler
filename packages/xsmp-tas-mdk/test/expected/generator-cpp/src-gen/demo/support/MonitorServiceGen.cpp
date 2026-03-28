// -----------------------------------------------------------------------------
// File Name    : MonitorServiceGen.cpp
// -----------------------------------------------------------------------------
/// @file demo/support/MonitorServiceGen.cpp
// This file is auto-generated, Do not edit otherwise your changes will be lost

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <demo/support/MonitorService.h>
#include <Smp/Publication/IPublishOperation.h>
#include <Smp/Version.h>


namespace demo
{
    namespace support
    {
             ::TasMdk::Request::Handler<MonitorServiceGen>::CollectionType MonitorServiceGen::requestHandlers;

             void MonitorServiceGen::Configure(::Smp::Services::ILogger* logger, ::Smp::Services::ILinkRegistry* linkRegistry) {
                 // Call base implementation first
                 ::TasMdk::Service::Configure(logger, linkRegistry);
                 if (Configure_Callback) {
                     Configure_Callback(logger, linkRegistry);
        }
             }

             void MonitorServiceGen::Connect(::Smp::ISimulator* simulator) {
                 // Call mdk implementation first
                 ::TasMdk::Service::Connect(simulator);
                 if (Connect_Callback) {
                     Connect_Callback(simulator);
                 }
             }

             void MonitorServiceGen::Disconnect() {
                 if (Disconnect_Callback) {
                     Disconnect_Callback();
                 }
                 // Call parent implementation last, to remove references to the Simulator and its services
                 ::TasMdk::Service::Disconnect();
             }

             MonitorServiceGen::MonitorServiceGen(
                 ::Smp::String8 name,
                 ::Smp::String8 description,
                 ::Smp::IObject* parent,
                 ::Smp::Publication::ITypeRegistry* type_registry)
                 : // Base class initialization
                 ::TasMdk::Service(name, description, parent, type_registry),
                                                                                                // Field running
                                                                            running {false}
             {
             }

             MonitorServiceGen::~MonitorServiceGen() {

             }

             void MonitorServiceGen::Publish(::Smp::IPublication* receiver) {
                 // Call base class implementation first
                 ::TasMdk::Service::Publish(receiver);

                 if (Publish_Callback) {
                     Publish_Callback(receiver);
                 }

                 // Populate the request handlers (only once)
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
             }



             void MonitorServiceGen::Invoke(::Smp::IRequest* request) {
                 if (request == nullptr) {
                     return;
                 }
                 #if ECSS_SMP_VERSION < 202503L
                 auto handler = requestHandlers.find(request->GetOperationName());
                 #else
                 auto handler = requestHandlers.find(request->GetName());
                 #endif
                 if (handler != requestHandlers.end()) {
                     handler->second(*this, request);
                 } else {
                     // pass the request down to the base model
                     ::TasMdk::Service::Invoke(request);
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