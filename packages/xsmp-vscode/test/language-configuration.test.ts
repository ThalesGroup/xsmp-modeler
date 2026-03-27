import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

type AutoClosingPair = {
    open: string;
    close: string;
    notIn?: string[];
};

type LanguageConfiguration = {
    comments?: {
        lineComment?: string;
        blockComment?: [string, string];
    };
    brackets?: [string, string][];
    autoClosingPairs?: AutoClosingPair[];
    surroundingPairs?: [string, string][];
    wordPattern?: string;
    onEnterRules?: unknown[];
};

const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDir, '..');
const packageJsonPath = path.join(packageRoot, 'package.json');

const expectedLanguageConfiguration = {
    xsmpproject: {
        brackets: [] as [string, string][],
        autoClosingPairs: ["'", '"', '/*'],
        surroundingPairs: ['"', "'"],
        supportsTemplateIdentifiers: false,
    },
    xsmpcat: {
        brackets: [['{', '}'], ['[', ']'], ['(', ')']] as [string, string][],
        autoClosingPairs: ['[', '{', '(', "'", '"', '/*'],
        surroundingPairs: ['{', '[', '(', '"', "'"],
        supportsTemplateIdentifiers: false,
    },
    xsmpasb: {
        brackets: [['{', '}'], ['[', ']'], ['(', ')']] as [string, string][],
        autoClosingPairs: ['[', '{', '(', "'", '"', '/*'],
        surroundingPairs: ['{', '[', '(', '"', "'", '<'],
        supportsTemplateIdentifiers: true,
    },
    xsmpcfg: {
        brackets: [['{', '}'], ['[', ']']] as [string, string][],
        autoClosingPairs: ['[', '{', "'", '"', '/*'],
        surroundingPairs: ['{', '[', '"', "'"],
        supportsTemplateIdentifiers: false,
    },
    xsmplnk: {
        brackets: [['{', '}'], ['[', ']']] as [string, string][],
        autoClosingPairs: ['[', '{', '/*'],
        surroundingPairs: ['{', '['],
        supportsTemplateIdentifiers: true,
    },
    xsmpsed: {
        brackets: [['{', '}'], ['[', ']'], ['(', ')']] as [string, string][],
        autoClosingPairs: ['[', '{', '(', "'", '"', '/*'],
        surroundingPairs: ['{', '[', '(', '"', "'", '<'],
        supportsTemplateIdentifiers: true,
    },
} as const;

async function readJsonFile<T>(filePath: string): Promise<T> {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
}

describe('language configuration', () => {
    test('every contributed language points to a dedicated configuration file', async () => {
        const packageJson = await readJsonFile<{
            contributes: {
                languages: Array<{
                    id: keyof typeof expectedLanguageConfiguration;
                    configuration: string;
                }>;
            };
        }>(packageJsonPath);

        const contributedLanguages = packageJson.contributes.languages.map(language => language.id);
        expect(contributedLanguages.sort()).toEqual(Object.keys(expectedLanguageConfiguration).sort());

        for (const language of packageJson.contributes.languages) {
            expect(language.configuration).toBe(`./${language.id}-language-configuration.json`);
        }
    });

    test('matches the delimiters and comment behavior of each XSMP DSL', async () => {
        for (const [languageId, expected] of Object.entries(expectedLanguageConfiguration)) {
            const configPath = path.join(packageRoot, `${languageId}-language-configuration.json`);
            const configuration = await readJsonFile<LanguageConfiguration>(configPath);

            expect(configuration.comments).toEqual({
                lineComment: '//',
                blockComment: ['/*', '*/'],
            });

            expect(configuration.brackets ?? []).toEqual(expected.brackets);
            expect((configuration.autoClosingPairs ?? []).map(pair => pair.open)).toEqual(expected.autoClosingPairs);
            expect((configuration.surroundingPairs ?? []).map(([open]) => open)).toEqual(expected.surroundingPairs);

            const blockCommentPair = configuration.autoClosingPairs?.find(pair => pair.open === '/*');
            expect(blockCommentPair).toEqual({
                open: '/*',
                close: '*/',
                notIn: ['string', 'comment'],
            });

            const doubleQuotePair = configuration.autoClosingPairs?.find(pair => pair.open === '"');
            if (expected.autoClosingPairs.includes('"')) {
                expect(doubleQuotePair).toEqual({
                    open: '"',
                    close: '"',
                    notIn: ['string', 'comment'],
                });
            } else {
                expect(doubleQuotePair).toBeUndefined();
            }

            const singleQuotePair = configuration.autoClosingPairs?.find(pair => pair.open === "'");
            if (expected.autoClosingPairs.includes("'")) {
                expect(singleQuotePair).toEqual({
                    open: "'",
                    close: "'",
                    notIn: ['string', 'comment'],
                });
            } else {
                expect(singleQuotePair).toBeUndefined();
            }

            if (expected.supportsTemplateIdentifiers) {
                expect(configuration.wordPattern).toContain('\\{[_a-zA-Z]\\w*\\}\\w*');
            } else {
                expect(configuration.wordPattern).not.toContain('\\{[_a-zA-Z]\\w*\\}\\w*');
            }

            expect(configuration.onEnterRules).toHaveLength(5);
        }
    });
});
