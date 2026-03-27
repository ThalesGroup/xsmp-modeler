import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { xsmpContributionPackage } from '@xsmp/profile-xsmp-sdk';

describe('@xsmp/profile-xsmp-sdk contribution package', () => {
    test('exposes a resolvable descriptor and historical identifier', () => {
        expect(xsmpContributionPackage.name).toBe('@xsmp/profile-xsmp-sdk');
        expect(xsmpContributionPackage.extensionId).toBe('@xsmp/profile-xsmp-sdk');
        expect(xsmpContributionPackage.deprecatedAliases).toEqual(['org.eclipse.xsmp.profile.xsmp-sdk']);
        expect(fs.existsSync(fileURLToPath(xsmpContributionPackage.descriptorUrl))).toBe(true);
    });
});
