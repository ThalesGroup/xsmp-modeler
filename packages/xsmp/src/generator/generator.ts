import type { AstNode, URI } from 'langium';

export type Task = () => Promise<void>;
export type TaskAcceptor = (task: Task) => void;

let enableGeneratedByComment: boolean = true;

export function setGeneratedBy(value: boolean): void {
     enableGeneratedByComment = value;

} export function isGeneratedBy(): boolean {
     return enableGeneratedByComment;
}
export interface XsmpGenerator {
     generate: (node: AstNode, projectUri: URI, acceptTask: TaskAcceptor) => void
     clean: (projectUri: URI) => void
}