import { describe, expect, test } from 'vitest';
import {
    getSmpMirrorPreviewUri,
    getSmpMirrorSyncChanges,
    isSmpMirrorPreviewSourcePath,
} from '../src/extension/smp-mirror-preview-support.js';

describe('SMP mirror preview support', () => {
    test('recognizes SMP XML source files that can be redirected to a mirror', () => {
        expect(isSmpMirrorPreviewSourcePath('/workspace/demo/test.smpcat')).toBe(true);
        expect(isSmpMirrorPreviewSourcePath('/workspace/demo/test.xsmpcat')).toBe(false);
    });

    test('maps SMP source files to their in-memory XSMP mirror uri', () => {
        expect(getSmpMirrorPreviewUri('/workspace/demo/test.smpcat')).toBe('xsmp-smp:/workspace/demo/test.xsmpcat');
        expect(getSmpMirrorPreviewUri('/workspace/demo/test.smpsed')).toBe('xsmp-smp:/workspace/demo/test.xsmpsed');
    });

    test('maps SMP source deletions to mirror deletions', () => {
        expect(getSmpMirrorSyncChanges('/workspace/demo/test.smpcat', 'deleted')).toEqual([
            {
                uri: 'xsmp-smp:/workspace/demo/test.xsmpcat',
                kind: 'deleted',
            },
        ]);
    });

    test('maps XSMP homologue changes to mirror invalidation', () => {
        expect(getSmpMirrorSyncChanges('/workspace/demo/test.xsmpcat', 'created')).toEqual([
            {
                uri: 'xsmp-smp:/workspace/demo/test.xsmpcat',
                kind: 'deleted',
            },
        ]);
        expect(getSmpMirrorSyncChanges('/workspace/demo/test.xsmpcat', 'deleted')).toEqual([
            {
                uri: 'xsmp-smp:/workspace/demo/test.xsmpcat',
                kind: 'changed',
            },
        ]);
    });
});
