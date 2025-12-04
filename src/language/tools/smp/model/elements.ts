
export interface NamedElement {
    '@Id': string;
    '@Name': string;
    Description?: string;
    Metadata?: Metadata[];
}

export interface Document extends NamedElement {
    '@Title'?: string;
    '@Date'?: string;
    '@Creator'?: string;
    '@Version'?: string;
}

export interface Metadata extends NamedElement {
    '@xsi:type': string;
}

export interface Comment extends Metadata { }

