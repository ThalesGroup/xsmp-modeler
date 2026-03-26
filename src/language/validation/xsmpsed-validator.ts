import { AstUtils, type ValidationAcceptor, type ValidationChecks } from 'langium';
import * as ast from '../generated/ast-partial.js';
import type { XsmpsedServices } from '../xsmpsed-module.js';
import {
    checkNoParentTraversal,
    checkNonNegativeBigInt,
    checkValidDateTime,
    checkValidDuration
} from './l2-validator-utils.js';
import { checkName } from './name-validator-utils.js';

export function registerXsmpsedValidationChecks(services: XsmpsedServices) {
    const registry = services.validation.ValidationRegistry;
    const validator = services.validation.XsmpsedValidator;
    const checks: ValidationChecks<ast.XsmpAstType> = {
        Schedule: validator.checkSchedule,
        Task: validator.checkTask,
        StringParameter: validator.checkStringParameter,
        Int32Parameter: validator.checkInt32Parameter,
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

export class XsmpsedValidator {
    constructor(_services: XsmpsedServices) { }

    checkSchedule(schedule: ast.Schedule, accept: ValidationAcceptor): void {
        checkName(accept, schedule, schedule.name, 'name');
        checkValidDateTime(accept, schedule, schedule.epochTime, 'epochTime', 'EpochTime');
        checkValidDateTime(accept, schedule, schedule.missionStart, 'missionStart', 'MissionStart');

        const seen = new Set<string>();
        for (const parameter of schedule.parameters) {
            if (parameter.name) {
                if (seen.has(parameter.name)) {
                    accept('error', 'Duplicated template argument name.', { node: parameter, property: 'name' });
                } else {
                    seen.add(parameter.name);
                }
            }
        }

        const hasRootParameter = schedule.parameters.some(ast.isStringParameter);
        const hasRelativePath = schedule.elements.filter(ast.isTask).some(task => task.elements.some(activity => this.activityUsesRelativePath(activity)));
        if (hasRelativePath && !hasRootParameter) {
            accept('error', 'A Schedule using relative paths shall declare at least one String8 Template Argument for the root path.', {
                node: schedule,
                property: 'parameters'
            });
        }
    }

    checkTask(task: ast.Task, accept: ValidationAcceptor): void {
        checkName(accept, task, task.name, 'name');
    }

    checkStringParameter(parameter: ast.StringParameter, accept: ValidationAcceptor): void {
        if (!AstUtils.getContainerOfType(parameter, ast.isSchedule)) {
            return;
        }
        checkName(accept, parameter, parameter.name, 'name');
        if (parameter.value === undefined) {
            accept('error', 'A Template Argument shall have a Value feature.', { node: parameter, property: 'value' });
        }
    }

    checkInt32Parameter(parameter: ast.Int32Parameter, accept: ValidationAcceptor): void {
        if (!AstUtils.getContainerOfType(parameter, ast.isSchedule)) {
            return;
        }
        checkName(accept, parameter, parameter.name, 'name');
        if (parameter.value === undefined) {
            accept('error', 'A Template Argument shall have a Value feature.', { node: parameter, property: 'value' });
        }
    }

    checkTrigger(trigger: ast.Trigger, accept: ValidationAcceptor): void {
        checkNoParentTraversal(accept, trigger, trigger.entryPoint, 'entryPoint');
    }

    checkTransfer(transfer: ast.Transfer, accept: ValidationAcceptor): void {
        checkNoParentTraversal(accept, transfer, transfer.outputFieldPath, 'outputFieldPath');
        checkNoParentTraversal(accept, transfer, transfer.inputFieldPath, 'inputFieldPath');
    }

    checkSetProperty(property: ast.SetProperty, accept: ValidationAcceptor): void {
        checkNoParentTraversal(accept, property, property.propertyPath, 'propertyPath');
    }

    checkCallOperation(call: ast.CallOperation, accept: ValidationAcceptor): void {
        checkNoParentTraversal(accept, call, call.operationPath, 'operationPath');
        const seen = new Set<string>();
        for (let index = 0; index < call.parameters.length; index++) {
            const parameter = call.parameters[index];
            if (!parameter.parameter) {
                continue;
            }
            if (seen.has(parameter.parameter)) {
                accept('error', 'Duplicated parameter name.', { node: call, property: 'parameters', index });
            } else {
                seen.add(parameter.parameter);
            }
        }
    }

    checkExecuteTask(execute: ast.ExecuteTask, accept: ValidationAcceptor): void {
        checkNoParentTraversal(accept, execute, execute.root, 'root');
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
                property: 'task'
            });
        }
        checkValidDuration(accept, event, event.cycleTime, 'cycleTime', 'CycleTime');
        checkNonNegativeBigInt(accept, event, event.repeatCount, 'repeatCount', 'RepeatCount');
    }

    private activityUsesRelativePath(activity: ast.Activity): boolean {
        switch (activity.$type) {
            case ast.Trigger:
                return !(activity as ast.Trigger).entryPoint?.startsWith('/');
            case ast.Transfer:
                return !((activity as ast.Transfer).outputFieldPath?.startsWith('/'))
                    || !((activity as ast.Transfer).inputFieldPath?.startsWith('/'));
            case ast.SetProperty:
                return !((activity as ast.SetProperty).propertyPath?.startsWith('/'));
            case ast.CallOperation:
                return !((activity as ast.CallOperation).operationPath?.startsWith('/'));
            case ast.ExecuteTask:
                return (activity as ast.ExecuteTask).root !== undefined && !((activity as ast.ExecuteTask).root?.startsWith('/'));
            default:
                return false;
        }
    }
}
