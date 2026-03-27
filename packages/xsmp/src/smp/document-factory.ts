import { Cancellation, type LangiumDocument } from 'langium';
import type { AstNode, Mutable, URI } from 'langium';
import { DefaultLangiumDocumentFactory, DocumentState, type LangiumDocumentFactory } from 'langium';
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
            const content = await this.smpMirrorManager.getOrCreateMirrorContent(uri);
            if (content === undefined) {
                throw new Error(`No SMP mirror content is available for '${uri.toString()}'.`);
            }
            return this.createAsync<T>(uri, content, cancellationToken);
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

        const text = await this.smpMirrorManager.getOrCreateMirrorContent(document.uri);
        if (text === undefined) {
            throw new Error(`No SMP mirror content is available for '${document.uri.toString()}'.`);
        }

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
}
