export class CliError extends Error {
    readonly exitCode: 1 | 2;

    constructor(message: string, exitCode: 1 | 2 = 2) {
        super(message);
        this.name = 'CliError';
        this.exitCode = exitCode;
    }
}
