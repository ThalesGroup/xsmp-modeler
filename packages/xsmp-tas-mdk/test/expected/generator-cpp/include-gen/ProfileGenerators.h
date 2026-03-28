// ---------------------------------------------------------------------------
// File Name    : ProfileGenerators.h
// ---------------------------------------------------------------------------
/// @file ProfileGenerators.h
// This file is auto-generated, Do not edit otherwise your changes will be lost

#ifndef PROFILEGENERATORS_H_
#define PROFILEGENERATORS_H_

// ----------------------------------------------------------------------------
// --------------------------------- Includes ---------------------------------
// ----------------------------------------------------------------------------
#include <Smp/ISimulator.h>
#include <Smp/Publication/ITypeRegistry.h>
#include <Smp/Version.h>

// Entry points for static library
extern "C" {
    /// Initialise Package ProfileGenerators.
    /// @param simulator Simulator for registration of factories.
    /// @param typeRegistry Type Registry for registration of types.
    /// @return True if initialisation was successful, false otherwise.
    bool Initialise_ProfileGenerators(
        ::Smp::ISimulator* simulator,
        ::Smp::Publication::ITypeRegistry* typeRegistry);

    /// Finalise Package ProfileGenerators.
    /// @return True if finalisation was successful, false otherwise.
    #if ECSS_SMP_VERSION < 202503L
    bool Finalise_ProfileGenerators();
    #else
    bool Finalise_ProfileGenerators(::Smp::ISimulator *simulator);
    #endif
}

#endif // PROFILEGENERATORS_H_