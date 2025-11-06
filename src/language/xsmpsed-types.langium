
import "./xsmpasb-types"

interface Schedule {
    name:string
    parameters: TemplateParameter[]
    elements:(Task|Event)[]
    epochTime?:string
    missionStart?:string
}

interface Task {
    name: string
    elements: Activity[]
}


interface Event {
    name: string
    task: @Task
    cycleTime: string="PT0S"
    repeatCount: number=0
}

interface GlobalEventTriggeredEvent extends Event {
    delay?:number
    startEvent:string
    stopEvent?:string
    //timeKind
}

interface MissionEvent extends Event {
    missionTime:string
}
interface EpochEvent extends Event {
    epochTime:string
}
interface SimulationEvent extends Event {
    simulationTime:string
}

interface ZuluEvent extends Event {
    zuluTime:string
}

interface Activity {
}


interface ExecuteTask extends Activity {
    task:@Task
    parameters: TemplateArgument[]
    root?:string
}

interface EmitGlobalEvent extends Activity {
    eventName:string
    asynchronous:boolean = false
}
interface ParameterValue {
    parameter: string
    value: SimpleValue
}
interface CallOperation extends Activity {
    operationPath:string
    parameters: ParameterValue[]
}

interface SetProperty extends Activity {
    propertyPath:string
    value: SimpleValue
}

interface Transfer extends Activity {
    outputFieldPath:string
    inputFieldPath: string
}
interface Trigger extends Activity {
    entryPoint:string
}
