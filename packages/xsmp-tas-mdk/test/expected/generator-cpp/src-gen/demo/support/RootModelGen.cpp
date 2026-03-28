// -----------------------------------------------------------------------------
// File Name    : RootModelGen.cpp
// -----------------------------------------------------------------------------
/// @file demo/support/RootModelGen.cpp
// This file is auto-generated, Do not edit otherwise your changes will be lost

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <demo/support/RootModel.h>
#include <Smp/Publication/IPublishOperation.h>
#include <Smp/Version.h>
#include <TasMdk/EntryPoint.h>
#include <TasMdk/EventSink.h>


namespace demo
{
    namespace support
    {
             ::TasMdk::Request::Handler<RootModelGen>::CollectionType RootModelGen::requestHandlers;

             void RootModelGen::Configure(::Smp::Services::ILogger* logger, ::Smp::Services::ILinkRegistry* linkRegistry) {
                 // Call base implementation first
                 ::TasMdk::Model::Configure(logger, linkRegistry);
                 if (Configure_Callback) {
                     Configure_Callback(logger, linkRegistry);
        }
             }

             void RootModelGen::Connect(::Smp::ISimulator* simulator) {
                 // Call mdk implementation first
                 ::TasMdk::Model::Connect(simulator);
                 if (Connect_Callback) {
                     Connect_Callback(simulator);
                 }
             }

             void RootModelGen::Disconnect() {
                 if (Disconnect_Callback) {
                     Disconnect_Callback();
                 }
                 // Call parent implementation last, to remove references to the Simulator and its services
                 ::TasMdk::Model::Disconnect();
             }

             RootModelGen::RootModelGen(
                 ::Smp::String8 name,
                 ::Smp::String8 description,
                 ::Smp::IObject* parent,
                 ::Smp::Publication::ITypeRegistry* type_registry)
                 : // Base class initialization
                 ::TasMdk::Model(name, description, parent, type_registry),
                                                                                              // EntryPoint: main
                                                                          main{ new ::TasMdk::EntryPoint(
                                                                              "main", // Name
                                                                              "", // Description
                                                                              this,
                                                                              _entrypoints,
                                                                              std::bind(&RootModelGen::_main, this))}
                                                                          ,
                                                                          // Event Sink: onTick
                                                                          onTick{ new ::TasMdk::EventSink(
                                                                              "onTick", // Name
                                                                              "", // Description
                                                                              this,
                                                                              _event_sinks,
                                                                              std::bind(&RootModelGen::_onTick, this, std::placeholders::_1))}
                                                                          ,
                                                                          // Event Source: onDone
                                                                          onDone{ new ::TasMdk::EventSource(
                                                                              "onDone", // Name
                                                                              "", // Description
                                                                              this,
                                                                              _event_sources)}
                                                                          ,
                                                                          // Field name
                                                                          name {"root"},
                                                                          // Field counters
                                                                          counters {{ 0, 1, 2}},
                                                                          // Field payload
                                                                          payload { true, 1},
                                                                          // Field connectedState
                                                                          connectedState {false},
                                                                          // Container: child
                                                                          child {new ::TasMdk::Container<::Smp::IComposite>(
                                                                              "child",
                                                                              "",
                                                                              this,
                                                                              _containers,
                                                                              1,
                                                                              1)}
                                                                          ,
                                                                          // Reference: deviceRef
                                                                          deviceRef {new ::TasMdk::Reference<::demo::support::IDevice>(
                                                                              "deviceRef",
                                                                              "",
                                                                              this,
                                                                              _references,
                                                                              1,
                                                                              1)}
                                                                          ,
                                                                          // Reference: childRef
                                                                          childRef {new ::TasMdk::Reference<::demo::support::ChildModel>(
                                                                              "childRef",
                                                                              "",
                                                                              this,
                                                                              _references,
                                                                              1,
                                                                              1)}

             {
             }

             RootModelGen::~RootModelGen() {
                 delete deviceRef;
                 deviceRef = nullptr;
                 delete childRef;
                 childRef = nullptr;
                 delete child;
                 child = nullptr;
                 delete main;
                 main = nullptr;
                 delete onTick;
                 onTick = nullptr;
                 delete onDone;
                 onDone = nullptr;
             }

             void RootModelGen::Publish(::Smp::IPublication* receiver) {
                 // Call base class implementation first
                 ::TasMdk::Model::Publish(receiver);

                 if (Publish_Callback) {
                     Publish_Callback(receiver);
                 }

                 // Populate the request handlers (only once)
                 if (requestHandlers.empty()) {
                     PopulateRequestHandlers<RootModelGen>(this, requestHandlers);
                 }

                 // Publish field name
                 receiver->PublishField(
                     "name", // Name
                     "", // Description
                     &name, // Address
                     ::demo::support::Uuid_Label, // Type UUID
                     ::Smp::ViewKind::VK_All, // View Kind
                     true, // State
                     false, // Input
                     false // Output
                 );
                 // Publish field counters
                 receiver->PublishField(
                     "counters", // Name
                     "", // Description
                     &counters, // Address
                     ::demo::support::Uuid_CounterArray, // Type UUID
                     ::Smp::ViewKind::VK_All, // View Kind
                     true, // State
                     false, // Input
                     false // Output
                 );
                 // Publish field payload
                 receiver->PublishField(
                     "payload", // Name
                     "", // Description
                     &payload, // Address
                     ::demo::support::Uuid_Payload, // Type UUID
                     ::Smp::ViewKind::VK_All, // View Kind
                     true, // State
                     false, // Input
                     false // Output
                 );
                 // Publish field connectedState
                 receiver->PublishField(
                     "connectedState", // Name
                     "", // Description
                     &connectedState, // Address
                     ::Smp::ViewKind::VK_All, // View Kind
                     true, // State
                     false, // Input
                     false // Output
                 );
                 // Publish operation ping
                 auto* op_ping = receiver->PublishOperation(
                     "ping", // Name
                     "", // Description
                     ::Smp::ViewKind::VK_All // View Kind
                 );
                 op_ping->PublishParameter(
                                     "requested", // Name
                                     "", // Description
                                     ::demo::support::Uuid_Ratio, // Type UUID
                                     Smp::Publication::ParameterDirectionKind::PDK_In // Parameter Direction Kind
                                 );
                 op_ping->PublishParameter(
                                     "measured", // Name
                                     "", // Description
                                     ::Smp::Uuids::Uuid_Float64, // Type UUID
                                     Smp::Publication::ParameterDirectionKind::PDK_Out // Parameter Direction Kind
                                 );
                 op_ping->PublishParameter(
                                     "return", // Name
                                     "", // Description
                                     ::Smp::Uuids::Uuid_Bool, // Type UUID
                                     Smp::Publication::ParameterDirectionKind::PDK_Return // Parameter Direction Kind
                                 );
                 // Publish Property connected
                 receiver->PublishProperty(
                     "connected", // Name
                     "", // Description
                     ::Smp::Uuids::Uuid_Bool, // Type UUID
                     ::Smp::AccessKind::AK_ReadWrite, // Access Kind
                     ::Smp::ViewKind::VK_All // View Kind
                 );
             }



             void RootModelGen::Invoke(::Smp::IRequest* request) {
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
             const ::Smp::Uuid& RootModelGen::GetUuid() const {
                 return Uuid_RootModel;
             }
             ::Smp::Bool RootModelGen::get_connected(){
                 return this->connectedState;
             }
             void RootModelGen::set_connected(::Smp::Bool value) {
                 this->connectedState = value;
             }
    } // namespace support
} // namespace demo