// -----------------------------------------------------------------------------
// File Name    : MonitorServiceGen.cpp
// -----------------------------------------------------------------------------
/// @file demo/support/MonitorServiceGen.cpp
// This file is auto-generated, Do not edit otherwise your changes will be lost

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <demo/support/MonitorService.h>
#include <Xsmp/ComponentHelper.h>
#include <Xsmp/Request.h>


namespace demo::support
{
    //--------------------------- Constructor -------------------------
    MonitorServiceGen::MonitorServiceGen(
        ::Smp::String8 name,
        ::Smp::String8 description,
        ::Smp::IComposite* parent,
        ::Smp::ISimulator* simulator):
        // Base class
        ::Xsmp::Service(name, description, parent, simulator),
                                                                                 // Field running
                                                             running {false} { }

    void MonitorServiceGen::Publish(::Smp::IPublication* receiver) {
        // Call parent class implementation first
        ::Xsmp::Service::Publish(receiver);

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
        // Call user DoPublish if any
        ::Xsmp::Component::Helper::Publish<::demo::support::MonitorService>(this, receiver);
    }

    void MonitorServiceGen::Configure(::Smp::Services::ILogger* logger, ::Smp::Services::ILinkRegistry* linkRegistry) {
        // Call parent implementation first
        ::Xsmp::Service::Configure(logger, linkRegistry);

        // Call user DoConfigure if any
        ::Xsmp::Component::Helper::Configure<::demo::support::MonitorService>(this, logger, linkRegistry);
    }

    void MonitorServiceGen::Connect(::Smp::ISimulator* simulator) {
        // Call parent implementation first
        ::Xsmp::Service::Connect(simulator);

        // Call user DoConnect if any
        ::Xsmp::Component::Helper::Connect<::demo::support::MonitorService>(this, simulator);
    }

    void MonitorServiceGen::Disconnect() {
        if (this->GetState() == ::Smp::ComponentStateKind::CSK_Connected) {
            // Call user DoDisconnect if any
            ::Xsmp::Component::Helper::Disconnect<::demo::support::MonitorService>(this);
        }

        // Call parent implementation last, to remove references to the Simulator and its services
        ::Xsmp::Service::Disconnect();
    }


                    std::map<std::string_view, std::function<void(MonitorServiceGen*, ::Smp::IRequest*)>> MonitorServiceGen::_requestHandlers{
                        // Handler for Operation start
    {"start",
    [](MonitorServiceGen* component, ::Smp::IRequest *) {

        component->start();

    }},


    // Getter handler for Property Running
    {"get_Running",
    [](MonitorServiceGen* component, ::Smp::IRequest *request) {
        ::Xsmp::Request::setReturnValue(request, ::Smp::PrimitiveTypeKind::PTK_Bool, component->get_Running());
    }},



    // Setter handler for Property Running
    {"set_Running",
    [](MonitorServiceGen* component, ::Smp::IRequest *request) {
        component->set_Running(::Xsmp::Request::get<::Smp::Bool>(component, request, "Running", ::Smp::PrimitiveTypeKind::PTK_Bool));
    }},


                    };

                    void MonitorServiceGen::Invoke(::Smp::IRequest* request) {
                        if (!request) {
                            return;
                        }
                        if (auto it = _requestHandlers.find(request->GetOperationName());
                                it != _requestHandlers.end()) {
                            it->second(this, request);
                        } else {
                            // pass the request down to the base class
                            ::Xsmp::Service::Invoke(request);
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
} // namespace demo::support