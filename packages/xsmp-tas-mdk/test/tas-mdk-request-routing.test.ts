import { expect, test } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { URI } from 'langium';
import { setClangFormat } from '@xsmp/core/generator';
import { TasMdkGenerator } from 'xsmp-tas-mdk';
import {
    cleanupProfileGeneratorTestContext,
    createProfileGeneratorTestContext,
    generateProfileTree,
} from '../../xsmp/test/profile-generator-test-utils.js';

test.each(['ECSS_SMP_2020', 'ECSS_SMP_2025'])('routes property and operation requests for %s', async standard => {
    const context = await createProfileGeneratorTestContext();
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tas-request-routing-'));
    context.tempDirs.push(directory);
    fs.mkdirSync(path.join(directory, 'src'));
    try {
        const project = await context.parseProject(`project 'Routing' using '${standard}'\nsource 'src'\nprofile 'tas-mdk'`, {
            documentUri: URI.file(path.join(directory, 'xsmp.project')).toString(),
        });
        const document = await context.parseCatalogue(`catalogue Routing
namespace TasMdk {
    /** @uuid 29220000-0000-4000-8000-000000000001 */ public model Model {}
}
namespace routing {
    /** @uuid 29220000-0000-4000-8000-000000000002 */ public model Probe extends TasMdk.Model {
        public readOnly property Int32 reading
        public writeOnly property Int32 writing
        public readWrite property Int32 level
        /** Ordinary operation. */ private def void ope_ping()
    }
}`, { documentUri: URI.file(path.join(directory, 'src', 'Routing.xsmpcat')).toString() });
        context.documents.push(project, document);
        await context.services.shared.workspace.DocumentBuilder.build([project, document], { validation: true });
        expect(document.parseResult.parserErrors).toEqual([]);
        expect([...(project.diagnostics ?? []), ...(document.diagnostics ?? [])]).toEqual([]);
        setClangFormat(false);
        const output = await generateProfileTree(context, new TasMdkGenerator(context.services.shared), document, 'tas-request-routing-output-');
        const source = fs.readFileSync(path.join(output, 'src-gen/routing/ProbeGen.cpp'), 'utf8');
        const header = fs.readFileSync(path.join(output, 'include-gen/routing/ProbeGen.h'), 'utf8');
        for (const key of ['get_reading', 'set_writing', 'get_level', 'set_level', 'ope_ping']) {
            expect(header).toContain(`handlers["${key}"]`);
        }
        expect(header).not.toContain('handlers["set_reading"]');
        expect(header).not.toContain('handlers["get_writing"]');
        expect(source).toContain('#include <string>');
        expect(source).toContain('requestHandlers.find(request->GetOperationName())');
        expect(source).toContain('request->GetType() == ::Smp::RequestType::RT_Get ? "get_"');
        expect(source).toContain('request->GetType() == ::Smp::RequestType::RT_Set ? "set_"');
        expect(source).toContain(': "") + std::string{request->GetName()}');
        expect(source).toContain('requestHandlers.find(key)');
        expect(source).toContain('::TasMdk::Model::Invoke(request)');
    } finally {
        setClangFormat(true);
        await cleanupProfileGeneratorTestContext(context);
    }
});
