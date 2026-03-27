import type { LangiumDocument } from 'langium';
import type { XsmpServices } from 'xsmp';

export async function rebuildTestDocuments(
    services: { shared: XsmpServices['shared'] },
    documents: LangiumDocument[],
    validation: boolean = true,
): Promise<void> {
    await services.shared.workspace.DocumentBuilder.build(documents, { validation });
}
