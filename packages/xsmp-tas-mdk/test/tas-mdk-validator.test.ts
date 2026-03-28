import { afterEach, describe, expect, test } from 'vitest';
import { Cancellation, type LangiumDocument, URI } from 'langium';
import { NodeFileSystem } from 'langium/node';
import { DiagnosticSeverity } from 'vscode-languageserver';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { Catalogue } from 'xsmp/ast-partial';
import { createBuiltinTestXsmpServices } from '../../xsmp/test/test-services.js';

const tempDirs: string[] = [];

afterEach(() => {
    while (tempDirs.length > 0) {
        fs.rmSync(tempDirs.pop()!, { recursive: true, force: true });
    }
});

describe('TAS MDK validator', () => {
    test('reports catalogue naming, inheritance, and forbidden grammar constructs', async () => {
        const document = await loadTasMdkCatalogue(
            `
catalogue WrongName

namespace TasMdk
{
    /** @uuid 11111111-1111-4111-8111-111111111111 */
    public model Model
    {
    }

    /** @uuid 22222222-2222-4222-8222-222222222222 */
    public service Service
    {
    }
}

namespace demo
{
    /** @uuid 33333333-3333-4333-8333-333333333333 */
    public event TypedEvent extends Int32

    /** @uuid 44444444-4444-4444-8444-444444444444 */
    public model PlainModel
    {
    }

    /** @uuid 55555555-5555-4555-8555-555555555555 */
    public service PlainService
    {
    }

    /** @uuid 66666666-6666-4666-8666-666666666666 */
    public class LegacyClass
    {
    }
}
`,
            { fileName: 'demo.xsmpcat' },
        );

        expect(errorMessages(document)).toEqual(expect.arrayContaining([
            "The Catalogue name 'WrongName' must match the file name 'demo'. Rename the file or the Catalogue name accordingly.",
            "The Model PlainModel must extends 'TasMdk.Model' or one of its sub class.",
            "The Service PlainService must extends 'TasMdk.Service' or one of its sub class.",
            'In Gram environment, an Event shall only be of type void.',
            'Classes are not allowed in the Gram environment.',
        ]));
    });

    test('enforces TAS naming, publicability, and documentation rules for component members', async () => {
        const document = await loadTasMdkCatalogue(`
catalogue Demo

namespace TasMdk
{
    /** @uuid 11111111-1111-4111-8111-111111111111 */
    public model Model
    {
    }

    /** @uuid 22222222-2222-4222-8222-222222222222 */
    public service Service
    {
    }
}

namespace demo
{
    /** @uuid 33333333-3333-4333-8333-333333333333 */
    public event DataEvent extends Int32

    /** @uuid 44444444-4444-4444-8444-444444444444 */
    public event VoidEvent

    /** @uuid 55555555-5555-4555-8555-555555555555 */
    public interface IPort
    {
    }

    /** @uuid 66666666-6666-4666-8666-666666666666 */
    public struct Payload
    {
        field Bool ok = false
    }

    /** @uuid 77777777-7777-4777-8777-777777777777 */
    public model BrokenModel extends TasMdk.Model
    {
        field Smp.String8 fea_label = "demo"
        public input output field Int32 value = 0
        input field Int32 state = 0
        output field Int32 sta_count = 0
        field Int32 misc = 0

        eventsource DataEvent done
        eventsink VoidEvent inbound
        entrypoint tick
        reference IPort port

        public def Payload run(in Payload payload)
        def void ping()
    }
}
`);

        expect(errorMessages(document)).toEqual(expect.arrayContaining([
            'String8 type is forbidden for fields.',
            'A field cannot be public in Gram environment.',
            'A field cannot be both an input and an output.',
            "The name of an input field must start with 'inp_'.",
            "The name of an output field must start with 'out_'.",
            "The name of a feature field must start with 'fea_' and a state must start with 'sta_'.",
            'The Field description is missing.',
            "The name of an EventSource must start with 'eso_'.",
            'An EventSource must be of type void.',
            'The EventSource description is missing.',
            "The name of an EventSink must start with 'esi_'.",
            'The EventSink description is missing.',
            "The name of an EntryPoint must start with 'ept_'.",
            'The EntryPoint description is missing.',
            "The name of a Reference must start with 'ref_'.",
            'An operation cannot be public in Gram environment.',
            "The name of an operation must start with 'ope_'.",
            'A parameter of type Structure is not publicable.',
            'The Operation description is missing.',
        ]));
    });

    test('accepts documented TAS models and services that follow the profile rules', async () => {
        const document = await loadTasMdkCatalogue(`
catalogue Demo

namespace TasMdk
{
    /** @uuid 11111111-1111-4111-8111-111111111111 */
    public model Model
    {
    }

    /** @uuid 22222222-2222-4222-8222-222222222222 */
    public service Service
    {
    }
}

namespace demo
{
    /** @uuid 33333333-3333-4333-8333-333333333333 */
    public event VoidEvent

    /** @uuid 44444444-4444-4444-8444-444444444444 */
    public interface IPort
    {
    }

    /** @uuid 55555555-5555-4555-8555-555555555555 */
    public model FlightModel extends TasMdk.Model
    {
        /** Feature field */
        field Int32 fea_state = 0

        /** Input field */
        input field Int32 inp_command = 0

        /** Output field */
        output field Int32 out_report = 0

        /** Event source */
        eventsource VoidEvent eso_done

        /** Event sink */
        eventsink VoidEvent esi_done

        /** Entry point */
        entrypoint ept_step

        reference IPort ref_port

        /** Publicable operation */
        def Bool ope_check(in Bool requested)
    }

    /** @uuid 66666666-6666-4666-8666-666666666666 */
    public service FlightService extends TasMdk.Service
    {
        /** Feature field */
        field Int32 fea_health = 0

        /** Entry point */
        entrypoint ept_run

        /** Publicable operation */
        def void ope_ping()
    }
}
`);

        expect(errorMessages(document)).toEqual([]);
    });
});

async function loadTasMdkCatalogue(
    catalogueSource: string,
    options?: { fileName?: string },
): Promise<LangiumDocument<Catalogue>> {
    const services = await createBuiltinTestXsmpServices(NodeFileSystem);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-tas-mdk-validator-'));
    const srcDir = path.join(tempDir, 'src');
    const fileName = options?.fileName ?? 'Demo.xsmpcat';
    tempDirs.push(tempDir);

    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
        path.join(tempDir, 'xsmp.project'),
        [
            'project "Demo" using "ECSS_SMP_2025"',
            'profile "tas-mdk"',
            'source "src"',
            '',
        ].join('\n'),
        'utf-8',
    );
    fs.writeFileSync(path.join(srcDir, fileName), catalogueSource.trimStart(), 'utf-8');

    await services.shared.workspace.WorkspaceManager.initializeWorkspace([
        { name: 'Demo', uri: URI.file(tempDir).toString() },
    ]);
    const documents = services.shared.workspace.LangiumDocuments.all.toArray();
    await services.shared.workspace.DocumentBuilder.build(
        documents,
        { validation: true },
        Cancellation.CancellationToken.None,
    );

    const catalogueUri = URI.file(path.join(srcDir, fileName)).toString();
    const document = documents.find(candidate => candidate.uri.toString() === catalogueUri);
    if (!document) {
        throw new Error(`Unable to find catalogue '${catalogueUri}'.`);
    }
    return document as LangiumDocument<Catalogue>;
}

function errorMessages(document: LangiumDocument): string[] {
    return (document.diagnostics ?? [])
        .filter(diagnostic => diagnostic.severity === DiagnosticSeverity.Error)
        .map(diagnostic => diagnostic.message);
}
