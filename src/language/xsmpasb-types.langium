
import "./xsmpcat-types"
import "./xsmpsed-types"
import "./xsmplnk-types"
import "./xsmpcfg-types"

interface Assembly {
    name: Name
    parameters: TemplateParameter[]
    configurations: AssemblyComponentConfiguration[]
    model: ModelInstance
}

interface TemplateParameter {
    name: string
}

interface StringParameter extends TemplateParameter {
    value?: string
}
interface Int32Parameter extends TemplateParameter {
    value?: number
}


interface TemplateArgument {
    parameter:@TemplateParameter
}

interface StringArgument extends TemplateArgument {
    value: string
}
interface Int32Argument extends TemplateArgument {
    value: number
}



interface AssemblyComponentConfiguration {
    name: Path
    elements: (GlobalEventHandler|Invocation|FieldValue)[]
}

interface GlobalEventHandler {
    entryPointName: Name
    globalEventName: string
}

interface ModelInstance {
    name: Name
    implementation: @Component
    elements: (GlobalEventHandler|SubInstance|Link|Invocation|FieldValue)[]
}

interface AssemblyInstance {
    name: Name
    assembly: @Assembly
    arguments: TemplateArgument[]
    configuration?:@Configuration
    linkBase?:@LinkBase
    elements: (AssemblyComponentConfiguration)[]
}

type Name = string;

type Path = string;

interface SubInstance {
    container: Name
    instance: ModelInstance|AssemblyInstance
}


interface Invocation {
}

interface OperationCall extends Invocation {
    operation: Name
    parameters: ParameterValue[]
}
interface PropertyValue extends Invocation {
    property: Name
    value: SimpleValue
}
