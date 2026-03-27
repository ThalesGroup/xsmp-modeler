

interface Project {
    name: string
    standard: string = 'ECSS_SMP_2020'
    elements: (ProfileReference | ToolReference | Dependency | Source)[]
}
interface ProfileReference {
    profile: @Profile
}
interface ToolReference {
    tool: @Tool
}
interface Dependency {
    project: @Project
}
interface Source {
    path: string
}


interface Tool {
    name: string
}

interface Profile {
    name: string
}
