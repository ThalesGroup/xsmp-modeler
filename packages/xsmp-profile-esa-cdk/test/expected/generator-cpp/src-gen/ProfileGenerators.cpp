// -----------------------------------------------------------------------------
// File Name    : ProfileGenerators.cpp
// -----------------------------------------------------------------------------
/// @file ProfileGenerators.cpp
// This file is auto-generated, Do not edit otherwise your changes will be lost

// ----------------------------------------------------------------------------
// --------------------------- Include Header Files ---------------------------
// ----------------------------------------------------------------------------

#include <demo/support/ChildModel.h>
#include <demo/support/Counter.h>
#include <demo/support/CounterArray.h>
#include <demo/support/DeviceBase.h>
#include <demo/support/DeviceError.h>
#include <demo/support/Label.h>
#include <demo/support/Mode.h>
#include <demo/support/MonitorService.h>
#include <demo/support/Payload.h>
#include <demo/support/Ratio.h>
#include <demo/support/RootModel.h>
#include <esa/ecss/smp/cdk/Factory.h>
#include <ProfileGenerators.h>
#include <unordered_set>


// -----------------------------------------------------------------------------
// ----------------------------- Global variables ------------------------------
// -----------------------------------------------------------------------------

namespace {
/// Simulators set.
std::unordered_set<::Smp::ISimulator*> simulators { };
} // namespace


// -----------------------------------------------------------------------------
// --------------------------- Initialise Function -----------------------------
// -----------------------------------------------------------------------------

extern "C"
{
    /// Initialise Package ProfileGenerators.
    /// @param simulator Simulator for registration of factories.
    /// @param typeRegistry Type Registry for registration of types.
    /// @return True if initialisation was successful, false otherwise.
    bool Initialise_ProfileGenerators(
            ::Smp::ISimulator* simulator,
            ::Smp::Publication::ITypeRegistry* typeRegistry) {
        // check simulator validity
        if (!simulator) {
            return false;
        }
        // avoid double initialisation
        if (!::simulators.emplace(simulator).second) {
            return true;
        }

        // register Enumeration Mode
        ::demo::support::_Register_Mode(typeRegistry);
        // register Integer Counter
        ::demo::support::_Register_Counter(typeRegistry);
        // register Float Ratio
        ::demo::support::_Register_Ratio(typeRegistry);
        // register String Label
        ::demo::support::_Register_Label(typeRegistry);
        // register Array CounterArray
        ::demo::support::_Register_CounterArray(typeRegistry);
        // register Structure Payload
        ::demo::support::Payload::_Register(typeRegistry);
        // register Class DeviceBase
        ::demo::support::DeviceBase::_Register(typeRegistry);
        // register Exception DeviceError
        ::demo::support::DeviceError::_Register(typeRegistry);
        // Register Service MonitorService
        simulator->AddService( new ::demo::support::MonitorService(
            "MonitorService", // Name
            "", // Description
            simulator, // Parent
            simulator // Simulator
            ));

        // Register factory for Model ChildModel
        simulator->RegisterFactory(new ::esa::ecss::smp::cdk::Factory<::demo::support::ChildModel>(
                            "ChildModel", // Name
                             "", // Description
                            simulator, // Simulator
                            ::demo::support::Uuid_ChildModel // UUID
                            ));

        // Register factory for Model RootModel
        simulator->RegisterFactory(new ::esa::ecss::smp::cdk::Factory<::demo::support::RootModel>(
                            "RootModel", // Name
                             "", // Description
                            simulator, // Simulator
                            ::demo::support::Uuid_RootModel // UUID
                            ));


        return true;
    }
}

// ---------------------------------------------------------------------------------
// ---------------------------- Finalise Function ------------------------------
// ---------------------------------------------------------------------------------

extern "C"
{
    /// Finalise Package ProfileGenerators.
    /// @return True if finalisation was successful, false otherwise.
    bool Finalise_ProfileGenerators() {
        // avoid double finalisation
        if (::simulators.empty()) {
            return true;
        }
        ::simulators.clear();

        return true;
    }
}
