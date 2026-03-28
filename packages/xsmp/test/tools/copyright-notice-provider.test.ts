import { afterEach, beforeAll, describe, expect, test } from "vitest";
import { EmptyFileSystem, type LangiumDocument } from "langium";
import { expandToString as s } from "langium/generate";
import { clearDocuments, parseHelper } from "langium/test";
import { createXsmpServices } from 'xsmp';
import { Catalogue } from 'xsmp/ast-partial';
import * as CopyrightNoticeProvider  from 'xsmp/generator';

let services: ReturnType<typeof createXsmpServices>;
let parse: ReturnType<typeof parseHelper<Catalogue>>;
let document: LangiumDocument<Catalogue> | undefined;

beforeAll(async () => {
    services = createXsmpServices(EmptyFileSystem);
    parse = parseHelper<Catalogue>(services.xsmpcat);
});

afterEach(async () => {
    document && clearDocuments(services.shared, [document]);
});

describe('Copyright provider tests', () => {

    test('no copyright with jsdoc', async () => {
        document = await parse(`
            /**
             * a desc
             */
            catalogue test
            `);

        expect(
            CopyrightNoticeProvider.getCopyrightNotice(document)
        ).toBe(undefined);

        expect(
            CopyrightNoticeProvider.getCopyrightNotice(document, '//')
        ).toBe(undefined);
    });

    test('no copyright', async () => {
        document = await parse(`
            catalogue test
            `);

        expect(
            CopyrightNoticeProvider.getCopyrightNotice(document)
        ).toBe(undefined);

        expect(
            CopyrightNoticeProvider.getCopyrightNotice(document, '//')
        ).toBe(undefined);
    });

    test('multiline line copyright', async () => {
        document = await parse(`
            /*******
            * 
            copyright
            * 
            *notice
            * 
            ***********/
            /* comment */
            /**
            * Catalogue Test
            * 
            * @creator daveluy
            * @date 2021-09-30T06:32:34Z
            */
            catalogue Test
            `);

        expect(
            CopyrightNoticeProvider.getCopyrightNotice(document)
        ).toBe(s`
            copyright

            notice
        `);
        expect(
            CopyrightNoticeProvider.getCopyrightNotice(document, '//')
        ).toBe(s`
            //copyright
            //
            //notice
        `);
    });

    test('single line copyright with spaces', async () => {
        document = await parse(`
            //
            // copyright
            //
            // notice
            //
            /* comment */
            /**
             * Catalogue Test
             * 
             * @creator daveluy
             * @date 2021-09-30T06:32:34Z
             */
            catalogue Test`);

        expect(
            CopyrightNoticeProvider.getCopyrightNotice(document)
        ).toBe(s`
            copyright

            notice
            `
        );

        expect(
            CopyrightNoticeProvider.getCopyrightNotice(document, '//')
        ).toBe(s`
            //copyright
            //
            //notice
            `
        );
    });

    test('single line block copyright', async () => {
        document = await parse(`
            /* copyright notice */
            catalogue Test`);

        expect(
            CopyrightNoticeProvider.getCopyrightNotice(document)
        ).toBe('copyright notice');

        expect(
            CopyrightNoticeProvider.getCopyrightNotice(document, '//')
        ).toBe('//copyright notice');
    });


});
