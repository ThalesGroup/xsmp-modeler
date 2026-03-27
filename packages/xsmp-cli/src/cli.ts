import { runCli } from './main.js';

void runCli(process.argv).then(exitCode => {
    process.exitCode = exitCode;
}, error => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 2;
});
