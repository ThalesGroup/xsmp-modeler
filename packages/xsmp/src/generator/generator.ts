import type { AstNode, URI } from 'langium';
import type { GeneratedFiles } from './generated-files.js';

export type Task = () => Promise<void>;
export type TaskAcceptor = (task: Task) => void;

let enableGeneratedByComment: boolean = true;
let enableClangFormatting: boolean = true;

export function setGeneratedBy(value: boolean): void {
     enableGeneratedByComment = value;

} export function isGeneratedBy(): boolean {
     return enableGeneratedByComment;
}

export function setClangFormat(value: boolean): void {
     enableClangFormatting = value;
}

export function isClangFormatEnabled(): boolean {
     return enableClangFormatting;
}
export interface XsmpGenerator {
     /** Start one project generation. All tasks must write through this manifest. */
     prepareGeneration: (projectUri: URI) => GeneratedFiles
     /** Called for each valid project document after every generator has been prepared. */
     generate: (node: AstNode, projectUri: URI, acceptTask: TaskAcceptor) => void
}
