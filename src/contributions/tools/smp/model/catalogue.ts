
import type { Document, NamedElement } from './elements.js';
import type { Association, Constant, Field, LanguageType, Operation, Property, Type } from './types.js';
import type { Xlink } from './xlink.js';

export interface Catalogue extends Document {
  '@xmlns:Elements': string;
  '@xmlns:Types': string;
  '@xmlns:Catalogue': string;
  '@xmlns:xsd': string;
  '@xmlns:xsi': string;
  '@xmlns:xlink': string;
  Namespace?: Namespace[];
}

export interface Namespace extends NamedElement {
  Namespace?: Namespace[];
  Type?: Type[];
}

export interface ReferenceType extends LanguageType {
  Constant?: Constant[];
  Property?: Property[];
  Operation?: Operation[];
}

export interface Component extends ReferenceType {
  Base?: Xlink;
  Interface?: Xlink[];
  EntryPoint?: EntryPoint[];
  EventSink?: EventSink[];
  EventSource?: EventSource[];
  Field?: Field[];
  Association?: Association[];
  Container?: Container[];
  Reference?: Reference[];
}

export interface Interface extends ReferenceType {
  Base?: Xlink[];
}

export interface Model extends Component { }

export interface Service extends Component { }

export interface EntryPoint extends NamedElement {
  Input?: Xlink[];
  Output?: Xlink[];
}

export interface Container extends NamedElement {
  Type: Xlink;
  DefaultComponent?: Xlink;
  '@Lower'?: bigint;
  '@Upper'?: bigint;
}

export interface Reference extends NamedElement {
  Interface: Xlink;
  '@Lower'?: bigint;
  '@Upper'?: bigint;
}

export interface EventType extends Type {
  EventArgs?: Xlink;
}

export interface EventSource extends NamedElement {
  Type: Xlink;
  '@Multicast'?: boolean;
}

export interface EventSink extends NamedElement {
  Type: Xlink;
}
