import type { Module } from 'langium';
import { XsmpprojectValidator } from './validation/xsmpproject-validator.js';
import type { PartialLangiumServices } from 'langium/lsp';
import { XsmpprojectFormatter } from './lsp/xsmpproject-formatter.js';
import { XsmpDocumentSymbolProvider } from './lsp/document-symbol-provider.js';
import { XsmpprojectCompletionProvider } from './lsp/xsmpproject-completion-provider.js';
import { XsmpCommentProvider } from './lsp/comment-provider.js';
import type { XsmpServices } from './xsmp-module.js';
import { XsmpprojectTokenBuilder } from './parser/xsmpproject-token-builder.js';
import { XsmpRenameProvider } from './lsp/xsmp-rename-provider.js';
import { XsmpprojectScopeProvider } from './references/xsmpproject-scope-provider.js';

/**
 * Declaration of custom services.
 */
export interface XsmpprojectAddedServices {
    readonly validation: {
        readonly XsmpprojectValidator: XsmpprojectValidator
    },
}

/**
 * Union of Langium default services and your custom services.
 */
export type XsmpprojectServices = XsmpServices & XsmpprojectAddedServices

/**
 * Dependency injection module that overrides Langium default services and contributes the
 * declared custom services. The Langium defaults can be partially specified to override only
 * selected services, while the Xsmp services must be fully specified.
 */
export const XsmpprojectModule: Module<XsmpprojectServices, PartialLangiumServices & XsmpprojectAddedServices> = {
    validation: {
        XsmpprojectValidator: (services) => new XsmpprojectValidator(services)
    },
    lsp: {
        Formatter: () => new XsmpprojectFormatter(),
        DocumentSymbolProvider: (services) => new XsmpDocumentSymbolProvider(services),
        CompletionProvider: (services) => new XsmpprojectCompletionProvider(services),
        RenameProvider: (services) => new XsmpRenameProvider(services),
    },
    documentation: {
        CommentProvider: (services) => new XsmpCommentProvider(services),
    },
    parser: {
        TokenBuilder: () => new XsmpprojectTokenBuilder(),
    },
    references: {
        ScopeProvider: (services) => new XsmpprojectScopeProvider(services),
    },
};
