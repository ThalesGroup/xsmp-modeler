import { NotificationType } from 'vscode-languageserver';

export interface SmpMirrorsChangedParams {
    readonly changed: string[];
    readonly deleted: string[];
}

export const SmpMirrorsChangedNotification = new NotificationType<SmpMirrorsChangedParams>('xsmp/smpMirrorsChanged');
