// -----------------------------------------------------------------------------
// File Name    : ChildModelGen.cpp
// -----------------------------------------------------------------------------
/// @file demo/support/ChildModelGen.cpp
// This file is auto-generated, Do not edit otherwise your changes will be lost

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <demo/support/ChildModel.h>
#include <Smp/Version.h>


namespace demo
{
    namespace support
    {
             ::TasMdk::Request::Handler<ChildModelGen>::CollectionType ChildModelGen::requestHandlers;

             void ChildModelGen::Configure(::Smp::Services::ILogger* logger, ::Smp::Services::ILinkRegistry* linkRegistry) {
                 // Call base implementation first
                 ::TasMdk::Model::Configure(logger, linkRegistry);
                 if (Configure_Callback) {
                     Configure_Callback(logger, linkRegistry);
        }
             }

             void ChildModelGen::Connect(::Smp::ISimulator* simulator) {
                 // Call mdk implementation first
                 ::TasMdk::Model::Connect(simulator);
                 if (Connect_Callback) {
                     Connect_Callback(simulator);
                 }
             }

             void ChildModelGen::Disconnect() {
                 if (Disconnect_Callback) {
                     Disconnect_Callback();
                 }
                 // Call parent implementation last, to remove references to the Simulator and its services
                 ::TasMdk::Model::Disconnect();
             }

             ChildModelGen::ChildModelGen(
                 ::Smp::String8 name,
                 ::Smp::String8 description,
                 ::Smp::IObject* parent,
                 ::Smp::Publication::ITypeRegistry* type_registry)
                 : // Base class initialization
                 ::TasMdk::Model(name, description, parent, type_registry),
                                                                                              // Field childState
                                                                          childState {false}
             {
             }

             ChildModelGen::~ChildModelGen() {

             }

             void ChildModelGen::Publish(::Smp::IPublication* receiver) {
                 // Call base class implementation first
                 ::TasMdk::Model::Publish(receiver);

                 if (Publish_Callback) {
                     Publish_Callback(receiver);
                 }

                 // Populate the request handlers (only once)
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
             }



             void ChildModelGen::Invoke(::Smp::IRequest* request) {
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
                     ::TasMdk::Model::Invoke(request);
                 }
             }
             const ::Smp::Uuid& ChildModelGen::GetUuid() const {
                 return Uuid_ChildModel;
             }

    } // namespace support
} // namespace demo