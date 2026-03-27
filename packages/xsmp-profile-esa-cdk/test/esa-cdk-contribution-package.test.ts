import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { xsmpContributionPackage } from '@xsmp/profile-esa-cdk';

describe('@xsmp/profile-esa-cdk contribution package', () => {
    test('exposes a resolvable descriptor and historical identifier', () => {
        expect(xsmpContributionPackage.name).toBe('@xsmp/profile-esa-cdk');
        expect(xsmpContributionPackage.extensionId).toBe('@xsmp/profile-esa-cdk');
        expect(xsmpContributionPackage.deprecatedAliases).toEqual(['org.eclipse.xsmp.profile.esa-cdk']);
        expect(fs.existsSync(fileURLToPath(xsmpContributionPackage.descriptorUrl))).toBe(true);
    });
});
