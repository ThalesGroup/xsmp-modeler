import { builtInScheme, smpMirrorScheme } from 'xsmp';

export const xsmpLanguageIds = [
    'xsmpproject',
    'xsmpcat',
    'xsmpcfg',
    'xsmpasb',
    'xsmplnk',
    'xsmpsed',
] as const;

export const xsmpReadonlySchemes = [
    builtInScheme,
    smpMirrorScheme,
] as const;

export function createXsmpDocumentSelector() {
    return [
        ...xsmpLanguageIds.map(language => ({ scheme: 'file', language })),
        ...xsmpReadonlySchemes.flatMap(scheme => xsmpLanguageIds.map(language => ({ scheme, language }))),
    ];
}

export const xsmpFileWatcherPatterns = [
    '**/xsmp.project',
    '**/*.xsmpcat',
    '**/*.xsmpcfg',
    '**/*.xsmpasb',
    '**/*.xsmplnk',
    '**/*.xsmpsed',
    '**/*.smpcat',
    '**/*.smpcfg',
    '**/*.smpasb',
    '**/*.smplnk',
    '**/*.smpsed',
] as const;
