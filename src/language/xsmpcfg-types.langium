
//import "./xsmpcat-types"
//import "./xsmpsed-types"
import "./xsmp-elements"
import "./xsmp-types"

interface Configuration extends Document {
    elements: (ConfigurationUsage|ComponentConfiguration)[]
}



interface ComponentConfiguration {
    name: string
    elements: (ConfigurationUsage|ComponentConfiguration|Value)[]
}

interface ConfigurationUsage {
    path?: string
    configuration: @Configuration
}
