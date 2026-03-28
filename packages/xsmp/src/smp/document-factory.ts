import { Cancellation, DefaultLangiumDocumentFactory, DocumentState, type AstNode, type LangiumDocument, type LangiumDocumentFactory, type Mutable, type URI } from 'langium';
import type { XsmpSharedServices } from '../xsmp-module.js';
import { isSmpMirrorDocument } from '../builtins.js';
import type { SmpMirrorManager } from './mirror-manager.js';

export class XsmpLangiumDocumentFactory extends DefaultLangiumDocumentFactory implements LangiumDocumentFactory {
    protected readonly smpMirrorManager: SmpMirrorManager;

    constructor(services: XsmpSharedServices) {
        super(services);
        this.smpMirrorManager = services.SmpMirrorManager;
    }

    override async fromUri<T extends AstNode = AstNode>(
        uri: URI,
        cancellationToken = Cancellation.CancellationToken.None,
    ): Promise<LangiumDocument<T>> {
        if (isSmpMirrorDocument(uri)) {
            return this.createAsync<T>(uri, await this.getMirrorContentOrFallback(uri), cancellationToken);
        }
        return await super.fromUri(uri, cancellationToken);
    }

    override async update<T extends AstNode = AstNode>(
        document: Mutable<LangiumDocument<T>>,
        cancellationToken: Cancellation.CancellationToken,
    ): Promise<LangiumDocument<T>> {
        if (!isSmpMirrorDocument(document.uri)) {
            return await super.update(document, cancellationToken);
        }

        const text = await this.getMirrorContentOrFallback(document.uri);

        const oldText = document.parseResult.value.$cstNode?.root.fullText;
        const textDocumentGetter = this.createTextDocumentGetter(document.uri, text);
        Object.defineProperty(document, 'textDocument', { get: textDocumentGetter });

        if (oldText !== text) {
            document.parseResult = await this.parseAsync(document.uri, text, cancellationToken);
            (document.parseResult.value as Mutable<AstNode>).$document = document;
        }
        document.state = DocumentState.Parsed;
        return document;
    }

    protected async getMirrorContentOrFallback(uri: URI): Promise<string> {
        const content = await this.smpMirrorManager.getOrCreateMirrorContent(uri);
        if (content !== undefined) {
            return content;
        }

        // VS Code can attempt to reopen readonly virtual mirror documents after the
        // underlying SMP source disappeared or was renamed. Keep the server alive and
        // surface an empty document instead of crashing the language server process.
        return '';
    }
}
