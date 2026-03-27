import { Cancellation, URI } from 'langium';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { DiagnosticSeverity } from 'vscode-languageserver';
import type { XsmpSharedServices } from '../../../../language/xsmp-module.js';
import { importAssembly } from './assembly.js';
import { importCatalogue } from './catalogue.js';
import { importConfiguration } from './configuration.js';
import { importLinkBase } from './linkbase.js';
import { SmpExternalReferenceResolver } from './reference-resolver.js';
import { importSchedule } from './schedule.js';
import {
    detectSmpImportKind,
    fileExists,
    getDefaultImportedXsmpPath,
    parseSmpXmlFile,
    type SmpImportKind,
    type SmpImportRequest,
    type SmpImportResult,
    type SmpXmlObject,
} from './shared.js';

type SmpDocumentImporter = (
    root: SmpXmlObject,
    warnings: string[],
    referenceResolver: SmpExternalReferenceResolver,
) => string;

const smpDocumentImporters: Record<SmpImportKind, SmpDocumentImporter> = {
    catalogue: (root, warnings, referenceResolver) => importCatalogue(root as never, warnings, referenceResolver),
    configuration: (root, warnings, referenceResolver) => importConfiguration(root as never, warnings, referenceResolver),
    linkbase: (root, warnings) => importLinkBase(root as never, warnings),
    assembly: (root, warnings, referenceResolver) => importAssembly(root as never, warnings, referenceResolver),
    schedule: (root, warnings, referenceResolver) => importSchedule(root as never, warnings, referenceResolver),
};

export class SmpImportService {
    protected readonly services: XsmpSharedServices;

    constructor(services: XsmpSharedServices) {
        this.services = services;
    }

    getDefaultOutputPath(inputPath: string): string {
        return getDefaultImportedXsmpPath(inputPath);
    }

    async importFile(request: SmpImportRequest): Promise<SmpImportResult> {
        await this.services.ContributionRegistry.ready;
        await this.services.workspace.WorkspaceManager.ready;

        const inputPath = path.resolve(request.inputPath);
        const outputPath = path.resolve(request.outputPath ?? this.getDefaultOutputPath(inputPath));

        if (!request.overwrite && await fileExists(outputPath)) {
            throw new Error(`Refusing to overwrite existing file '${outputPath}'.`);
        }

        const parsedDocument = await parseSmpXmlFile(inputPath);
        const kind = detectSmpImportKind(parsedDocument);
        if (!kind) {
            throw new Error(`Unsupported SMP XML root '${parsedDocument.rootKey}'. Supported imports are Catalogue, Configuration, Link Base, Assembly, and Schedule.`);
        }

        const warnings: string[] = [];
        const referenceResolver = new SmpExternalReferenceResolver(this.services, inputPath);
        const content = this.importParsedDocument(kind, parsedDocument.root, warnings, referenceResolver);

        await this.ensureImportedDocumentParses(content, outputPath);
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, content, 'utf-8');

        return {
            kind,
            outputPath,
            warnings,
        };
    }

    protected async ensureImportedDocumentParses(content: string, outputPath: string): Promise<void> {
        const document = this.services.workspace.LangiumDocumentFactory.fromString(content, URI.file(outputPath));
        await this.services.workspace.DocumentBuilder.build(
            [document],
            { validation: true },
            Cancellation.CancellationToken.None,
        );

        if (document.parseResult.parserErrors.length > 0) {
            const details = document.parseResult.parserErrors
                .map(error => `${error.message} (${error.token.startLine}:${error.token.startColumn})`)
                .join('\n');
            throw new Error(`Imported XSMP source contains parser errors:\n${details}`);
        }

        const syntaxDiagnostics = (document.diagnostics ?? [])
            .filter(diagnostic => diagnostic.severity === DiagnosticSeverity.Error && diagnostic.source === 'parser');
        if (syntaxDiagnostics.length > 0) {
            const details = syntaxDiagnostics
                .map(error => `${error.message} (${error.range.start.line + 1}:${error.range.start.character + 1})`)
                .join('\n');
            throw new Error(`Imported XSMP source contains syntax diagnostics:\n${details}`);
        }
    }

    protected importParsedDocument(
        kind: NonNullable<ReturnType<typeof detectSmpImportKind>>,
        root: SmpXmlObject,
        warnings: string[],
        referenceResolver: SmpExternalReferenceResolver,
    ): string {
        return smpDocumentImporters[kind](root, warnings, referenceResolver);
    }
}

export { getDefaultImportedXsmpPath } from './shared.js';
