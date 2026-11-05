/** Deterministic dependency order without recursion. */
export function dependencyOrder<T>(nodes: readonly T[], dependencies: (node: T) => Iterable<T | undefined>): T[] {
    const remaining = new Map(nodes.map(node => [node, 0]));
    const dependents = new Map<T, T[]>();
    for (const node of nodes) {
        for (const dependency of new Set(dependencies(node))) {
            if (dependency === undefined || !remaining.has(dependency)) continue;
            remaining.set(node, remaining.get(node)! + 1);
            let consumers = dependents.get(dependency);
            if (!consumers) dependents.set(dependency, consumers = []);
            consumers.push(node);
        }
    }
    // The growing result is also the queue; each declaration and edge is processed once.
    const result = nodes.filter(node => remaining.get(node) === 0);
    for (const node of result) {
        for (const consumer of dependents.get(node) ?? []) {
            const count = remaining.get(consumer)! - 1;
            remaining.set(consumer, count);
            if (count === 0) result.push(consumer);
        }
    }
    if (result.length !== nodes.length) {
        throw new Error('Cannot order generated declarations: cyclic dependency.');
    }
    return result;
}
