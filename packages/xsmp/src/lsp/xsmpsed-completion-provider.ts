import { AstUtils, type GrammarAST } from 'langium';
import type { AstNodeDescription, ReferenceInfo } from 'langium';
import type { CompletionAcceptor, CompletionContext, NextFeature } from 'langium/lsp';
import * as ast from '../generated/ast-partial.js';
import type { XsmpsedServices } from '../xsmpsed-module.js';
import { XsmpCompletionProviderBase } from './xsmp-completion-provider-base.js';

export class XsmpsedCompletionProvider extends XsmpCompletionProviderBase {
    protected readonly snippetOnlyKeywords = new Set([
        'schedule',
        'task',
        'event',
        'call',
        'property',
        'transfer',
        'trig',
        'execute',
        'emit',
    ]);

    constructor(services: XsmpsedServices) {
        super(services);
    }

    protected override completionForKeyword(context: CompletionContext, keyword: GrammarAST.Keyword, acceptor: CompletionAcceptor) {
        if (this.snippetOnlyKeywords.has(keyword.value)) {
            return;
        }
        return super.completionForKeyword(context, keyword, acceptor);
    }

    protected override createKeywordSnippets(context: CompletionContext, keyword: GrammarAST.Keyword, acceptor: CompletionAcceptor): void {
        switch (keyword.value) {
            case 'schedule':
                acceptor(context, this.createKeywordSnippet(keyword, 'schedule ${1:Name}\n$0', 'Schedule Definition'));
                break;
        }
    }

    protected override addContextualCompletions(context: CompletionContext, _next: NextFeature, acceptor: CompletionAcceptor): void {
        this.addStandaloneCompletions(context, acceptor);
    }

    protected override addStandaloneCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        this.addStatementSnippets(context, acceptor);
        this.addTaskStatementCompletions(context, acceptor);
        this.addActivityReferenceCompletions(context, acceptor);
        this.addTypedValueCompletions(context, acceptor);
    }

    protected override createEnrichedReferenceCompletionItem(
        refInfo: ReferenceInfo,
        _context: CompletionContext,
        nodeDescription: AstNodeDescription,
    ) {
        if (ast.isConcretePathNamedSegment(refInfo.container)) {
            const path = ast.isPath(refInfo.container.$container)
                ? refInfo.container.$container
                : AstUtils.getContainerOfType(refInfo.container.$container, ast.isPath);
            if (!path) {
                return undefined;
            }

            if (ast.isCallOperation(path.$container) && ast.isOperation(nodeDescription.node)) {
                return this.createReferenceLikeItem(
                    nodeDescription,
                    this.createOperationCallText(nodeDescription.node, 'l2'),
                    `Operation of ${nodeDescription.node.$container.name}.`
                );
            }

            if (ast.isSetProperty(path.$container) && ast.isProperty(nodeDescription.node)) {
                if (!nodeDescription.name) {
                    return undefined;
                }
                return this.createReferenceLikeItem(
                    nodeDescription,
                    this.createPropertyAssignmentText(nodeDescription.name, nodeDescription.node.type?.ref, 'l2'),
                    `Property of ${nodeDescription.node.$container.name}.`
                );
            }
        }

        if (refInfo.container.$type === ast.Task.$type && refInfo.property === ast.Task.component && ast.isComponent(nodeDescription.node)) {
            return this.createReferenceLikeItem(
                nodeDescription,
                nodeDescription.name,
                `Execution context component ${nodeDescription.name}.`
            );
        }

        if (ast.isExecuteTask(refInfo.container.$container) && refInfo.property === ast.ExecuteTask.task && ast.isTask(nodeDescription.node)) {
            return this.createReferenceLikeItem(
                nodeDescription,
                this.createExecuteTaskText(nodeDescription.node),
                `Schedule task ${nodeDescription.name}.`
            );
        }

        return undefined;
    }

    protected addStatementSnippets(context: CompletionContext, acceptor: CompletionAcceptor): void {
        if (!this.isAtStatementPrefix(context)) {
            return;
        }
        const schedule = this.getRecoveryContainerOfType(context, ast.isSchedule);
        const task = this.getRecoveryContainerOfType(context, ast.isTask);

        if (!schedule && !task) {
            acceptor(context, this.createSnippetItem('Schedule', 'schedule ${1:Name}\n$0', 'Schedule Definition'));
            return;
        }

        if (task) {
            acceptor(context, this.createSnippetItem('Operation Call', 'call ${1:operation}($0)', 'Operation Call'));
            acceptor(context, this.createSnippetItem('Property Value', 'property ${1:path} = ${2:value}', 'Property Value'));
            acceptor(context, this.createSnippetItem('Field Transfer', 'transfer ${1:output} -> ${2:input}', 'Field Transfer'));
            acceptor(context, this.createSnippetItem('Entry Point Trigger', 'trig ${1:path}', 'Entry Point Trigger'));
            acceptor(context, this.createSnippetItem('Execute Task', 'execute ${1:Task} at ${2:path}', 'Execute Task'));
            acceptor(context, this.createSnippetItem('Emit Global Event', 'emit "${1:GlobalEvent}"', 'Emit Global Event'));
            return;
        }

        if (schedule) {
            acceptor(context, this.createSnippetItem('Task', 'task ${1:Name}${2: on demo.Component}\n{\n\t$0\n}', 'Task Definition'));
            this.addEventSnippets(context, acceptor);
        }
    }

    protected addEventSnippets(context: CompletionContext, acceptor: CompletionAcceptor): void {
        const tasks = this.getCrossReferenceNames(context, ast.ExecuteTask, ast.ExecuteTask.task);
        const task = this.createChoicePlaceholder(1, tasks, 'Task');
        acceptor(context, this.createSnippetItem('Event Epoch', `event ${task} epoch "${this.createPlaceholder(2, '2025-01-01T00:00:00Z')}"`, 'Epoch Event'));
        acceptor(context, this.createSnippetItem('Event Mission', `event ${task} mission "${this.createPlaceholder(2, 'PT10S')}"`, 'Mission Event'));
        acceptor(context, this.createSnippetItem('Event Simulation', `event ${task} simulation "${this.createPlaceholder(2, 'PT10S')}"`, 'Simulation Event'));
        acceptor(context, this.createSnippetItem('Event Zulu', `event ${task} zulu "${this.createPlaceholder(2, '2025-01-01T00:00:00Z')}"`, 'Zulu Event'));
        acceptor(context, this.createSnippetItem('Event Global Trigger', `event ${task} on "${this.createPlaceholder(2, 'PlatformReady')}" using ${this.createChoicePlaceholder(3, ['mission', 'epoch', 'simulation', 'zulu'], 'mission')}`, 'Global Event Triggered Event'));
    }

    protected addTaskStatementCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        if (!this.isAtStatementPrefix(context)) {
            return;
        }
        const task = this.getRecoveryContainerOfType(context, ast.isTask);
        const executionContext = task?.component?.ref;
        const localComponent = ast.isComponent(executionContext) ? executionContext : undefined;
        if (!task) {
            return;
        }

        if (localComponent) {
            for (const candidate of this.getOperations(localComponent)) {
                if (!candidate.name) {
                    continue;
                }
                acceptor(context, this.createContextualValueItem(
                    context,
                    `call ${candidate.name}`,
                    `call ${this.createOperationCallText(candidate, 'l2')}`,
                    `Operation call for ${candidate.name}.`
                ));
            }

            for (const candidate of this.getProperties(localComponent)) {
                if (!candidate.name) {
                    continue;
                }
                acceptor(context, this.createContextualValueItem(
                    context,
                    `property ${candidate.name}`,
                    `property ${this.createPropertyAssignmentText(candidate.name, candidate.type?.ref, 'l2')}`,
                    `Property value for ${candidate.name}.`
                ));
            }

            for (const candidate of this.getEntryPoints(localComponent)) {
                if (!candidate.name) {
                    continue;
                }
                acceptor(context, this.createContextualValueItem(
                    context,
                    `trig ${candidate.name}`,
                    `trig ${this.createTriggerText(candidate.name)}`,
                    `Trigger entry point ${candidate.name}.`
                ));
            }

            const outputFields = this.l2PathResolver.getComponentMembersByKind(localComponent, ['outputField']);
            const inputFields = this.l2PathResolver.getComponentMembersByKind(localComponent, ['inputField']);
            for (const outputField of outputFields) {
                if (!ast.isField(outputField) || !outputField.name) {
                    continue;
                }
                for (const inputField of inputFields) {
                    if (!ast.isField(inputField) || !inputField.name) {
                        continue;
                    }
                    acceptor(context, this.createContextualValueItem(
                        context,
                        `transfer ${outputField.name} -> ${inputField.name}`,
                        `transfer ${outputField.name} -> ${inputField.name}`,
                        `Transfer from output ${outputField.name} to input ${inputField.name}.`
                    ));
                }
            }
        }

        const schedule = AstUtils.getContainerOfType(task, ast.isSchedule);
        for (const candidate of schedule?.elements ?? []) {
            if (ast.isTask(candidate) && candidate !== task) {
                acceptor(context, this.createContextualValueItem(
                    context,
                    `execute ${candidate.name ?? 'Task'}`,
                    `execute ${this.createExecuteTaskText(candidate)}`,
                    `Execute task ${candidate.name ?? '<unknown>'}.`
                ));
            }
        }
    }

    protected addTypedValueCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        if (!this.isAfterEquals(context)) {
            return;
        }
        const node = this.getRecoveryAstNode(context);
        const setProperty = AstUtils.getContainerOfType(node, ast.isSetProperty);
        if (setProperty) {
            const targetType = setProperty.propertyPath
                ? this.l2PathResolver.getScheduleActivityPathResolution(setProperty.propertyPath).finalType
                : undefined;
            for (const item of this.getSimpleValueCompletions(targetType, 'l2', false)) {
                acceptor(context, item);
            }
            return;
        }

        const parameterValue = AstUtils.getContainerOfType(node, ast.isParameterValue);
        const callOperation = parameterValue ? AstUtils.getContainerOfType(parameterValue, ast.isCallOperation) : undefined;
        if (callOperation && parameterValue) {
            const operation = callOperation.operationPath
                ? this.l2PathResolver.getScheduleActivityPathResolution(callOperation.operationPath).finalElement
                : undefined;
            const parameter = ast.isOperation(operation)
                ? operation.parameter.find(candidate => candidate.name === parameterValue.parameter)
                : undefined;
            for (const item of this.getSimpleValueCompletions(parameter?.type?.ref, 'l2', false)) {
                acceptor(context, item);
            }
            return;
        }

        const templateArgument = AstUtils.getContainerOfType(node, ast.isTemplateArgument);
        if (templateArgument) {
            if (ast.isStringArgument(templateArgument)) {
                acceptor(context, this.createValueItem('""', '""', 'String template argument.'));
            } else if (ast.isInt32Argument(templateArgument)) {
                acceptor(context, this.createValueItem('0', '0', 'Int32 template argument.'));
            }
        }
    }

    protected addActivityReferenceCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        const linePrefix = this.getLinePrefix(context);
        const task = this.getRecoveryContainerOfType(context, ast.isTask);
        const executionContext = task?.component?.ref;
        const localComponent = ast.isComponent(executionContext) ? executionContext : undefined;

        if (localComponent && /^\s*call\s+[\w./{}]*$/.test(linePrefix)) {
            for (const candidate of this.getOperations(localComponent)) {
                if (!candidate.name) {
                    continue;
                }
                acceptor(context, this.createContextualValueItem(
                    context,
                    candidate.name,
                    this.createOperationCallText(candidate, 'l2'),
                    `Operation of ${candidate.$container.name}.`
                ));
            }
        }

        if (localComponent && /^\s*property\s+[\w./{}]*$/.test(linePrefix)) {
            for (const candidate of this.getProperties(localComponent)) {
                if (!candidate.name) {
                    continue;
                }
                acceptor(context, this.createContextualValueItem(
                    context,
                    candidate.name,
                    this.createPropertyAssignmentText(candidate.name, candidate.type?.ref, 'l2'),
                    `Property of ${candidate.$container.name}.`
                ));
            }
        }

        const executeTask = this.getRecoveryContainerOfType(context, ast.isExecuteTask);
        if (executeTask && /^\s*execute\s+\w*$/.test(linePrefix)) {
            const schedule = AstUtils.getContainerOfType(executeTask, ast.isSchedule);
            for (const candidate of schedule?.elements ?? []) {
                if (ast.isTask(candidate)) {
                    acceptor(context, this.createContextualValueItem(
                        context,
                        candidate.name ?? 'Task',
                        this.createExecuteTaskText(candidate),
                        `Schedule task ${candidate.name ?? '<unknown>'}.`
                    ));
                }
            }
        }
    }
    protected createExecuteTaskText(task: ast.Task): string {
        const schedule = AstUtils.getContainerOfType(task, ast.isSchedule);
        const parameters = schedule?.parameters ?? [];
        if (parameters.length === 0) {
            return task.name ?? 'Task';
        }
        const templateArguments = parameters.map((parameter, index) => {
            const defaultValue = ast.isStringParameter(parameter)
                ? (parameter.value ?? '"value"')
                : ast.isInt32Parameter(parameter)
                    ? (parameter.value?.toString() ?? '0')
                    : 'value';
            return `${parameter.name ?? `arg${index + 1}`} = ${this.createPlaceholder(index + 1, defaultValue)}`;
        });
        return `${task.name ?? 'Task'}<${templateArguments.join(', ')}> at ${this.createPlaceholder(parameters.length + 1, 'path')}`;
    }
}
