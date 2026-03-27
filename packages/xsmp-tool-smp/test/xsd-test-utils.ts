import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

export type SmpSchemaKind =
    | 'catalogue'
    | 'package'
    | 'configuration'
    | 'linkbase'
    | 'assembly'
    | 'schedule';

export type SmpStandard = 'ECSS_SMP_2020' | 'ECSS_SMP_2025';

const xsdRoot = path.resolve(__dirname, 'xsd');
const l1Spec2020Root = path.join(xsdRoot, 'l1-2020');
const l1Spec2025Root = path.join(xsdRoot, 'l1-2025');
const l2SpecRoot = path.join(xsdRoot, 'l2', 'Smdl');

const xmlSchemaStub = `<?xml version="1.0"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
           targetNamespace="http://www.w3.org/XML/1998/namespace"
           xmlns:xml="http://www.w3.org/XML/1998/namespace"
           elementFormDefault="qualified"
           attributeFormDefault="qualified">
  <xs:attribute name="lang" type="xs:language"/>
</xs:schema>
`;

export function hasXmllint(): boolean {
    return spawnSync('xmllint', ['--version'], { stdio: 'ignore' }).status === 0;
}

function patchFile(filePath: string, update: (content: string) => string): void {
    const current = fs.readFileSync(filePath, 'utf8');
    fs.writeFileSync(filePath, update(current));
}

function prepareL1SchemaBundle(tmpDir: string, standard: SmpStandard): Record<'catalogue' | 'package' | 'configuration', string> {
    if (standard === 'ECSS_SMP_2025') {
        const schemaRoot = path.join(tmpDir, 'l1-2025');
        fs.cpSync(l1Spec2025Root, schemaRoot, { recursive: true });

        return {
            catalogue: path.join(schemaRoot, 'Catalogue.xsd'),
            package: path.join(schemaRoot, 'Package.xsd'),
            configuration: path.join(schemaRoot, 'Configuration.xsd'),
        };
    }

    const schemaRoot = path.join(tmpDir, 'l1-2020');
    fs.cpSync(l1Spec2020Root, schemaRoot, { recursive: true });

    const xmlSchemaPath = path.join(schemaRoot, 'xml.xsd');
    fs.writeFileSync(xmlSchemaPath, xmlSchemaStub);

    patchFile(path.join(schemaRoot, 'xlink.xsd'), content =>
        content.replace('http://www.w3.org/2001/xml.xsd', pathToFileURL(xmlSchemaPath).href)
    );

    return {
        catalogue: path.join(schemaRoot, 'Smdl', 'Catalogue.xsd'),
        package: path.join(schemaRoot, 'Smdl', 'Package.xsd'),
        configuration: path.join(schemaRoot, 'Smdl', 'Configuration.xsd'),
    };
}

function prepareL2SchemaBundle(tmpDir: string): Record<'linkbase' | 'assembly' | 'schedule', string> {
    const schemaRoot = path.join(tmpDir, 'l2');
    const coreRoot = path.join(schemaRoot, 'Core');
    const smdlRoot = path.join(schemaRoot, 'Smdl');

    fs.mkdirSync(coreRoot, { recursive: true });
    fs.mkdirSync(smdlRoot, { recursive: true });

    fs.copyFileSync(path.join(l1Spec2020Root, 'Core', 'Elements.xsd'), path.join(coreRoot, 'Elements.xsd'));
    fs.copyFileSync(path.join(l1Spec2020Root, 'Core', 'Types.xsd'), path.join(coreRoot, 'Types.xsd'));
    fs.copyFileSync(path.join(l1Spec2020Root, 'xlink.xsd'), path.join(schemaRoot, 'xlink.xsd'));
    fs.copyFileSync(path.join(l2SpecRoot, 'LinkBase.xsd'), path.join(smdlRoot, 'LinkBase.xsd'));
    fs.copyFileSync(path.join(l2SpecRoot, 'Assembly.xsd'), path.join(smdlRoot, 'Assembly.xsd'));
    fs.copyFileSync(path.join(l2SpecRoot, 'Schedule.xsd'), path.join(smdlRoot, 'Schedule.xsd'));

    const xmlSchemaPath = path.join(schemaRoot, 'xml.xsd');
    fs.writeFileSync(xmlSchemaPath, xmlSchemaStub);

    patchFile(path.join(schemaRoot, 'xlink.xsd'), content =>
        content.replace('http://www.w3.org/2001/xml.xsd', pathToFileURL(xmlSchemaPath).href)
    );

    for (const fileName of ['LinkBase.xsd', 'Assembly.xsd', 'Schedule.xsd']) {
        patchFile(path.join(smdlRoot, fileName), content =>
            content
                .replace('schemaLocation="xlink.xsd"', 'schemaLocation="../xlink.xsd"')
                .replace('schemaLocation="Elements.xsd"', 'schemaLocation="../Core/Elements.xsd"')
                .replace('schemaLocation="Types.xsd"', 'schemaLocation="../Core/Types.xsd"')
                .replace(/Elements:DayTimeDuration/g, 'xsd:duration')
        );
    }

    return {
        linkbase: path.join(smdlRoot, 'LinkBase.xsd'),
        assembly: path.join(smdlRoot, 'Assembly.xsd'),
        schedule: path.join(smdlRoot, 'Schedule.xsd'),
    };
}

export function assertXmlConformsToXsd(xmlPath: string, kind: SmpSchemaKind, standard: SmpStandard = 'ECSS_SMP_2020'): void {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xsmp-xsd-'));
    try {
        const schemaPath = kind === 'catalogue' || kind === 'package' || kind === 'configuration'
            ? prepareL1SchemaBundle(tmpDir, standard)[kind]
            : prepareL2SchemaBundle(tmpDir)[kind];

        execFileSync('xmllint', ['--noout', '--schema', schemaPath, xmlPath], {
            encoding: 'utf8',
            stdio: 'pipe',
        });
    } catch (error) {
        const details = error instanceof Error && 'stderr' in error
            ? String((error as { stderr?: string }).stderr ?? '')
            : String(error);
        throw new Error(`XSD validation failed for ${path.basename(xmlPath)} (${kind}).\n${details}`);
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
}
