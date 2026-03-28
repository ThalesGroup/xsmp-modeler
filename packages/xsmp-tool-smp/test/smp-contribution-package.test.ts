import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { xsmpContributionPackage } from '@xsmp/tool-smp';

describe('@xsmp/tool-smp contribution package', () => {
    test('exposes a resolvable descriptor and historical alias', () => {
        expect(xsmpContributionPackage.name).toBe('@xsmp/tool-smp');
        expect(xsmpContributionPackage.extensionId).toBe('@xsmp/tool-smp');
        expect(xsmpContributionPackage.deprecatedAliases).toEqual(['org.eclipse.xsmp.tool.smp']);
        expect(fs.existsSync(fileURLToPath(xsmpContributionPackage.descriptorUrl))).toBe(true);
    });
});
