import type { Module } from 'langium';
import type { PartialLangiumServices } from 'langium/lsp';
import { XsmpDocumentSymbolProvider } from './lsp/document-symbol-provider.js';
import { XsmpValueConverter } from './parser/value-converter.js';
import { XsmpCommentProvider } from './lsp/comment-provider.js';
import type { XsmpServices } from './xsmp-module.js';
import { XsmpDocumentationProvider } from './lsp/documentation-provider.js';
import { XsmpRenameProvider } from './lsp/xsmp-rename-provider.js';
import { XsmplnkFormatter } from './lsp/xsmplnk-formatter.js';
import { XsmpPathLinker } from './references/xsmp-path-linker.js';
import { XsmpReferences } from './references/xsmp-references.js';
import { XsmplnkScopeProvider } from './references/xsmplnk-scope-provider.js';
import { XsmplnkScopeComputation } from './references/xsmplnk-scope-computation.js';
import { XsmplnkValidator } from './validation/xsmplnk-validator.js';
import { XsmpPathCodeActionProvider } from './lsp/xsmp-path-code-action.js';

/**
 * Declaration of Xsmp services.
 */
export interface XsmplnkAddedServices {
    readonly validation: {
        readonly XsmplnkValidator: XsmplnkValidator
    },
}

/**
 * Union of Langium default services and Xsmp custom services.
 */
export type XsmplnkServices = XsmpServices & XsmplnkAddedServices

/**
 * Dependency injection module that overrides Langium default services and contributes the
 * declared custom services. The Langium defaults can be partially specified to override only
 * selected services, while the Xsmp services must be fully specified.
 */
export const XsmplnkModule: Module<XsmplnkServices, PartialLangiumServices & XsmplnkAddedServices> = {
    references: {
        Linker: (services) => new XsmpPathLinker(services),
        References: (services) => new XsmpReferences(services),
        ScopeProvider: (services) => new XsmplnkScopeProvider(services),
        ScopeComputation: (services) => new XsmplnkScopeComputation(services),
    },
    validation: {
        XsmplnkValidator: (services) => new XsmplnkValidator(services),
    },
    lsp: {
        Formatter: () => new XsmplnkFormatter(),
        DocumentSymbolProvider: (services) => new XsmpDocumentSymbolProvider(services),
        CodeActionProvider: () => new XsmpPathCodeActionProvider(),
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
