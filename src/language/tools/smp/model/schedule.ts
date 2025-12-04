
import { TemplateArgument } from './assembly.js';
import type { Document, NamedElement } from './elements.js';
import { SimpleValue } from './types.js';
import { Xlink } from './xlink.js';

export interface Schedule extends Document {
  '@xmlns:Elements': string;
  '@xmlns:Types': string;
  '@xmlns:LinkBase': string;
  '@xmlns:Assembly': string;
  '@xmlns:Schedule': string;
  '@xmlns:xsd': string;
  '@xmlns:xsi': string;
  '@xmlns:xlink': string;
  Parameter?: TemplateArgument[];
  '@EpochTime'?: string;
  '@MissionStart'?: string;
  Task?: Task[];
  Event?: Event[];
}



export interface Task extends NamedElement {
  Activity?: Activity[];

}
export interface Activity extends NamedElement {
  '@xsi:type': string;
}

export interface CallOperation extends Activity {
  OperationPath: string;
  Parameter?: ParameterValue[];
}

export interface ParameterValue {
  '@Parameter': string;
  Value: SimpleValue;
}
export interface EmitGlobalEvent extends Activity {
  EventName: string;
  Synchronous: boolean;
}
export interface ExecuteTask extends Activity {
  Root?: string;
  Task: Xlink;
  Argument?: TemplateArgument[];
}
export interface SetProperty extends Activity {
  PropertyPath: string;
  Value: SimpleValue;
}

export interface Transfer extends Activity {
  OutputFieldPath: string;
  InputFieldPath: string;
}
export interface Trigger extends Activity {
  EntryPoint: string;
}

export interface Event extends NamedElement {
  '@xsi:type': string;
  '@CycleTime'?: string;
  '@RepeatCount'?: bigint;
  Task: Xlink;
}

export interface EpochEvent extends Event {
  '@EpochTime': string;
}
export interface MissionEvent extends Event {
  '@MissionTime': string;
}
export interface SimulationEvent extends Event {
  '@SimulationTime': string;
}
export interface ZuluEvent extends Event {
  '@ZuluTime': string;
}

export interface GlobalEventTriggeredEvent extends Event {
  '@StartEvent': string;
  '@StopEvent'?: string;
  '@Delay'?: string;
}