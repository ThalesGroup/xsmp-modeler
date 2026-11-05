/** Derived values live exactly as long as their shared project visibility context. */
export class VisibilityCache<V> {
    protected readonly cache = new WeakMap<ReadonlySet<string>, V>();

    get(visibleUris: ReadonlySet<string>, provider: () => V): V {
        if (this.cache.has(visibleUris)) return this.cache.get(visibleUris)!;
        const value = provider();
        this.cache.set(visibleUris, value);
        return value;
    }
}
