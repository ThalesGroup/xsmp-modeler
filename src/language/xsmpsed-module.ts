import type { Module } from 'langium';
import type { PartialLangiumServices } from 'langium/lsp';
import { XsmpDocumentSymbolProvider } from './lsp/document-symbol-provider.js';
import { XsmpValueConverter } from './parser/value-converter.js';
import { XsmpCommentProvider } from './lsp/comment-provider.js';
import type { XsmpServices } from './xsmp-module.js';
import { XsmpDocumentationProvider } from './lsp/documentation-provider.js';
import { XsmpRenameProvider } from './lsp/xsmp-rename-provider.js';
import { XsmpsedScopeComputation } from './references/xsmpsed-scope-computation.js';
import { XsmpsedScopeProvider } from './references/xsmpsed-scope-provider.js';
import { XsmpsedValidator } from './validation/xsmpsed-validator.js';

/**
 * Declaration of Xsmp services.
 */
export interface XsmpsedAddedServices {
    readonly validation: {
        readonly XsmpsedValidator: XsmpsedValidator
    },
}

/**
 * Union of Langium default services and Xsmp custom services.
 */
export type XsmpsedServices = XsmpServices & XsmpsedAddedServices

/**
 * Dependency injection module that overrides Langium default services and contributes the
 * declared custom services. The Langium defaults can be partially specified to override only
 * selected services, while the Xsmp services must be fully specified.
 */
export const XsmpsedModule: Module<XsmpsedServices, PartialLangiumServices & XsmpsedAddedServices> = {
    references: {
        ScopeProvider: (services) => new XsmpsedScopeProvider(services),
        ScopeComputation: (services) => new XsmpsedScopeComputation(services),
    },
    validation: {
        XsmpsedValidator: (services) => new XsmpsedValidator(services),
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
