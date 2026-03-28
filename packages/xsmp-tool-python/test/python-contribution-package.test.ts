import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { xsmpContributionPackage } from '@xsmp/tool-python';

describe('@xsmp/tool-python contribution package', () => {
    test('exposes a resolvable descriptor and historical alias', () => {
        expect(xsmpContributionPackage.name).toBe('@xsmp/tool-python');
        expect(xsmpContributionPackage.extensionId).toBe('@xsmp/tool-python');
        expect(xsmpContributionPackage.deprecatedAliases).toEqual(['org.eclipse.xsmp.tool.python']);
        expect(fs.existsSync(fileURLToPath(xsmpContributionPackage.descriptorUrl))).toBe(true);
    });
});
