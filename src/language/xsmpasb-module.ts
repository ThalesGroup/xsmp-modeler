import type { Module } from 'langium';
import type { PartialLangiumServices } from 'langium/lsp';
import { XsmpDocumentSymbolProvider } from './lsp/document-symbol-provider.js';
import { XsmpValueConverter } from './parser/value-converter.js';
import { XsmpCommentProvider } from './lsp/comment-provider.js';
import type { XsmpServices } from './xsmp-module.js';
import { XsmpDocumentationProvider } from './lsp/documentation-provider.js';
import { XsmpRenameProvider } from './lsp/xsmp-rename-provider.js';
import { XsmpasbFormatter } from './lsp/xsmpasb-formatter.js';
import { XsmpPathLinker } from './references/xsmp-path-linker.js';
import { XsmpReferences } from './references/xsmp-references.js';
import { XsmpasbScopeComputation } from './references/xsmpasb-scope-computation.js';
import { XsmpasbValidator } from './validation/xsmpasb-validator.js';
import { XsmpasbScopeProvider } from './references/xsmpasb-scope-provider.js';
import { XsmpPathCodeActionProvider } from './lsp/xsmp-path-code-action.js';

/**
 * Declaration of Xsmp services.
 */
export interface XsmpasbAddedServices {
    readonly validation: {
       readonly XsmpasbValidator: XsmpasbValidator
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
        Linker: (services) => new XsmpPathLinker(services),
        References: (services) => new XsmpReferences(services),
        ScopeProvider: (services) => new XsmpasbScopeProvider(services),
        ScopeComputation: (services) => new XsmpasbScopeComputation(services),
    },
    validation: {
        XsmpasbValidator: (services) => new XsmpasbValidator(services),
    },
    lsp: {
        Formatter: () => new XsmpasbFormatter(),
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
