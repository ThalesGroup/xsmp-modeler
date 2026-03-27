import { describe, expect, test } from 'vitest';
import * as path from 'node:path';
import { isSameOrContainedPath, toXsmpIdentifier } from 'xsmp/utils';

describe('Path utils', () => {
    test('detects path containment with directory boundaries', () => {
        expect(isSameOrContainedPath('/workspace/project', '/workspace/project')).toBe(true);
        expect(isSameOrContainedPath('/workspace/project', '/workspace/project/src/model.xsmpcat')).toBe(true);
        expect(isSameOrContainedPath('/workspace/project', '/workspace/project2/src/model.xsmpcat')).toBe(false);
        expect(isSameOrContainedPath('/workspace/project/src', '/workspace/project/src2/model.xsmpcat')).toBe(false);
    });

    test('supports native paths and XSMP identifier normalization', () => {
        expect(isSameOrContainedPath('/workspace/project', '/workspace/project/subdir', path)).toBe(true);
        expect(isSameOrContainedPath('/workspace/project', '/workspace/project2/subdir', path)).toBe(false);
        expect(toXsmpIdentifier('My.lib-core')).toBe('My_lib_core');
        expect(toXsmpIdentifier('Simple_Name')).toBe('Simple_Name');
    });
});
