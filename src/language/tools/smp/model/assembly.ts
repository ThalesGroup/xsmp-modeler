
import type { Document, Metadata } from './elements.js';
import { Link } from './linkbase.js';
import type { SimpleValue, Value } from './types.js';

export interface Assembly extends Document {
  '@xmlns:Elements': string;
  '@xmlns:Types': string;
  '@xmlns:Catalogue': string;
  '@xmlns:Assembly': string;
  '@xmlns:Configuration': string;
  '@xmlns:xsd': string;
  '@xmlns:xsi': string;
  '@xmlns:xlink': string;
  ComponentConfiguration?: ComponentConfiguration[];
  Parameter?: TemplateArgument[];
  Model?: ModelInstance[];
}


export interface NamedElement {
  '@Name': string;
  Description?: string;
  Metadata?: Metadata[];
}

export interface TemplateArgument extends NamedElement {
}

export interface Int32Argument extends TemplateArgument {
  value: number
}
export interface StringArgument extends TemplateArgument {
  value: string
}


export interface ComponentConfiguration extends NamedElement {
  InstancePath?: string;
  FieldValue?: Value[];
  Invocation?: Invocation[];
  GlobalEventHandler?: GlobalEventHandler[];
}

export interface Invocation {

}
export interface OperationCall extends Invocation {
  '@Operation': string;
  Parameter?: ParameterValue[];
}
export interface ParameterValue {
  '@Parameter': string;
  Value?: SimpleValue[]
}
export interface PropertyValue extends Invocation {
  '@Property': string;
  Value?: SimpleValue;
}

export interface GlobalEventHandler {
  '@EntryPointName': string;
  '@GlobalEventName': string;
}



export interface ModelInstance extends NamedElement {
  '@Implementation': string;
  Assembly?: AssemblyInstance[];
  Model?: SubModelInstance[];
  Link?: Link[];
  FieldValue?: Value[];
  Invocation?: Invocation[];
  GlobalEventHandler?: GlobalEventHandler[];
}
export interface SubModelInstance extends ModelInstance {
  '@Container': string;
}


export interface AssemblyInstance extends NamedElement {
  '@Container': string;
  '@Assembly': string;
  Argument?: TemplateArgument[];
  ModelConfiguration?: ComponentConfiguration[];
  '@Configuration'?: string;
  '@LinkBase'?: string;
}
