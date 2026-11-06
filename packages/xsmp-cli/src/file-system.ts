import type { URI } from 'langium';
import { NodeFileSystemProvider } from 'langium/node';
import { isUtf8 } from 'node:buffer';
import * as fs from 'node:fs';
import { CliError } from './cli-error.js';

/** Refuse lossy decoding before validating or generating from source files. */
export class CliFileSystemProvider extends NodeFileSystemProvider {
    override async readFile(uri: URI): Promise<string> {
        return this.decode(uri, await fs.promises.readFile(uri.fsPath));
    }

    override readFileSync(uri: URI): string {
        return this.decode(uri, fs.readFileSync(uri.fsPath));
    }

    private decode(uri: URI, bytes: Buffer): string {
        if (!isUtf8(bytes)) {
            throw new CliError(`File '${uri.fsPath}' is not valid UTF-8. Save it as UTF-8 before running the CLI.`);
        }
        return bytes.toString('utf8');
    }
}
