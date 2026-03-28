// -----------------------------------------------------------------------------
// File Name    : RootModelGen.cpp
// -----------------------------------------------------------------------------
/// @file demo/support/RootModelGen.cpp
// This file is auto-generated, Do not edit otherwise your changes will be lost

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <demo/support/RootModel.h>
#include <Xsmp/ComponentHelper.h>
#include <Xsmp/Request.h>


namespace demo::support
{
    //--------------------------- Constructor -------------------------
    RootModelGen::RootModelGen(
        ::Smp::String8 name,
        ::Smp::String8 description,
        ::Smp::IComposite* parent,
        ::Smp::ISimulator* simulator):
        // Base class
        ::Xsmp::Model(name, description, parent, simulator),
                                                                               // EntryPoint main
                                                           main{
                                                               "main", // Name
                                                               "", // Description
                                                               this, // Parent
                                                               [this]{this->_main();} // Callback
                                                           },
                                                           // EventSink onTick
                                                           onTick{
                                                               "onTick", // Name
                                                               "", // Description
                                                               this, // Parent
                                                               [this](::Smp::IObject *sender, ::demo::support::Counter value) {this->_onTick(sender, value);}, // Callback
                                                               ::Smp::PrimitiveTypeKind::PTK_Int32 // Primitive Type Kind
                                                           },
                                                           // EventSource onDone
                                                           onDone{
                                                               "onDone", // Name
                                                               "", // Description
                                                               this // Parent
                                                           },
                                                           // Field name
                                                           name {"root"},
                                                           // Field counters
                                                           counters {{ 0, 1, 2}},
                                                           // Field payload
                                                           payload { true, 1},
                                                           // Field connectedState
                                                           connectedState {false},
                                                           // Container child
                                                           child {
                                                               "child", // Name
                                                               "", // Description
                                                               this, // Parent
                                                               1, // Lower bound
                                                               1 // Upper bound
                                                           },
                                                           // Reference deviceRef
                                                           deviceRef{
                                                               "deviceRef", // Name
                                                               "", // Description
                                                               this, // Parent
                                                               1, // Lower bound
                                                               1 // Upper bound
                                                           },
                                                           // Reference childRef
                                                           childRef{
                                                               "childRef", // Name
                                                               "", // Description
                                                               this, // Parent
                                                               1, // Lower bound
                                                               1 // Upper bound
                                                           } { }

    void RootModelGen::Publish(::Smp::IPublication* receiver) {
        // Call parent class implementation first
        ::Xsmp::Model::Publish(receiver);

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
        // Call user DoPublish if any
        ::Xsmp::Component::Helper::Publish<::demo::support::RootModel>(this, receiver);
    }

    void RootModelGen::Configure(::Smp::Services::ILogger* logger, ::Smp::Services::ILinkRegistry* linkRegistry) {
        // Call parent implementation first
        ::Xsmp::Model::Configure(logger, linkRegistry);

        // Call user DoConfigure if any
        ::Xsmp::Component::Helper::Configure<::demo::support::RootModel>(this, logger, linkRegistry);
    }

    void RootModelGen::Connect(::Smp::ISimulator* simulator) {
        // Call parent implementation first
        ::Xsmp::Model::Connect(simulator);

        // Call user DoConnect if any
        ::Xsmp::Component::Helper::Connect<::demo::support::RootModel>(this, simulator);
    }

    void RootModelGen::Disconnect() {
        if (this->GetState() == ::Smp::ComponentStateKind::CSK_Connected) {
            // Call user DoDisconnect if any
            ::Xsmp::Component::Helper::Disconnect<::demo::support::RootModel>(this);
        }

        // Call parent implementation last, to remove references to the Simulator and its services
        ::Xsmp::Model::Disconnect();
    }


                    std::map<std::string_view, std::function<void(RootModelGen*, ::Smp::IRequest*)>> RootModelGen::_requestHandlers{
                        // Handler for Operation ping
    {"ping",
    [](RootModelGen* component, ::Smp::IRequest *request) {
        auto p_requested = ::Xsmp::Request::get<::demo::support::Ratio>(component, request, "requested", ::Smp::PrimitiveTypeKind::PTK_Float64);
        ::Smp::Float64 p_measured{};
        ::Xsmp::Request::setReturnValue(request, ::Smp::PrimitiveTypeKind::PTK_Bool, component->ping(p_requested, &p_measured));

        ::Xsmp::Request::set(component, request, "measured", ::Smp::PrimitiveTypeKind::PTK_Float64, p_measured);
    }},


    // Getter handler for Property connected
    {"get_connected",
    [](RootModelGen* component, ::Smp::IRequest *request) {
        ::Xsmp::Request::setReturnValue(request, ::Smp::PrimitiveTypeKind::PTK_Bool, component->get_connected());
    }},



    // Setter handler for Property connected
    {"set_connected",
    [](RootModelGen* component, ::Smp::IRequest *request) {
        component->set_connected(::Xsmp::Request::get<::Smp::Bool>(component, request, "connected", ::Smp::PrimitiveTypeKind::PTK_Bool));
    }},


                    };

                    void RootModelGen::Invoke(::Smp::IRequest* request) {
                        if (!request) {
                            return;
                        }
                        if (auto it = _requestHandlers.find(request->GetOperationName());
                                it != _requestHandlers.end()) {
                            it->second(this, request);
                        } else {
                            // pass the request down to the base class
                            ::Xsmp::Model::Invoke(request);
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
} // namespace demo::support