import { AstUtils, type AstNode, type ValidationAcceptor, type ValidationChecks } from 'langium';
import * as ast from '../generated/ast.js';
import type { XsmpsedServices } from '../xsmpsed-module.js';
import {
    checkNonNegativeBigInt,
    isAbsolutePath,
    checkValidDateTime,
    checkValidDuration,
    isValidExpandedL2Identifier,
} from './l2-validator-utils.js';
import { checkName } from './name-validator-utils.js';
import type { Xsmpl2PathResolver } from '../references/xsmpl2-path-resolver.js';
import type { IdentifierPatternService } from '../references/identifier-pattern-service.js';
import type { XsmpPathService } from '../references/xsmp-path-service.js';
import * as XsmpUtils from '../utils/xsmp-utils.js';

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
    protected readonly pathResolver: Xsmpl2PathResolver;
    protected readonly identifierPatternService: IdentifierPatternService;
    protected readonly pathService: XsmpPathService;

    constructor(services: XsmpsedServices) {
        this.pathResolver = services.shared.L2PathResolver;
        this.identifierPatternService = services.shared.IdentifierPatternService;
        this.pathService = services.shared.PathService;
    }

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
        this.checkActivityPath(trigger.entryPoint, accept);
    }

    checkTransfer(transfer: ast.Transfer, accept: ValidationAcceptor): void {
        this.checkActivityPath(transfer.outputFieldPath, accept);
        this.checkActivityPath(transfer.inputFieldPath, accept);
    }

    checkSetProperty(property: ast.SetProperty, accept: ValidationAcceptor): void {
        this.checkActivityPath(property.propertyPath, accept);
    }

    checkCallOperation(call: ast.CallOperation, accept: ValidationAcceptor): void {
        this.checkActivityPath(call.operationPath, accept);
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
        if (!execute.root || execute.root.unsafe) {
            return;
        }
        if (!this.checkPathTemplateParameters(execute.root, accept)) {
            return;
        }
        const resolution = this.pathResolver.getScheduleActivityPathResolution(execute.root);
        this.acceptPathError(resolution.invalidMessage, resolution.invalidNode, accept);
        const expectedComponent = execute.task.ref ? this.pathResolver.getEffectiveTaskComponent(execute.task.ref) : undefined;
        if (!resolution.active || resolution.invalidMessage || !resolution.finalComponent || !expectedComponent) {
            return;
        }
        if (resolution.finalComponent !== expectedComponent && !XsmpUtils.isBaseOfComponent(expectedComponent, resolution.finalComponent)) {
            accept('error', `The root path shall resolve to a Component compatible with task ${execute.task.$refText}.`, {
                node: execute,
                property: 'root'
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
        const taskSchedule = event.task.ref ? AstUtils.getContainerOfType(event.task.ref, ast.isSchedule) : undefined;
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
                return !isAbsolutePath((activity as ast.Trigger).entryPoint);
            case ast.Transfer:
                return !isAbsolutePath((activity as ast.Transfer).outputFieldPath)
                    || !isAbsolutePath((activity as ast.Transfer).inputFieldPath);
            case ast.SetProperty:
                return !isAbsolutePath((activity as ast.SetProperty).propertyPath);
            case ast.CallOperation:
                return !isAbsolutePath((activity as ast.CallOperation).operationPath);
            case ast.ExecuteTask:
                return (activity as ast.ExecuteTask).root !== undefined && !isAbsolutePath((activity as ast.ExecuteTask).root);
            default:
                return false;
        }
    }

    private checkActivityPath(path: ast.Path, accept: ValidationAcceptor): void {
        if (path.unsafe) {
            return;
        }
        if (!this.checkPathTemplateParameters(path, accept)) {
            return;
        }
        const resolution = this.pathResolver.getScheduleActivityPathResolution(path);
        this.acceptPathError(resolution.invalidMessage, resolution.invalidNode, accept);
    }

    private checkPathTemplateParameters(path: ast.Path, accept: ValidationAcceptor): boolean {
        const schedule = AstUtils.getContainerOfType(path, ast.isSchedule);
        const available = new Set((schedule?.parameters ?? []).map(parameter => parameter.name));
        const bindings = this.getScheduleTemplateBindings(schedule);
        let valid = true;
        for (const segment of this.pathService.getPathSegments(path)) {
            const namedSegment = ast.isPathMember(segment) ? segment.segment : segment;
            if (!ast.isPathNamedSegment(namedSegment)) {
                continue;
            }
            for (const templateName of this.identifierPatternService.getSegmentTemplateNames(namedSegment)) {
                if (!available.has(templateName)) {
                    valid = false;
                    accept('error', `The placeholder '{${templateName}}' shall resolve to a Template Argument of the enclosing Schedule.`, {
                        node: namedSegment
                    });
                }
            }
            const pattern = this.identifierPatternService.getSegmentPattern(namedSegment);
            const concreteText = this.identifierPatternService.substitute(pattern, bindings);
            if (this.identifierPatternService.hasTemplate(pattern) && concreteText !== undefined && !isValidExpandedL2Identifier(concreteText)) {
                valid = false;
                accept('error', `The expanded path segment '${concreteText}' is not valid for SMP Level 2.`, {
                    node: namedSegment
                });
            }
        }
        return valid;
    }

    private getScheduleTemplateBindings(schedule: ast.Schedule | undefined): Map<string, string> {
        const bindings = new Map<string, string>();
        for (const parameter of schedule?.parameters ?? []) {
            if (ast.isStringParameter(parameter) && parameter.value !== undefined) {
                bindings.set(parameter.name, parameter.value.startsWith('"') && parameter.value.endsWith('"')
                    ? parameter.value.slice(1, -1)
                    : parameter.value);
            } else if (ast.isInt32Parameter(parameter) && parameter.value !== undefined) {
                bindings.set(parameter.name, parameter.value.toString());
            }
        }
        return bindings;
    }

    private acceptPathError(message: string | undefined, node: AstNode | undefined, accept: ValidationAcceptor): void {
        if (message && node) {
            accept('error', message, { node });
        }
    }
}
