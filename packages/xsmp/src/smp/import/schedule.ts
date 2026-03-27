import type * as ScheduleModel from '../model/schedule.js';
import type { SmpExternalReferenceResolver } from './reference-resolver.js';
import {
    getAttribute,
    getChildObjects,
    getChildText,
    getXsiTypeLocalName,
    joinBlocks,
    parseBigIntAttribute,
    parseBooleanAttribute,
    renderBlock,
    renderDocumentHeader,
    renderImportedTemplateArgument,
    renderImportedTemplateParameter,
    renderNamedElementHeader,
    renderNestedImportedValue,
    renderReferenceText,
    renderStringLiteral,
    sanitizeReferenceText,
    type SmpXmlObject,
} from './shared.js';

export function importSchedule(
    root: ScheduleModel.Schedule,
    warnings: string[],
    referenceResolver: SmpExternalReferenceResolver,
): string {
    const rootNode = root as unknown as SmpXmlObject;
    const scheduleName = sanitizeReferenceText(getAttribute(rootNode, 'Name') ?? '__schedule__');
    const parameters = getChildObjects(rootNode, 'Parameter')
        .map(parameter => renderImportedTemplateParameter(parameter, warnings));
    const header = `schedule${parameters.length > 0 ? ` <${parameters.join(', ')}>` : ''} ${scheduleName}${renderScheduleHeaderTimes(rootNode)}`;
    const taskNames = new Set<string>();
    const taskReferenceById = new Map<string, string>();
    for (const task of getChildObjects(rootNode, 'Task')) {
        const taskName = sanitizeReferenceText(getAttribute(task, 'Name') ?? '__task__');
        taskNames.add(taskName);
        const taskId = getAttribute(task, 'Id');
        if (taskId) {
            taskReferenceById.set(taskId, taskName);
        }
        taskReferenceById.set(taskName, taskName);
        taskReferenceById.set(`${scheduleName}.${taskName}`, taskName);
    }

    const tasks = getChildObjects(rootNode, 'Task')
        .map(task => renderTask(task, warnings, referenceResolver, scheduleName, taskReferenceById, taskNames));
    const events = getChildObjects(rootNode, 'Event')
        .map(event => renderEvent(event, warnings, referenceResolver, scheduleName, taskReferenceById, taskNames));

    return joinBlocks([
        renderDocumentHeader(rootNode),
        header,
        ...tasks,
        ...events,
    ].filter(Boolean), '\n\n').trimEnd() + '\n';
}

function renderTask(
    node: SmpXmlObject,
    warnings: string[],
    referenceResolver: SmpExternalReferenceResolver,
    scheduleName: string,
    taskReferenceById: ReadonlyMap<string, string>,
    taskNames: ReadonlySet<string>,
): string {
    const header = renderNamedElementHeader(node);
    const name = sanitizeReferenceText(getAttribute(node, 'Name') ?? '__task__');
    const activities = getChildObjects(node, 'Activity')
        .map(activity => renderActivity(activity, warnings, referenceResolver, scheduleName, taskReferenceById, taskNames));

    return renderBlock(`task ${name}`, activities, { header });
}

function renderActivity(
    node: SmpXmlObject,
    warnings: string[],
    referenceResolver: SmpExternalReferenceResolver,
    scheduleName: string,
    taskReferenceById: ReadonlyMap<string, string>,
    taskNames: ReadonlySet<string>,
): string {
    switch (getXsiTypeLocalName(node, 'Schedule:Activity')) {
        case 'CallOperation': {
            const operationPath = getChildText(node, 'OperationPath') ?? '__operation__';
            const parameters = getChildObjects(node, 'Parameter')
                .map(parameter => `${sanitizeReferenceText(getAttribute(parameter, 'Parameter') ?? '__parameter__')}=${renderNestedImportedValue(parameter, 'Value', warnings)}`);
            return `call ${operationPath}(${parameters.join(', ')})`;
        }
        case 'EmitGlobalEvent': {
            const eventName = getChildText(node, 'EventName') ?? '';
            return `${parseBooleanAttribute(node, 'synchronous') === false ? 'async ' : ''}emit ${renderStringLiteral(eventName)}`;
        }
        case 'ExecuteTask': {
            const task = renderTaskReference(
                getChildObjects(node, 'Task')[0],
                warnings,
                referenceResolver,
                scheduleName,
                taskReferenceById,
                taskNames,
            );
            const argumentsText = getChildObjects(node, 'Argument').map(argument => renderImportedTemplateArgument(argument, warnings));
            const root = getAttribute(node, 'Root');
            return `execute ${task}${argumentsText.length > 0 ? `<${argumentsText.join(', ')}>` : ''}${root ? ` at ${root}` : ''}`;
        }
        case 'SetProperty': {
            const propertyPath = getChildText(node, 'PropertyPath') ?? '__property__';
            return `property ${propertyPath} = ${renderNestedImportedValue(node, 'Value', warnings)}`;
        }
        case 'Transfer':
            return `transfer ${getChildText(node, 'OutputFieldPath') ?? '__output__'} -> ${getChildText(node, 'InputFieldPath') ?? '__input__'}`;
        case 'Trigger':
            return `trig ${getChildText(node, 'EntryPoint') ?? '__entryPoint__'}`;
        default:
            warnings.push(`Unsupported schedule activity type '${getAttribute(node, 'xsi:type') ?? 'Schedule:Activity'}'.`);
            return '/* unsupported activity */';
    }
}

function renderEvent(
    node: SmpXmlObject,
    warnings: string[],
    referenceResolver: SmpExternalReferenceResolver,
    scheduleName: string,
    taskReferenceById: ReadonlyMap<string, string>,
    taskNames: ReadonlySet<string>,
): string {
    const task = renderTaskReference(
        getChildObjects(node, 'Task')[0],
        warnings,
        referenceResolver,
        scheduleName,
        taskReferenceById,
        taskNames,
    );
    const cycle = renderEventCycle(node);

    switch (getXsiTypeLocalName(node, 'Schedule:Event')) {
        case 'MissionEvent':
            return `event ${task} mission ${renderStringLiteral(getAttribute(node, 'MissionTime') ?? '')}${cycle}`;
        case 'EpochEvent':
            return `event ${task} epoch ${renderStringLiteral(getAttribute(node, 'EpochTime') ?? '')}${cycle}`;
        case 'SimulationEvent':
            return `event ${task} simulation ${renderStringLiteral(getAttribute(node, 'SimulationTime') ?? '')}${cycle}`;
        case 'ZuluEvent':
            return `event ${task} zulu ${renderStringLiteral(getAttribute(node, 'ZuluTime') ?? '')}${cycle}`;
        case 'GlobalEventTriggeredEvent': {
            const stopEvent = getAttribute(node, 'StopEvent');
            const timeKind = renderTimeKind(getAttribute(node, 'TimeKind'));
            const delay = getAttribute(node, 'Delay');
            return `event ${task} on ${renderStringLiteral(getAttribute(node, 'StartEvent') ?? '')}${stopEvent ? ` until ${renderStringLiteral(stopEvent)}` : ''}${timeKind ? ` using ${timeKind}` : ''}${delay ? ` delay ${renderStringLiteral(delay)}` : ''}${cycle}`;
        }
        default:
            warnings.push(`Unsupported schedule event type '${getAttribute(node, 'xsi:type') ?? 'Schedule:Event'}'.`);
            return `/* unsupported event for ${task} */`;
    }
}

function renderTaskReference(
    link: SmpXmlObject | undefined,
    warnings: string[],
    referenceResolver: SmpExternalReferenceResolver,
    scheduleName: string,
    taskReferenceById: ReadonlyMap<string, string>,
    taskNames: ReadonlySet<string>,
): string {
    return renderReferenceText(link, warnings, {
        currentNamespace: scheduleName,
        resolveLocal: (fragment, title) => {
            if (fragment && taskReferenceById.has(fragment)) {
                return taskReferenceById.get(fragment);
            }
            if (title && taskNames.has(title)) {
                return title;
            }
            if (fragment?.startsWith(`${scheduleName}.`)) {
                const shortName = fragment.slice(scheduleName.length + 1);
                if (taskNames.has(shortName)) {
                    return shortName;
                }
            }
            return undefined;
        },
        resolveExternal: (href, fragment, title) => referenceResolver.resolveReferenceText(href, fragment, title, warnings, 'task reference'),
    }, 'task reference');
}

function renderScheduleHeaderTimes(node: SmpXmlObject): string {
    const fragments: string[] = [];
    const epochTime = getAttribute(node, 'EpochTime');
    const missionStart = getAttribute(node, 'MissionStart');
    if (epochTime) {
        fragments.push(`epoch ${renderStringLiteral(epochTime)}`);
    }
    if (missionStart) {
        fragments.push(`mission ${renderStringLiteral(missionStart)}`);
    }
    return fragments.length > 0 ? ` ${fragments.join(' ')}` : '';
}

function renderEventCycle(node: SmpXmlObject): string {
    const cycleTime = getAttribute(node, 'CycleTime');
    const repeatCount = parseBigIntAttribute(node, 'RepeatCount');
    if (!cycleTime || (cycleTime === 'PT0S' && repeatCount === undefined)) {
        return '';
    }
    return ` cycle ${renderStringLiteral(cycleTime)}${repeatCount !== undefined ? ` repeat ${repeatCount}` : ''}`;
}

function renderTimeKind(value: string | undefined): string | undefined {
    switch (value) {
        case undefined:
        case '':
            return undefined;
        case 'EpochTime':
            return 'epoch';
        case 'MissionTime':
            return 'mission';
        case 'SimulationTime':
            return 'simulation';
        case 'ZuluTime':
            return 'zulu';
        default:
            return sanitizeReferenceText(value).toLowerCase();
    }
}
