import { describe, expect, test } from 'vitest';
import { readXsmpContributionEntries } from '../src/extension/contribution-manifest.js';

const valid = {
    descriptor: 'xsmp/project.xsmptool',
    handler: 'out/contribution.js',
    apiVersion: '^2.0.0',
};

function read(entries: unknown) {
    const issues: string[] = [];
    const contributions = readXsmpContributionEntries({ contributes: { xsmp: entries } }, message => issues.push(message));
    return { contributions, issues };
}

describe('XSMP contribution manifests', () => {
    test('keeps valid contributions before and after malformed entries', () => {
        const second = { ...valid, descriptor: 'xsmp/second.xsmptool' };
        const { contributions, issues } = read([valid, null, { apiVersion: '^2.0.0' }, second]);

        expect(contributions).toEqual([valid, second]);
        expect(contributions[0]).toBe(valid);
        expect(contributions[1]).toBe(second);
        expect(issues).toEqual([
            'skipped invalid contribution at contributes.xsmp[1]: expected an object.',
            'skipped invalid contribution at contributes.xsmp[2]: descriptor must be a non-empty string.',
        ]);
    });

    test('preserves optional metadata and leaves API compatibility to registration', () => {
        const full = {
            ...valid,
            apiVersion: 'not a semver range',
            aliases: ['alias'],
            deprecatedAliases: ['old-alias'],
            builtins: ['builtins/custom.xsmpcat'],
            wizard: { label: 'Custom tool', description: '', defaultSelected: false },
            extra: { metadata: true },
        };

        expect(read([full])).toEqual({ contributions: [full], issues: [] });
        expect(read([{ ...valid, apiVersion: '' }]).issues).toEqual([]);
    });

    test.each([
        ['null', null, 'expected an object'],
        ['scalar', 'contribution', 'expected an object'],
        ['array', [], 'expected an object'],
        ['missing descriptor', { ...valid, descriptor: undefined }, 'descriptor must be a non-empty string'],
        ['empty descriptor', { ...valid, descriptor: '' }, 'descriptor must be a non-empty string'],
        ['missing handler', { ...valid, handler: undefined }, 'handler must be a non-empty string'],
        ['numeric handler', { ...valid, handler: 42 }, 'handler must be a non-empty string'],
        ['missing API version', { ...valid, apiVersion: undefined }, 'apiVersion must be a string'],
        ['numeric API version', { ...valid, apiVersion: 2 }, 'apiVersion must be a string'],
        ['string aliases', { ...valid, aliases: 'alias' }, 'aliases must be an array of strings'],
        ['invalid deprecated alias', { ...valid, deprecatedAliases: [null] }, 'deprecatedAliases must be an array of strings'],
        ['string builtins', { ...valid, builtins: 'builtins/custom.xsmpcat' }, 'builtins must be an array of strings'],
        ['invalid builtin path', { ...valid, builtins: [42] }, 'builtins must be an array of strings'],
        ['null wizard', { ...valid, wizard: null }, 'wizard must be an object'],
        ['array wizard', { ...valid, wizard: [] }, 'wizard must be an object'],
        ['numeric wizard label', { ...valid, wizard: { label: 42 } }, 'wizard.label must be a string'],
        ['boolean wizard description', { ...valid, wizard: { description: true } }, 'wizard.description must be a string'],
        ['string wizard selection', { ...valid, wizard: { defaultSelected: 'false' } }, 'wizard.defaultSelected must be a boolean'],
    ])('skips %s without losing the following contribution', (_name, entry, issue) => {
        expect(read([entry, valid])).toEqual({
            contributions: [valid],
            issues: [`skipped invalid contribution at contributes.xsmp[0]: ${issue}.`],
        });
    });

    test.each([null, {}, 'contribution'])('reports a non-array XSMP declaration: %j', entries => {
        expect(read(entries)).toEqual({ contributions: [], issues: ['ignored contributes.xsmp: expected an array.'] });
    });

    test('ignores packages that do not declare XSMP contributions', () => {
        for (const packageJson of [null, [], {}, { contributes: null }, { contributes: {} }]) {
            const issues: string[] = [];
            expect(readXsmpContributionEntries(packageJson, message => issues.push(message))).toEqual([]);
            expect(issues).toEqual([]);
        }
        expect(read([])).toEqual({ contributions: [], issues: [] });
    });
});
