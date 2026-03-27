import type { Xlink } from './xlink.js';

import type { Document } from './elements.js';

export interface Package extends Document{
    '@xmlns:Elements': string;
    '@xmlns:Types': string;
    '@xmlns:Catalogue': string;
    '@xmlns:Package': string;
    '@xmlns:xsd': string;
    '@xmlns:xsi': string;
    '@xmlns:xlink': string;
    Implementation?: Xlink[];
    Dependency?: Xlink[];
  }

