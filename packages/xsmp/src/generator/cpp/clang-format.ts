import { spawn, spawnSync } from 'node:child_process';
const clangFormatCommand = process.platform.startsWith('win') ? 'clang-format.exe' : 'clang-format';
const isClangFormatAvailable = computeIsClangFormatAvailable();

/**
 * Check if clang-format is executable.
 *
 * @return True if clang-format is found and executable, otherwise false.
 */
function computeIsClangFormatAvailable(): boolean {
    try {
        spawnSync(clangFormatCommand, ['--version'], { stdio: 'ignore', shell: false });
        return true;
    } catch {
        console.warn('clang-format is not available. Formatting will be skipped.');
        return false;
    }
}

/**
 * Formats a file using a specific configuration asynchronously.
 *
 * @param path The path of the file to format.
 * @param content The content to be formatted.
 * @return A promise that resolves with the formatted content or the original content in case of an error.
 */
export async function format(path: string, content: string): Promise<string> {
    if (!isClangFormatAvailable) {
        return content;
    }

    return new Promise((resolve) => {
        const process = spawn(clangFormatCommand, [`-assume-filename=${path}`], { shell: false });

        let formattedContent = '';
        let errorContent = '';

        // Capture stdout
        process.stdout.on('data', (data) => {
            formattedContent += data.toString();
        });

        // Capture stderr
        process.stderr.on('data', (data) => {
            errorContent += data.toString();
        });

        // Handle process completion
        process.once('close', (code) => {
            if (code === 0) {
                resolve(formattedContent);
            } else {
                console.warn(`clang-format exited with code ${code}, returning original content.`);
                if (errorContent.length > 0) {
                    console.error(`Error during formatting of ${path}: ${errorContent}`);
                }
                resolve(content);
            }
        });

        // Handle process errors
        process.once('error', (error) => {
            console.error(`Error during formatting of ${path}: ${error.message}`);
            resolve(content); // Return original content on error
        });

        // Send input to the process
        process.stdin.end(content);
    });
}