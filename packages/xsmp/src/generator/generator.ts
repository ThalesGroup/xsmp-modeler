import type { AstNode, Cancellation, URI } from 'langium';
import type { GeneratedFiles, OutputDefinition } from './generated-files.js';

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
export interface GenerationPreparationContext {
     readonly projectUri: URI;
     readonly cancelToken: Cancellation.CancellationToken;
     /** Declare named outputs once, before generation starts. */
     createFiles(outputs: Readonly<Record<string, OutputDefinition>>): GeneratedFiles;
}

export interface GenerationContext {
     readonly projectUri: URI;
     readonly cancelToken: Cancellation.CancellationToken;
     readonly files: GeneratedFiles;
     readonly acceptTask: TaskAcceptor;
}

export interface XsmpGenerator {
     /** Stable identifier within the contribution, used to track owned outputs. */
     readonly id: string;
     prepare(context: GenerationPreparationContext): GeneratedFiles;
     /** Called for each valid project document after all outputs have been prepared. */
     generate(node: AstNode, context: GenerationContext): void;
}
