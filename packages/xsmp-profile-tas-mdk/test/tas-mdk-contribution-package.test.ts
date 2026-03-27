import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { xsmpContributionPackage } from '@xsmp/profile-tas-mdk';

describe('@xsmp/profile-tas-mdk contribution package', () => {
    test('exposes a resolvable descriptor and historical identifier', () => {
        expect(xsmpContributionPackage.name).toBe('@xsmp/profile-tas-mdk');
        expect(xsmpContributionPackage.extensionId).toBe('@xsmp/profile-tas-mdk');
        expect(xsmpContributionPackage.deprecatedAliases).toEqual(['org.eclipse.xsmp.profile.tas-mdk']);
        expect(fs.existsSync(fileURLToPath(xsmpContributionPackage.descriptorUrl))).toBe(true);
    });
});
