#include <cassert>
#include <cstdint>
#include <stdexcept>
#include <unordered_map>

enum class Failure { None, DependencyFalse, DependencyThrow, FirstType, SecondType, Reentrant };
namespace Smp {
using UInt64 = std::uint64_t;
struct ISimulator {};
namespace Publication {
struct ITypeRegistry {
    Failure failure = Failure::None;
    int dependencies = 0;
    int first = 0;
    int second = 0;
};
}
}
extern "C" bool Initialise_Recovery(Smp::ISimulator*, Smp::Publication::ITypeRegistry*);
extern "C" bool Initialise_Dependency(Smp::ISimulator* simulator, Smp::Publication::ITypeRegistry* registry) {
    ++registry->dependencies;
    if (registry->failure == Failure::DependencyFalse) return false;
    if (registry->failure == Failure::DependencyThrow) throw std::runtime_error("dependency");
    return registry->failure != Failure::Reentrant || Initialise_Recovery(simulator, registry);
}
#if ECSS_SMP_VERSION >= 202503L
extern "C" bool Finalise_Dependency(Smp::ISimulator*) { return true; }
#else
extern "C" bool Finalise_Dependency() { return true; }
#endif
namespace recovery {
struct First {
    static void _Register(Smp::Publication::ITypeRegistry* registry) {
        ++registry->first;
        if (registry->failure == Failure::FirstType) throw std::runtime_error("first type");
    }
};
void _Register_Second(Smp::Publication::ITypeRegistry* registry) {
    ++registry->second;
    if (registry->failure == Failure::SecondType) throw std::runtime_error("second type");
}
}

// @generated-package@

int main() {
    Smp::ISimulator instances[16];
    Smp::Publication::ITypeRegistry registry;
    assert(!Initialise_Recovery(nullptr, &registry));
    assert(registry.dependencies == 0);
    assert(Initialise_Recovery(&instances[0], &registry));
    assert(Initialise_Recovery(&instances[0], &registry));
    assert(registry.dependencies == 1 && registry.first == 1 && registry.second == 1);

    int index = 1;
    for (auto failure : {Failure::DependencyFalse, Failure::DependencyThrow, Failure::FirstType, Failure::SecondType}) {
        Smp::Publication::ITypeRegistry failed;
        failed.failure = failure;
        bool threw = false;
        try { assert(!Initialise_Recovery(&instances[index], &failed)); }
        catch (const std::runtime_error&) { threw = true; }
        assert(threw == (failure != Failure::DependencyFalse));
        const auto first = failed.first, second = failed.second;
        failed.failure = Failure::None;
        assert(!Initialise_Recovery(&instances[index], &failed));
        assert(failed.dependencies == 1 && failed.first == first && failed.second == second);
        assert(first == (failure == Failure::FirstType || failure == Failure::SecondType ? 1 : 0));
        assert(second == (failure == Failure::SecondType ? 1 : 0));
        ++index;
    }

    Smp::Publication::ITypeRegistry reentrant;
    reentrant.failure = Failure::Reentrant;
    assert(Initialise_Recovery(&instances[5], &reentrant));
    assert(reentrant.dependencies == 1 && reentrant.first == 1 && reentrant.second == 1);
    // Failure is local to the simulator; another simulator still initializes normally.
    Smp::Publication::ITypeRegistry independent;
    assert(Initialise_Recovery(&instances[6], &independent));
    assert(independent.dependencies == 1 && independent.first == 1 && independent.second == 1);

    // Explicit finalization ends the lifecycle, including its remembered failed state.
#if ECSS_SMP_VERSION >= 202503L
    assert(Finalise_Recovery(&instances[4]));
#else
    assert(Finalise_Recovery());
#endif
    Smp::Publication::ITypeRegistry newLifecycle;
    assert(Initialise_Recovery(&instances[4], &newLifecycle));
    assert(newLifecycle.dependencies == 1 && newLifecycle.first == 1 && newLifecycle.second == 1);
}
