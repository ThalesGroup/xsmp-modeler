import { DocumentState, interruptAndCheck, UriUtils } from 'langium';
import type { Cancellation, DocumentBuilder, IndexManager, LangiumDocument, LangiumDocuments, ServiceRegistry, URI } from 'langium';
import * as ast from '../generated/ast-partial.js';
import { DiagnosticSeverity } from 'vscode-languageserver';
import { SmpGenerator } from '../tools/smp/generator.js';
import pLimit from 'p-limit';
import type { Task, TaskAcceptor } from '../generator/generator.js';
import { XsmpSdkGenerator } from '../profiles/xsmp-sdk/generator.js';
import type { XsmpSharedServices } from '../xsmp-module.js';
import { PythonGenerator } from '../tools/python/generator.js';
import type { ProjectManager } from './project-manager.js';
import { TasMdkGenerator } from '../profiles/tas-mdk/generator.js';
import { TasMdkPythonGenerator } from '../profiles/tas-mdk/python-generator.js';
import { EsaCdkGenerator } from '../profiles/esa-cdk/generator.js';
import { ADocGenerator } from '../tools/adoc/generator.js';

const limit = pLimit(8);

export class XsmpDocumentGenerator {
    protected readonly langiumDocuments: LangiumDocuments;
    protected readonly serviceRegistry: ServiceRegistry;
    protected readonly indexManager: IndexManager;
    protected readonly smpGenerator: SmpGenerator;
    protected readonly xsmpSdkGenerator: XsmpSdkGenerator;
    protected readonly pythonGenerator: PythonGenerator;
    protected readonly builder: DocumentBuilder;
    protected readonly projectManager: ProjectManager;
    protected readonly tasMdkGenerator: TasMdkGenerator;
    protected readonly tasMdkPythonGenerator: TasMdkPythonGenerator;
    protected readonly esaCdkGenerator: EsaCdkGenerator;
    protected readonly adocGenerator: ADocGenerator;

    constructor(services: XsmpSharedServices) {
        this.langiumDocuments = services.workspace.LangiumDocuments;
        this.indexManager = services.workspace.IndexManager;
        this.serviceRegistry = services.ServiceRegistry;
        this.smpGenerator = new SmpGenerator(services);
        this.xsmpSdkGenerator = new XsmpSdkGenerator(services);
        this.pythonGenerator = new PythonGenerator(services);
        this.builder = services.workspace.DocumentBuilder;
        this.projectManager = services.workspace.ProjectManager;

        this.tasMdkGenerator = new TasMdkGenerator(services);
        this.tasMdkPythonGenerator = new TasMdkPythonGenerator(services);

        this.esaCdkGenerator = new EsaCdkGenerator(services);
        this.adocGenerator = new ADocGenerator(services);
    }

    private isValid(document: LangiumDocument): boolean {
        return document.state === DocumentState.Validated && document.parseResult.parserErrors.length === 0 && !document.diagnostics?.some(d => d.severity === DiagnosticSeverity.Error);
    }

    async generate(uri: URI, cancelToken: Cancellation.CancellationToken): Promise<void> {
        const document = this.langiumDocuments.getDocument(uri);
        if (!document) {
            return;
        }

        if (ast.isProject(document.parseResult.value)) {
            return await this.generateProject(document.parseResult.value, cancelToken);
        }

        const project = this.projectManager.getProject(document)
        if (project && this.isValid(document))
            return await this.generateProject(project, cancelToken);


    }

    async generateProject(project: ast.Project, cancelToken: Cancellation.CancellationToken): Promise<void> {
        const projectUri = UriUtils.dirname(project.$document?.uri as URI);

        // clean up previous generated files
        for (const profile of project.elements.filter(ast.isProfileReference)) {
            switch (profile.profile?.ref?.name) {
                case 'org.eclipse.xsmp.profile.xsmp-sdk':
                case 'xsmp-sdk':
                    this.xsmpSdkGenerator.clean(projectUri);
                    break;
                case 'org.eclipse.xsmp.profile.esa-cdk':
                case 'esa-cdk':
                    this.esaCdkGenerator.clean(projectUri);
                    break;
                case 'org.eclipse.xsmp.profile.tas-mdk':
                    this.tasMdkGenerator.clean(projectUri);
                    this.tasMdkPythonGenerator.clean(projectUri);
                    break;
            }
        }

        for (const tool of project.elements.filter(ast.isToolReference)) {
            switch (tool.tool?.ref?.name) {
                case 'org.eclipse.xsmp.tool.smp':
                case 'smp':
                    this.smpGenerator.clean(projectUri);
                    break;
                case 'org.eclipse.xsmp.tool.adoc':
                case 'adoc':
                    this.adocGenerator.clean(projectUri);
                    break;
                case 'org.eclipse.xsmp.tool.python':
                case 'python':
                    this.pythonGenerator.clean(projectUri);
                    break;
            }
        }

        // generate files

        const documents = this.langiumDocuments.all.filter(doc => this.isValid(doc) && project === this.projectManager.getProject(doc)).toArray();
        const tasks: Array<Promise<void>> = [];

        const taskAcceptor: TaskAcceptor = (task: Task) => { tasks.push(limit(task)); };

        for (const profile of project.elements.filter(ast.isProfileReference)) {
            switch (profile.profile?.ref?.name) {
                case 'org.eclipse.xsmp.profile.xsmp-sdk':
                case 'xsmp-sdk':
                    documents.forEach(doc => this.xsmpSdkGenerator.generate(doc.parseResult.value, projectUri, taskAcceptor));
                    break;
                case 'org.eclipse.xsmp.profile.esa-cdk':
                case 'esa-cdk':
                    documents.forEach(doc => this.esaCdkGenerator.generate(doc.parseResult.value, projectUri, taskAcceptor));
                    break;
                case 'org.eclipse.xsmp.profile.tas-mdk':
                    documents.forEach(doc => this.tasMdkGenerator.generate(doc.parseResult.value, projectUri, taskAcceptor));
                    documents.forEach(doc => this.tasMdkPythonGenerator.generate(doc.parseResult.value, projectUri, taskAcceptor));
                    break;
            }
        }

        for (const tool of project.elements.filter(ast.isToolReference)) {
            switch (tool.tool?.ref?.name) {
                case 'org.eclipse.xsmp.tool.smp':
                case 'smp':
                    documents.forEach(doc => this.smpGenerator.generate(doc.parseResult.value, projectUri, taskAcceptor));
                    break;
                case 'org.eclipse.xsmp.tool.adoc':
                case 'adoc':
                    documents.forEach(doc => this.adocGenerator.generate(doc.parseResult.value, projectUri, taskAcceptor));
                    break;
                case 'org.eclipse.xsmp.tool.python':
                case 'python':
                    documents.forEach(doc => this.pythonGenerator.generate(doc.parseResult.value, projectUri, taskAcceptor));
                    break;
            }
        }

        await interruptAndCheck(cancelToken);

        if (tasks.length > 0) {
            await Promise.all(tasks);
        }
    }
}
