
import type { Document } from './elements.js';
import type { Value } from './types.js';
import type { Xlink } from './xlink.js';

export interface Configuration extends Document {
    '@xmlns:Elements': string;
    '@xmlns:Types': string;
    '@xmlns:Configuration': string;
    '@xmlns:xsd': string;
    '@xmlns:xsi': string;
    '@xmlns:xlink': string;
    Include?: ConfigurationUsage[];
    Component?: ComponentConfiguration[];
}

export interface ConfigurationUsage {
    Path?: string;
    Configuration: Xlink;
}
export interface ComponentConfiguration {
    Path?: string;
    Include?: ConfigurationUsage[];
    Component?: ComponentConfiguration[];
    FieldValue?: Value[];
}