
export enum ViewKind {
    /**
     * The element is not made visible to the user (this is the default).
     */
    VK_None = 0,
    /**
     * The element is made visible for debugging purposes.
     * The element is not visible to end users. If the simulation infrastructure supports the selection of different user roles, then the element shall be visible to "Debug" users only.
     */
    VK_Debug = 1,
    /**
     * The element is made visible for expert users.
     * The element is not visible to end users. If the simulation infrastructure supports the selection of different user roles, then the element shall be visible to "Debug" and "Expert" users.
     */
    VK_Expert = 2,
    /**
     * The element is made visible to all users.
     */
    VK_All = 3
}