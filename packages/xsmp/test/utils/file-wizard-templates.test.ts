import { describe, expect, test } from 'vitest';
import {
    createXsmpStarterFileTemplate,
    getXsmpStarterFileDefaultStem,
    getXsmpStarterFileKinds,
} from 'xsmp/wizard/templates';

describe('XSMP starter file templates', () => {
    test('exposes all supported starter file kinds', () => {
        expect(getXsmpStarterFileKinds()).toEqual([
            'catalogue',
            'configuration',
            'assembly',
            'link-base',
            'schedule',
        ]);
    });

    test('creates a hello world catalogue starter with namespace and uuid placeholder', () => {
        const template = createXsmpStarterFileTemplate('catalogue', {
            fileStem: 'hello-world',
            author: 'alice',
            date: '2026-03-27T08:00:00Z',
        });

        expect(template.fileName).toBe('hello-world.xsmpcat');
        expect(template.content).toContain('catalogue hello_world_catalogue');
        expect(template.content).toContain('namespace demo::hello_world');
        expect(template.content).toContain('public model HelloWorld');
        expect(template.content).toContain('@uuid ${uuid}');
    });

    test('creates matching configuration, assembly, link-base and schedule starters', () => {
        const configuration = createXsmpStarterFileTemplate('configuration', {
            fileStem: 'hello-world',
            author: 'alice',
            date: '2026-03-27T08:00:00Z',
        });
        const assembly = createXsmpStarterFileTemplate('assembly', {
            fileStem: 'hello-world',
            author: 'alice',
            date: '2026-03-27T08:00:00Z',
        });
        const linkBase = createXsmpStarterFileTemplate('link-base', {
            fileStem: 'hello-world',
            author: 'alice',
            date: '2026-03-27T08:00:00Z',
        });
        const schedule = createXsmpStarterFileTemplate('schedule', {
            fileStem: 'hello-world',
            author: 'alice',
            date: '2026-03-27T08:00:00Z',
        });

        expect(configuration.fileName).toBe('hello-world.xsmpcfg');
        expect(configuration.content).toContain('configuration HelloWorldConfig');
        expect(configuration.content).toContain('/helloWorld: demo.hello_world.HelloWorld');

        expect(assembly.fileName).toBe('hello-world.xsmpasb');
        expect(assembly.content).toContain('assembly HelloWorldAssembly');
        expect(assembly.content).toContain('helloWorld: demo.hello_world.HelloWorld');

        expect(linkBase.fileName).toBe('hello-world.xsmplnk');
        expect(linkBase.content).toContain('link HelloWorldLinks for HelloWorldAssembly');
        expect(linkBase.content).toContain('/\n{\n}');

        expect(schedule.fileName).toBe('hello-world.xsmpsed');
        expect(schedule.content).toContain('schedule HelloWorldSchedule');
        expect(schedule.content).toContain('task Tick on demo.hello_world.HelloWorld');
        expect(schedule.content).toContain('event Tick simulation "PT1S"');
    });

    test('uses stable default stems for command prompts', () => {
        expect(getXsmpStarterFileDefaultStem('catalogue')).toBe('hello-world');
        expect(getXsmpStarterFileDefaultStem('configuration')).toBe('hello-world');
        expect(getXsmpStarterFileDefaultStem('assembly')).toBe('hello-world');
        expect(getXsmpStarterFileDefaultStem('link-base')).toBe('hello-world');
        expect(getXsmpStarterFileDefaultStem('schedule')).toBe('hello-world');
    });
});
