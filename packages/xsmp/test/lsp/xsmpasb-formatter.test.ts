import { EmptyFileSystem } from 'langium';
import { expectFormatting } from 'langium/test';
import { describe, test } from 'vitest';
import { createXsmpServices } from 'xsmp';
import * as fs from 'fs';
import * as path from 'path';

const services = createXsmpServices(EmptyFileSystem);
const formatting = expectFormatting(services.xsmpasb);

describe('Xsmpasb Formatter', () => {
    test('Format reference file', async () => {
        await formatting({
            before: fs.readFileSync(path.resolve(__dirname, 'not-formatted.xsmpasb')).toString(),
            after: fs.readFileSync(path.resolve(__dirname, 'formatted.xsmpasb')).toString()
        });
    });
});
