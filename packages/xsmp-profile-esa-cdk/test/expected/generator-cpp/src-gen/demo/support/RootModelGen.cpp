// -----------------------------------------------------------------------------
// File Name    : RootModelGen.cpp
// -----------------------------------------------------------------------------
/// @file demo/support/RootModelGen.cpp
// This file is auto-generated, Do not edit otherwise your changes will be lost

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <demo/support/RootModel.h>
#include <esa/ecss/smp/cdk/EntryPoint.h>
#include <esa/ecss/smp/cdk/EventSinkArg.h>
#include <esa/ecss/smp/cdk/Request.h>
#include <Smp/IPublication.h>


namespace demo
{
    namespace support
    {
        //--------------------------- Constructor -------------------------
        RootModelGen::RootModelGen(
            ::Smp::String8 name,
            ::Smp::String8 description,
            ::Smp::IComposite* parent,
            ::Smp::ISimulator* simulator):
            // Base class
            ::esa::ecss::smp::cdk::Model(name, description, parent, simulator),
                                                                                                  // EntryPoint: main
                                                                              main{ new ::esa::ecss::smp::cdk::EntryPoint(
                                                                                  "main", // Name
                                                                                  "", // Description
                                                                                  this,
                                                                                  simulator,
                                                                                  &RootModelGen::_main)}
                                                                              ,
                                                                              // Event Sink: onTick
                                                                              onTick{ new ::esa::ecss::smp::cdk::EventSinkArg<::demo::support::Counter>(
                                                                                  "onTick", // Name
                                                                                  "", // Description
                                                                                  this,
                                                                                  simulator,
                                                                                  &RootModelGen::_onTick)}
                                                                              ,
                                                                              // Event Source: onDone
                                                                              onDone{ new ::esa::ecss::smp::cdk::EventSourceVoid(
                                                                                  "onDone", // Name
                                                                                  "", // Description
                                                                                  this,
                                                                                  simulator)}
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
                                                                              child {new ::esa::ecss::smp::cdk::Container<::Smp::IComposite>(
                                                                                  "child",
                                                                                  "",
                                                                                  this,
                                                                                  simulator,
                                                                                  1,
                                                                                  1)}
                                                                              ,
                                                                              // Reference: deviceRef
                                                                              deviceRef {new ::esa::ecss::smp::cdk::Reference<::demo::support::IDevice>(
                                                                                  "deviceRef",
                                                                                  "",
                                                                                  this,
                                                                                  simulator,
                                                                                  1,
                                                                                  1)}
                                                                              ,
                                                                              // Reference: childRef
                                                                              childRef {new ::esa::ecss::smp::cdk::Reference<::demo::support::ChildModel>(
                                                                                  "childRef",
                                                                                  "",
                                                                                  this,
                                                                                  simulator,
                                                                                  1,
                                                                                  1)}
                                                                               {
            // Add reference deviceRef
            this->AddReference(deviceRef);
            // Add reference childRef
            this->AddReference(childRef);
            // Add container child
            this->AddContainer(child);
            if (!this->GetEntryPoint("main"))
            {
                // Use existing implementation to manage Entry Points
                this->AddEntryPoint(main);
            }
            else
            {
                Log(Smp::Services::ILogger::LMK_Error, "EntryPoint main redeclared");
            }
            // Add event sink onTick
            this->AddEventSink(onTick);
            // Add event source onDone
            this->AddEventSource(onDone);
        }

        /// Virtual destructor that is called by inherited classes as well.
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
            // Call parent class implementation first
            ::esa::ecss::smp::cdk::Model::Publish(receiver);

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

            dynamic_cast<::demo::support::RootModel*>(this)->DoPublish(receiver);
        }

        void RootModelGen::Configure(::Smp::Services::ILogger* logger, ::Smp::Services::ILinkRegistry* linkRegistry) {
            // Call parent implementation first
            ::esa::ecss::smp::cdk::Model::Configure(logger, linkRegistry);

            dynamic_cast<::demo::support::RootModel*>(this)->DoConfigure(logger, linkRegistry);
        }

        void RootModelGen::Connect(::Smp::ISimulator* simulator) {
            // Call parent implementation first
            ::esa::ecss::smp::cdk::Model::Connect(simulator);

            dynamic_cast<::demo::support::RootModel*>(this)->DoConnect(simulator);
        }

        void RootModelGen::Disconnect() {
            if (this->GetState() == ::Smp::ComponentStateKind::CSK_Connected) {
                dynamic_cast<::demo::support::RootModel*>(this)->DoDisconnect();
            }

            // Call parent implementation last, to remove references to the Simulator and its services
            ::esa::ecss::smp::cdk::Model::Disconnect();
        }

        void RootModelGen::DoPublish(::Smp::IPublication*) {
        }

        void RootModelGen::DoConfigure( ::Smp::Services::ILogger*, ::Smp::Services::ILinkRegistry*){
        }

        void RootModelGen::DoConnect( ::Smp::ISimulator*){
        }

        void RootModelGen::DoDisconnect(){
        }


                        void RootModelGen::Invoke(::Smp::IRequest* request) {
                            if (!request) {
                                return;
                            }
                            if (auto it = _requestHandlers.find(request->GetOperationName());
                                    it != _requestHandlers.end()) {
                                it->second(this, request);
                            } else {
                                // pass the request down to the base class
                                ::esa::ecss::smp::cdk::Model::Invoke(request);
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