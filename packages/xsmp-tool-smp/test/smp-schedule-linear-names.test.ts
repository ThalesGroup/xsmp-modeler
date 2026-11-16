import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { EmptyFileSystem, type LangiumDocument } from 'langium';
import { clearDocuments, parseHelper } from 'langium/test';
import { create as createXml } from 'xmlbuilder2';
import type { Element } from '@oozcitak/dom/lib/dom/interfaces.js';
import { createXsmpServices } from '@xsmp/core';
import * as ast from '@xsmp/core/ast';
import { SmpGenerator } from '@xsmp/tool-smp';

let services: ReturnType<typeof createXsmpServices>;
let parse: ReturnType<typeof parseHelper<ast.Schedule>>;
const documents: LangiumDocument[] = [];

beforeAll(() => {
    services = createXsmpServices(EmptyFileSystem);
    parse = parseHelper<ast.Schedule>(services.xsmpsed);
});

afterEach(async () => {
    await clearDocuments(services.shared, documents.splice(0));
});

async function schedule(source: string): Promise<ast.Schedule> {
    const document = await parse(source);
    documents.push(document);
    expect(document.parseResult.lexerErrors).toHaveLength(0);
    expect(document.parseResult.parserErrors).toHaveLength(0);
    return document.parseResult.value;
}

function generatedNames(xml: string, element: 'Activity' | 'Event'): string[][] {
    return createXml(xml).filter(child => child.node.nodeName === element, false, true)
        .map(child => {
            const node = child.node as Element;
            return [node.getAttribute('Name')!, node.getAttribute('Id')!];
        });
}

function countElementReads<T>(elements: T[]): { elements: T[]; reads: () => number } {
    let reads = 0;
    return {
        elements: new Proxy(elements, {
            get(target, property, receiver) {
                if (typeof property === 'string' && /^\d+$/.test(property)) {
                    reads++;
                }
                return Reflect.get(target, property, receiver);
            }
        }),
        reads: () => reads,
    };
}

describe('generated schedule names', () => {
    test('counts each activity and event type separately and resets at its container', async () => {
        const value = await schedule(`schedule Plan
task First {
    emit "One"
    trig /Root/entry
    emit "Two"
    trig /Root/entry
}
event First simulation "PT1S"
task Second { emit "Three" }
event First mission "PT2S"
task Empty {}
event Second simulation "PT3S"
event Second mission "PT4S"
`);
        const generator = new SmpGenerator(services.shared);
        const expectedActivities = [
            ['EmitGlobalEvent1', 'First.EmitGlobalEvent1'],
            ['Trigger1', 'First.Trigger1'],
            ['EmitGlobalEvent2', 'First.EmitGlobalEvent2'],
            ['Trigger2', 'First.Trigger2'],
            ['EmitGlobalEvent1', 'Second.EmitGlobalEvent1'],
        ];
        const expectedEvents = [
            ['SimulationEvent1', 'Plan.SimulationEvent1'],
            ['MissionEvent1', 'Plan.MissionEvent1'],
            ['SimulationEvent2', 'Plan.SimulationEvent2'],
            ['MissionEvent2', 'Plan.MissionEvent2'],
        ];
        for (let run = 0; run < 2; run++) {
            const xml = await generator.doGenerateSchedule(value, undefined);
            expect(generatedNames(xml, 'Activity')).toEqual(expectedActivities);
            expect(generatedNames(xml, 'Event')).toEqual(expectedEvents);
        }

        // Direct conversions retain their ordinal among siblings of the same type.
        const task = value.elements.find(ast.isTask)!;
        expect(generator.convertActivity(task.elements[2])).toMatchObject({ '@Name': 'EmitGlobalEvent2', '@Id': 'First.EmitGlobalEvent2' });
        const events = value.elements.filter(ast.isEvent);
        expect(generator.convertEvent(events[2])).toMatchObject({ '@Name': 'SimulationEvent2', '@Id': 'Plan.SimulationEvent2' });

        const other = await schedule('schedule Other task Main { emit "Other" } event Main simulation "PT1S"');
        const xml = await generator.doGenerateSchedule(other, undefined);
        expect(generatedNames(xml, 'Activity')).toEqual([['EmitGlobalEvent1', 'Main.EmitGlobalEvent1']]);
        expect(generatedNames(xml, 'Event')).toEqual([['SimulationEvent1', 'Other.SimulationEvent1']]);
    });

    test('recomputes names after removing and reordering elements', async () => {
        const value = await schedule(`schedule Plan
task Main { emit "Removed" emit "Retained" }
event Main simulation "PT1S"
event Main simulation "PT2S"
`);
        const generator = new SmpGenerator(services.shared);
        await generator.doGenerateSchedule(value, undefined);
        const task = value.elements.find(ast.isTask)!;
        task.elements.shift();
        value.elements.reverse();
        const events = value.elements.filter(ast.isEvent);
        const xml = await generator.doGenerateSchedule(value, undefined);
        expect(generatedNames(xml, 'Activity')).toEqual([['EmitGlobalEvent1', 'Main.EmitGlobalEvent1']]);
        expect(generator.convertEvent(events[0])).toMatchObject({ '@Name': 'SimulationEvent1' });
        expect(generator.convertEvent(events[1])).toMatchObject({ '@Name': 'SimulationEvent2' });
        expect(xml.indexOf('SimulationTime="PT2S"')).toBeLessThan(xml.indexOf('SimulationTime="PT1S"'));
    });

    test.each([undefined, 4])('preserves the fallback ordinal for detached nodes (index %s)', async index => {
        const value = await schedule('schedule Plan task Main { emit "Tick" } event Main simulation "PT1S"');
        const task = value.elements.find(ast.isTask)!;
        const activity = { ...task.elements[0], $containerIndex: index };
        const event = { ...value.elements.find(ast.isEvent)!, task: { $refText: 'Main', ref: undefined }, $containerIndex: index };
        Reflect.deleteProperty(activity, '$container');
        Reflect.deleteProperty(event, '$container');
        const generator = new SmpGenerator(services.shared);
        const ordinal = (index ?? 0) + 1;
        expect(generator.convertActivity(activity)).toMatchObject({ '@Name': `EmitGlobalEvent${ordinal}`, '@Id': `EmitGlobalEvent${ordinal}` });
        expect(generator.convertEvent(event)).toMatchObject({ '@Name': `SimulationEvent${ordinal}`, '@Id': `SimulationEvent${ordinal}` });
    });

    test.each([32, 64])('visits activity and event arrays a linear number of times (%i siblings)', async count => {
        const value = await schedule(`schedule Plan
task Main { ${'emit "Tick"\n'.repeat(count)} }
${'event Main simulation "PT1S"\n'.repeat(count)}
`);
        const task = value.elements.find(ast.isTask)!;
        const activities = countElementReads(task.elements);
        const elements = countElementReads(value.elements);
        task.elements = activities.elements;
        value.elements = elements.elements;
        const xml = await new SmpGenerator(services.shared).doGenerateSchedule(value, undefined);
        expect(generatedNames(xml, 'Activity')).toHaveLength(count);
        expect(generatedNames(xml, 'Event')).toHaveLength(count);
        // Count structural work rather than elapsed time on a loaded test host.
        expect.soft(activities.reads()).toBeLessThanOrEqual(4 * count);
        expect.soft(elements.reads()).toBeLessThanOrEqual(4 * (count + 1));
    });
});
