import { runCli } from './main.js';

void (async () => {
    try {
        process.exitCode = await runCli(process.argv);
    } catch (error) {
        const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
        process.stderr.write(`${message}\n`);
        process.exitCode = 2;
    }
})();
