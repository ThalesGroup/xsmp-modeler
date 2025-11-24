
import type { Document } from './elements.js';

export interface LinkBase extends Document {
  '@xmlns:Elements': string;
  '@xmlns:LinkBase': string;
  '@xmlns:xsd': string;
  '@xmlns:xsi': string;
  '@xmlns:xlink': string;
  Component?: ComponentLinkBase[];
}


export interface ComponentLinkBase {
  '@Path': string;
  Link?: Link[];
  Component?: ComponentLinkBase[];
}

export interface Link {
  '@OwnerPath': string;
  '@ClientPath': string;
}

export interface EventLink extends Link {

}
export interface FieldLink extends Link {

}
export interface InterfaceLink extends Link {
  '@Reference': string;
  '@BackReference'?: string;
}