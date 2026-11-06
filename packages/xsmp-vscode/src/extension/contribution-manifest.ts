import type { XsmpExtensionContributionManifestEntry } from '@xsmp/core/contributions';

export function readXsmpContributionEntries(
    packageJson: unknown,
    reportInvalid: (message: string) => void,
): readonly XsmpExtensionContributionManifestEntry[] {
    if (!isRecord(packageJson) || !isRecord(packageJson.contributes)) {
        return [];
    }
    const xsmp = packageJson.contributes.xsmp;
    if (xsmp === undefined) {
        return [];
    }
    if (!Array.isArray(xsmp)) {
        reportInvalid('ignored contributes.xsmp: expected an array.');
        return [];
    }

    const entries: XsmpExtensionContributionManifestEntry[] = [];
    for (const [index, entry] of xsmp.entries()) {
        const issue = getEntryIssue(entry);
        if (issue) {
            reportInvalid(`skipped invalid contribution at contributes.xsmp[${index}]: ${issue}.`);
        } else {
            entries.push(entry as XsmpExtensionContributionManifestEntry);
        }
    }
    return entries;
}

function getEntryIssue(entry: unknown): string | undefined {
    if (!isRecord(entry)) {
        return 'expected an object';
    }
    for (const field of ['descriptor', 'handler']) {
        if (typeof entry[field] !== 'string' || entry[field].length === 0) {
            return `${field} must be a non-empty string`;
        }
    }
    if (typeof entry.apiVersion !== 'string') {
        return 'apiVersion must be a string';
    }
    for (const field of ['aliases', 'deprecatedAliases', 'builtins']) {
        const values = entry[field];
        if (values !== undefined && (!Array.isArray(values) || !values.every(value => typeof value === 'string'))) {
            return `${field} must be an array of strings`;
        }
    }
    if (entry.wizard !== undefined) {
        if (!isRecord(entry.wizard)) {
            return 'wizard must be an object';
        }
        for (const field of ['label', 'description']) {
            if (entry.wizard[field] !== undefined && typeof entry.wizard[field] !== 'string') {
                return `wizard.${field} must be a string`;
            }
        }
        if (entry.wizard.defaultSelected !== undefined && typeof entry.wizard.defaultSelected !== 'boolean') {
            return 'wizard.defaultSelected must be a boolean';
        }
    }
    return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
