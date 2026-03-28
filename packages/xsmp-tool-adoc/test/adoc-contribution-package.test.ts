import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { xsmpContributionPackage } from '@xsmp/tool-adoc';

describe('@xsmp/tool-adoc contribution package', () => {
    test('exposes a resolvable descriptor and historical alias', () => {
        expect(xsmpContributionPackage.name).toBe('@xsmp/tool-adoc');
        expect(xsmpContributionPackage.extensionId).toBe('@xsmp/tool-adoc');
        expect(xsmpContributionPackage.deprecatedAliases).toEqual(['org.eclipse.xsmp.tool.adoc']);
        expect(fs.existsSync(fileURLToPath(xsmpContributionPackage.descriptorUrl))).toBe(true);
    });
});
