import { AstUtils, type AstNode, type ValidationAcceptor, type ValidationChecks } from 'langium';
import * as ast from '../generated/ast-partial.js';
import type { XsmpsedServices } from '../xsmpsed-module.js';
import {
    checkNonNegativeBigInt,
    isAbsolutePath,
    checkValidDateTime,
    checkValidDuration,
    checkNoParentTraversal,
} from './instance-validator-utils.js';
import { checkName, checkUniqueDocumentName } from './name-validator-utils.js';
import type { XsmpInstancePathResolver } from '../references/xsmp-instance-path-resolver.js';
import * as XsmpUtils from '../utils/xsmp-utils.js';
import { checkTemplatedPathSegments, collectUsedTemplateParameterNames, createTemplateBindings, warnUnusedTemplateParameters } from './template-parameter-validator-utils.js';
import { XsmpcfgValidator } from './xsmpcfg-validator.js';

export function registerXsmpsedValidationChecks(services: XsmpsedServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.XsmpsedValidator;
    const checks: ValidationChecks<ast.XsmpAstType> = {
        Schedule: validator.checkSchedule,
        Task: validator.checkTask,
        StringParameter: validator.checkStringParameter,
        Int32Parameter: validator.checkInt32Parameter,
        IntValue: validator.checkIntValue,
        FloatValue: validator.checkFloatValue,
        Trigger: validator.checkTrigger,
        Transfer: validator.checkTransfer,
        SetProperty: validator.checkSetProperty,
        CallOperation: validator.checkCallOperation,
        ExecuteTask: validator.checkExecuteTask,
        MissionEvent: validator.checkMissionEvent,
        SimulationEvent: validator.checkSimulationEvent,
        EpochEvent: validator.checkEpochEvent,
        ZuluEvent: validator.checkZuluEvent,
        GlobalEventTriggeredEvent: validator.checkGlobalEventTriggeredEvent,
    };
    registry.register(checks, validator, 'fast');
}

export class XsmpsedValidator extends XsmpcfgValidator {
    protected readonly instancePathResolver: XsmpInstancePathResolver;

    constructor(services: XsmpsedServices) {
        super(services);
        this.instancePathResolver = services.shared.InstancePathResolver;
    }

    checkSchedule(schedule: ast.Schedule, accept: ValidationAcceptor): void {
        checkName(accept, schedule, schedule.name, ast.Schedule.name);
        checkUniqueDocumentName(accept, this.indexManager, schedule);
        checkValidDateTime(accept, schedule, schedule.epochTime, ast.Schedule.epochTime, 'EpochTime');
        checkValidDateTime(accept, schedule, schedule.missionStart, ast.Schedule.missionStart, 'MissionStart');

        const seen = new Set<string>();
        for (const parameter of schedule.parameters) {
            if (parameter.name) {
                if (seen.has(parameter.name)) {
                    accept('error', 'Duplicated template argument name.', { node: parameter, property: ast.TemplateParameter.name });
                } else {
                    seen.add(parameter.name);
                }
            }
        }

        const stringParameters = schedule.parameters.filter(ast.isStringParameter);
        const hasRootParameter = stringParameters.length > 0;
        const hasAnyRelativePath = schedule.elements.filter(ast.isTask).some(task => task.elements.some(activity => this.activityUsesRelativePath(activity)));
        if (!hasRootParameter) {
            accept('error', 'A Schedule shall declare at least one String8 Template Argument for the root path.', {
                node: schedule,
                keyword: 'schedule'
            });
        }

        const usedTemplateNames = collectUsedTemplateParameterNames(schedule, this.identifierPatternService);
        if (hasAnyRelativePath) {
            for (const parameter of stringParameters) {
                if (parameter.name) {
                    usedTemplateNames.add(parameter.name);
                }
            }
        } else if (stringParameters[0]?.name) {
            // The first String8 parameter acts as the implicit schedule root anchor.
            usedTemplateNames.add(stringParameters[0].name);
        }
        warnUnusedTemplateParameters(schedule.parameters, usedTemplateNames, accept);
    }

    checkTask(task: ast.Task, accept: ValidationAcceptor): void {
        checkName(accept, task, task.name, ast.Task.name);
    }

    checkStringParameter(parameter: ast.StringParameter, accept: ValidationAcceptor): void {
        if (!AstUtils.getContainerOfType(parameter, ast.isSchedule)) {
            return;
        }
        checkName(accept, parameter, parameter.name, ast.TemplateParameter.name);
        if (parameter.value === undefined) {
            accept('error', 'A Template Argument shall have a Value feature.', { node: parameter, property: ast.StringParameter.value });
        }
    }

    checkInt32Parameter(parameter: ast.Int32Parameter, accept: ValidationAcceptor): void {
        if (!AstUtils.getContainerOfType(parameter, ast.isSchedule)) {
            return;
        }
        checkName(accept, parameter, parameter.name, ast.TemplateParameter.name);
        if (parameter.value === undefined) {
            accept('error', 'A Template Argument shall have a Value feature.', { node: parameter, property: ast.Int32Parameter.value });
        }
    }

    checkTrigger(trigger: ast.Trigger, accept: ValidationAcceptor): void {
        this.checkActivityPath(trigger.entryPoint, accept);
    }

    checkTransfer(transfer: ast.Transfer, accept: ValidationAcceptor): void {
        this.checkActivityPath(transfer.outputFieldPath, accept);
        this.checkActivityPath(transfer.inputFieldPath, accept);
    }

    checkSetProperty(property: ast.SetProperty, accept: ValidationAcceptor): void {
        const propertyPath = property.propertyPath;
        this.checkActivityPath(propertyPath, accept);
        if (!propertyPath || propertyPath.unsafe || !property.value) {
            return;
        }
        const resolution = this.instancePathResolver.getScheduleActivityPathResolution(propertyPath);
        if (resolution.active && !resolution.invalidMessage && resolution.finalType) {
            this.checkValueAgainstType(property.value, resolution.finalType, accept);
        }
    }

    checkCallOperation(call: ast.CallOperation, accept: ValidationAcceptor): void {
        const operationPath = call.operationPath;
        this.checkActivityPath(operationPath, accept);
        const resolution = !operationPath || operationPath.unsafe
            ? undefined
            : this.instancePathResolver.getScheduleActivityPathResolution(operationPath);
        if (resolution?.active && !resolution.invalidMessage && ast.isOperation(resolution.finalElement)) {
            this.checkCallParameters(call, resolution.finalElement, accept);
        }
        const seen = new Set<string>();
        for (let index = 0; index < call.parameters.length; index++) {
            const parameter = call.parameters[index];
            if (!parameter.parameter) {
                continue;
            }
            if (seen.has(parameter.parameter)) {
                accept('error', 'Duplicated parameter name.', { node: call, property: ast.CallOperation.parameters, index });
            } else {
                seen.add(parameter.parameter);
            }
        }
    }

    checkExecuteTask(execute: ast.ExecuteTask, accept: ValidationAcceptor): void {
        if (!execute.root || execute.root.unsafe) {
            return;
        }
        if (!this.checkPathTemplateParameters(execute.root, accept)) {
            return;
        }
        checkNoParentTraversal(accept, execute, execute.root, ast.ExecuteTask.root);
        const resolution = this.instancePathResolver.getScheduleActivityPathResolution(execute.root);
        this.acceptPathError(resolution.invalidMessage, resolution.invalidNode, accept);
        const expectedTask = execute.task?.ref;
        const expectedComponent = expectedTask ? this.instancePathResolver.getEffectiveTaskExecutionContext(expectedTask) : undefined;
        if (!resolution.active || resolution.invalidMessage || !resolution.finalComponent || !expectedComponent) {
            return;
        }
        if (resolution.finalComponent !== expectedComponent && !XsmpUtils.isBaseOfComponent(expectedComponent, resolution.finalComponent)) {
            accept('error', `The root path shall resolve to a Component compatible with the execution context of task ${execute.task?.$refText ?? '<unknown>'}.`, {
                node: execute,
                property: ast.ExecuteTask.root
            });
        }
    }

    checkMissionEvent(event: ast.MissionEvent, accept: ValidationAcceptor): void {
        this.checkEventBase(event, accept);
        checkValidDuration(accept, event, event.missionTime, 'missionTime', 'MissionTime');
    }

    checkSimulationEvent(event: ast.SimulationEvent, accept: ValidationAcceptor): void {
        this.checkEventBase(event, accept);
        checkValidDuration(accept, event, event.simulationTime, 'simulationTime', 'SimulationTime');
    }

    checkEpochEvent(event: ast.EpochEvent, accept: ValidationAcceptor): void {
        this.checkEventBase(event, accept);
        checkValidDateTime(accept, event, event.epochTime, 'epochTime', 'EpochTime');
    }

    checkZuluEvent(event: ast.ZuluEvent, accept: ValidationAcceptor): void {
        this.checkEventBase(event, accept);
        checkValidDateTime(accept, event, event.zuluTime, 'zuluTime', 'ZuluTime');
    }

    checkGlobalEventTriggeredEvent(event: ast.GlobalEventTriggeredEvent, accept: ValidationAcceptor): void {
        this.checkEventBase(event, accept);
        checkValidDuration(accept, event, event.delay, 'delay', 'Delay');
    }

    private checkEventBase(event: ast.Event, accept: ValidationAcceptor): void {
        const schedule = AstUtils.getContainerOfType(event, ast.isSchedule);
        const taskSchedule = event.task?.ref ? AstUtils.getContainerOfType(event.task.ref, ast.isSchedule) : undefined;
        if (schedule && taskSchedule && schedule !== taskSchedule) {
            accept('error', 'An Event shall be associated with a Task defined in the same Schedule.', {
                node: event,
                property: ast.Event.task
            });
        }
        checkValidDuration(accept, event, event.cycleTime, 'cycleTime', 'CycleTime');
        checkNonNegativeBigInt(accept, event, event.repeatCount, 'repeatCount', 'RepeatCount');
    }

    private activityUsesRelativePath(activity: ast.Activity): boolean {
        switch (activity.$type) {
            case ast.Trigger.$type:
                return !isAbsolutePath((activity as ast.Trigger).entryPoint);
            case ast.Transfer.$type:
                return !isAbsolutePath((activity as ast.Transfer).outputFieldPath)
                    || !isAbsolutePath((activity as ast.Transfer).inputFieldPath);
            case ast.SetProperty.$type:
                return !isAbsolutePath((activity as ast.SetProperty).propertyPath);
            case ast.CallOperation.$type:
                return !isAbsolutePath((activity as ast.CallOperation).operationPath);
            case ast.ExecuteTask.$type:
                return (activity as ast.ExecuteTask).root !== undefined && !isAbsolutePath((activity as ast.ExecuteTask).root);
            default:
                return false;
        }
    }

    private checkActivityPath(path: ast.Path | undefined, accept: ValidationAcceptor): void {
        if (!path) {
            return;
        }
        if (path.unsafe) {
            return;
        }
        if (!this.checkPathTemplateParameters(path, accept)) {
            return;
        }
        checkNoParentTraversal(accept, path, path, ast.Path.elements);
        const resolution = this.instancePathResolver.getScheduleActivityPathResolution(path);
        this.acceptPathError(resolution.invalidMessage, resolution.invalidNode, accept);
    }

    private checkCallParameters(call: ast.CallOperation, operation: ast.Operation, accept: ValidationAcceptor): void {
        const parameters = new Map(operation.parameter.filter((parameter): parameter is ast.Parameter & { name: string } => !!parameter.name).map(parameter => [parameter.name, parameter]));
        for (let index = 0; index < call.parameters.length; index++) {
            const parameter = call.parameters[index];
            if (!parameter.parameter) {
                continue;
            }
            const target = parameters.get(parameter.parameter);
            if (!target) {
                accept('error', `The parameter '${parameter.parameter}' shall resolve to a Parameter of operation ${operation.name}.`, {
                    node: call,
                    property: ast.CallOperation.parameters,
                    index
                });
                continue;
            }
            if (target.type?.ref && parameter.value) {
                this.checkValueAgainstType(parameter.value, target.type.ref, accept);
            }
        }
    }

    protected override getExpectedTypeForValue(value: ast.Value): ast.Type | undefined {
        const container = value.$container;
        if (!container) {
            return undefined;
        }
        if (ast.isSetProperty(container) && container.value === value) {
            return this.getSetPropertyValueType(container);
        }
        if (ast.isParameterValue(container) && container.value === value) {
            return this.getParameterValueType(container);
        }
        return super.getExpectedTypeForValue(value);
    }

    protected getSetPropertyValueType(setProperty: ast.SetProperty): ast.Type | undefined {
        if (!setProperty.propertyPath || setProperty.propertyPath.unsafe) {
            return undefined;
        }
        const resolution = this.instancePathResolver.getScheduleActivityPathResolution(setProperty.propertyPath);
        if (!resolution.active || resolution.invalidMessage) {
            return undefined;
        }
        return resolution.finalType;
    }

    protected getParameterValueType(parameterValue: ast.ParameterValue): ast.Type | undefined {
        if (!parameterValue.parameter) {
            return undefined;
        }
        const call = AstUtils.getContainerOfType(parameterValue, ast.isCallOperation);
        const operationPath = call?.operationPath;
        if (!operationPath || operationPath.unsafe) {
            return undefined;
        }
        const resolution = this.instancePathResolver.getScheduleActivityPathResolution(operationPath);
        if (!resolution.active || resolution.invalidMessage || !ast.isOperation(resolution.finalElement)) {
            return undefined;
        }
        return resolution.finalElement.parameter.find(parameter => parameter.name === parameterValue.parameter)?.type?.ref;
    }

    protected override checkPathTemplateParameters(path: ast.Path, accept: ValidationAcceptor): boolean {
        const templateContext = this.getPathTemplateContext(path);
        const available = new Set(templateContext.parameters.map(parameter => parameter.name));
        return checkTemplatedPathSegments(
            path,
            available,
            templateContext.bindings,
            this.identifierPatternService,
            this.pathService,
            accept,
            templateName => `The placeholder '{${templateName}}' shall resolve to a Template Argument of the ${templateContext.messageContext}.`,
        );
    }

    protected override getPathTemplateContext(path: ast.Path): {
        parameters: readonly ast.TemplateParameter[];
        bindings: Map<string, string>;
        messageContext: string;
    } {
        const schedule = AstUtils.getContainerOfType(path, ast.isSchedule);
        const task = AstUtils.getContainerOfType(path, ast.isTask);
        const assembly = ast.isAssembly(task?.context?.ref) ? task.context.ref : undefined;
        const scheduleBindings = createTemplateBindings(schedule?.parameters ?? []);
        const assemblyBindings = createTemplateBindings(assembly?.parameters ?? []);
        const bindings = new Map<string, string>([
            ...scheduleBindings.entries(),
            ...assemblyBindings.entries(),
        ]);
        if (assembly && schedule?.parameters.length) {
            return {
                parameters: [...schedule.parameters, ...assembly.parameters],
                bindings,
                messageContext: 'enclosing Schedule or inherited Assembly context',
            };
        }
        if (assembly) {
            return {
                parameters: assembly.parameters,
                bindings,
                messageContext: 'inherited Assembly context',
            };
        }
        return {
            parameters: schedule?.parameters ?? [],
            bindings: scheduleBindings,
            messageContext: 'enclosing Schedule',
        };
    }

    protected override acceptPathError(message: string | undefined, node: AstNode | undefined, accept: ValidationAcceptor): void {
        if (message && node) {
            accept('error', message, { node });
        }
    }
}
