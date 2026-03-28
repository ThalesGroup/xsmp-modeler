// -----------------------------------------------------------------------------
// File Name    : ProfileGenerators.pkg.cpp
// -----------------------------------------------------------------------------
/// @file ProfileGenerators.pkg.cpp
// This file is auto-generated, Do not edit otherwise your changes will be lost

// -----------------------------------------------------------------------------
// --------------------------------- Includes ----------------------------------
// -----------------------------------------------------------------------------
#include <ProfileGenerators.h>
#include <Smp/ISimulator.h>
#include <Smp/Publication/ITypeRegistry.h>

#ifdef  WIN32
#define DLL_EXPORT __declspec(dllexport) // %RELAX<mconst> Visual Studio requires a define
#else
#define DLL_EXPORT
#endif

// -----------------------------------------------------------------------------
// -------------------------- Initialise Function ------------------------------
// -----------------------------------------------------------------------------

extern "C" {
    /// Global Initialise function of Package ProfileGenerators.
    /// @param simulator Simulator for registration of factories.
    /// @param typeRegistry Type Registry for registration of types.
    /// @return True if initialisation was successful, false otherwise.
    DLL_EXPORT bool Initialise(
            ::Smp::ISimulator* simulator,
            ::Smp::Publication::ITypeRegistry* typeRegistry) {
        return Initialise_ProfileGenerators(simulator, typeRegistry);
    }
}

// -----------------------------------------------------------------------------
// ---------------------------- Finalise Function ------------------------------
// -----------------------------------------------------------------------------

extern "C" {
    /// Global Finalise function of Package ProfileGenerators.
    /// @param simulator Simulator.
    /// @return True if finalisation was successful, false otherwise.
    DLL_EXPORT bool Finalise(::Smp::ISimulator*) {
        return Finalise_ProfileGenerators();
    }
}
