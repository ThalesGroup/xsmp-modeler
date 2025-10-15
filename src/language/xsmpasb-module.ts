import type { Module } from 'langium';
import type { PartialLangiumServices } from 'langium/lsp';
import { XsmpDocumentSymbolProvider } from './lsp/document-symbol-provider.js';
import { XsmpValueConverter } from './parser/value-converter.js';
import { XsmpCommentProvider } from './lsp/comment-provider.js';
import type { XsmpServices } from './xsmp-module.js';
import { XsmpDocumentationProvider } from './lsp/documentation-provider.js';
import { XsmpRenameProvider } from './lsp/xsmp-rename-provider.js';
import { XsmpasbScopeComputation } from './references/xsmpasb-scope-computation.js';
import { XsmpasbScopeProvider } from './references/xsmpasb-scope-provider.js';

/**
 * Declaration of Xsmp services.
 */
export interface XsmpasbAddedServices {
    readonly validation: {
       // readonly XsmpasbValidator: XsmpasbValidator
    },
}

/**
 * Union of Langium default services and Xsmp custom services.
 */
export type XsmpasbServices = XsmpServices & XsmpasbAddedServices

/**
 * Dependency injection module that overrides Langium default services and contributes the
 * declared custom services. The Langium defaults can be partially specified to override only
 * selected services, while the Xsmp services must be fully specified.
 */
export const XsmpasbModule: Module<XsmpasbServices, PartialLangiumServices & XsmpasbAddedServices> = {
    references: {
        ScopeProvider: (services) => new XsmpasbScopeProvider(services),
        ScopeComputation: (services) => new XsmpasbScopeComputation(services),
    },
    validation: {
    },
    lsp: {
      //  Formatter: () => new XsmpasbFormatter(),
        DocumentSymbolProvider: (services) => new XsmpDocumentSymbolProvider(services),
 
        RenameProvider: (services) => new XsmpRenameProvider(services),
    },
    parser:
    {
        ValueConverter: () => new XsmpValueConverter(),
    },
    documentation: {
        CommentProvider: (services) => new XsmpCommentProvider(services),
        DocumentationProvider: (services) => new XsmpDocumentationProvider(services),
    },
};

