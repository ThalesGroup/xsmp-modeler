import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { xsmpContributionPackage } from 'xsmp-tas-mdk';

describe('xsmp-tas-mdk contribution package', () => {
    test('exposes a resolvable descriptor and historical identifier', () => {
        expect(xsmpContributionPackage.name).toBe('xsmp-tas-mdk');
        expect(xsmpContributionPackage.extensionId).toBe('xsmp-tas-mdk');
        expect(xsmpContributionPackage.deprecatedAliases).toEqual(['org.eclipse.xsmp.profile.tas-mdk']);
        expect(fs.existsSync(fileURLToPath(xsmpContributionPackage.descriptorUrl))).toBe(true);
    });
});
