import { Cancellation, type AstNode, type URI } from 'langium';
import pLimit from 'p-limit';
import { GeneratedFileWriter, type Task, type XsmpGenerator } from '@xsmp/core/generator';

/** Run a generator's complete lifecycle against a real output directory. */
export async function generateDocuments(
    generator: XsmpGenerator,
    nodes: readonly AstNode[],
    projectUri: URI,
    writer = new GeneratedFileWriter(),
): Promise<void> {
    const cancelToken = Cancellation.CancellationToken.None;
    const session = writer.createSession(projectUri.fsPath, cancelToken);
    const tasks: Task[] = [];
    let success = false;
    try {
        const files = generator.prepare({
            projectUri,
            cancelToken,
            createFiles: outputs => session.createFiles(generator.id, outputs),
        });
        await session.prepare();
        let traversalFailed = false;
        let traversalError: unknown;
        let collecting = true;
        try {
            for (const node of nodes) {
                generator.generate(node, {
                    projectUri, cancelToken, files,
                    acceptTask: task => {
                        if (!collecting) throw new Error('Task collection is closed.');
                        tasks.push(task);
                    },
                });
            }
        } catch (error) {
            traversalFailed = true;
            traversalError = error;
        } finally {
            collecting = false;
        }
        const limit = pLimit(8);
        const results = await Promise.allSettled(tasks.map(task => limit(task)));
        if (traversalFailed) throw traversalError;
        const rejected = results.find(result => result.status === 'rejected');
        if (rejected) throw rejected.reason;
        success = true;
    } finally {
        await session.finish(success);
    }
}
