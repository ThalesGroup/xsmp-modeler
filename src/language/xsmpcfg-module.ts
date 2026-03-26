import type { Module } from 'langium';
import type { PartialLangiumServices } from 'langium/lsp';
import { XsmpDocumentSymbolProvider } from './lsp/document-symbol-provider.js';
import { XsmpValueConverter } from './parser/value-converter.js';
import { XsmpCommentProvider } from './lsp/comment-provider.js';
import type { XsmpServices } from './xsmp-module.js';
import { XsmpDocumentationProvider } from './lsp/documentation-provider.js';
import { XsmpRenameProvider } from './lsp/xsmp-rename-provider.js';
import { XsmpcfgFormatter } from './lsp/xsmpcfg-formatter.js';
import { XsmpPathLinker } from './references/xsmp-path-linker.js';
import { XsmpcfgScopeComputation } from './references/xsmpcfg-scope-computation.js';
import { XsmpcfgScopeProvider } from './references/xsmpcfg-scope-provider.js';
import { XsmpcfgValidator } from './validation/xsmpcfg-validator.js';

/**
 * Declaration of Xsmp services.
 */
export interface XsmpcfgAddedServices {
    readonly validation: {
        readonly XsmpcfgValidator: XsmpcfgValidator
    },
}

/**
 * Union of Langium default services and Xsmp custom services.
 */
export type XsmpcfgServices = XsmpServices & XsmpcfgAddedServices

/**
 * Dependency injection module that overrides Langium default services and contributes the
 * declared custom services. The Langium defaults can be partially specified to override only
 * selected services, while the Xsmp services must be fully specified.
 */
export const XsmpcfgModule: Module<XsmpcfgServices, PartialLangiumServices & XsmpcfgAddedServices> = {
    references: {
        Linker: (services) => new XsmpPathLinker(services),
        ScopeProvider: (services) => new XsmpcfgScopeProvider(services),
        ScopeComputation: (services) => new XsmpcfgScopeComputation(services),
    },
    validation: {
        XsmpcfgValidator: (services) => new XsmpcfgValidator(services),
    },
    lsp: {
        Formatter: () => new XsmpcfgFormatter(),
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
