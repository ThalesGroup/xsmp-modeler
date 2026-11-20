import { afterEach, beforeEach, expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { runCli } from '@xsmp/cli';

let directory: string;
beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-cli-diagnostics-'));
    fs.mkdirSync(path.join(directory, 'src'));
    fs.writeFileSync(path.join(directory, 'xsmp.project'), 'project "Demo" source "src" tool "adoc"');
});
afterEach(() => { fs.rmSync(directory, { recursive: true, force: true }); });

test.each([
    ['missing closing brace', 'catalogue Demo\nnamespace demo {', 1],
    ['missing closing brace with trailing newline', 'catalogue Demo\nnamespace demo {\n', 1],
    ['empty file', '', 1],
    ['comment-only file', '// comment', 1],
    ['incomplete alternative at EOF', 'catalogue Demo\nnamespace', 1],
    ['unexpected token', 'catalogue Demo namespace demo ]', 1],
    ['lexer error', 'catalogue Demo namespace demo { ` }', 1],
    ['lexer error and EOF', 'catalogue Demo\nnamespace demo { `', 2],
    ['valid catalogue', 'catalogue Demo namespace demo {}', 0],
] as const)('reports %s once at valid positions', async (_name, source, errorCount) => {
    fs.writeFileSync(path.join(directory, 'src/Demo.xsmpcat'), source);
    const lines = source.split('\n');
    for (const command of ['validate', 'generate']) {
        let stdout = '';
        let stderr = '';
        const code = await runCli(['node', 'xsmp', command, directory, '--workspace-root', directory], {
            stdout: text => { stdout += text; },
            stderr: text => { stderr += text; },
        });
        expect(code, stderr).toBe(errorCount ? 1 : 0);
        expect(stdout).toContain(`${errorCount} errors, 0 warnings`);
        const positions = [...stderr.matchAll(/^src\/Demo\.xsmpcat:(-?\d+):(-?\d+) error /gm)];
        expect(positions, stderr).toHaveLength(errorCount);
        for (const position of positions) {
            const line = Number(position[1]);
            const column = Number(position[2]);
            expect(line).toBeGreaterThanOrEqual(1);
            expect(line).toBeLessThanOrEqual(lines.length);
            expect(column).toBeGreaterThanOrEqual(1);
            expect(column).toBeLessThanOrEqual(lines[line - 1].length + 1);
        }
        if (errorCount === 0) expect(stderr).toBe('');
        if (errorCount > 0) expect(fs.existsSync(path.join(directory, 'adoc-gen'))).toBe(false);
    }
    if (errorCount === 0) expect(fs.existsSync(path.join(directory, 'adoc-gen/Demo-gen.adoc'))).toBe(true);
});
