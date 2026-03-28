process.env.XSMP_CLI_VERSION = __XSMP_CLI_VERSION__;

const { runCli } = require('../src/main.ts');

runCli(process.argv)
    .then(exitCode => {
        process.exitCode = exitCode;
    })
    .catch(error => {
        const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
        process.stderr.write(`${message}\n`);
        process.exitCode = 2;
    });
