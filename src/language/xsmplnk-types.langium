
interface LinkBase {
    name: string
    elements: ComponentLinkBase[]
}



interface ComponentLinkBase {
    name: string
    elements: (ComponentLinkBase|Link)[]
}

interface Link {
    ownerPath: string
    clientPath: string
}
interface EventLink extends Link {
}
interface FieldLink extends Link {
}
interface InterfaceLink extends Link {
    reference:string
    backReference?:string
}
