import * as fs from 'node:fs';
import * as ast from 'xsmp/ast';
import { type URI, UriUtils, type AstNode, type Reference, AstUtils, isReference } from 'langium';
import { expandToString as s } from 'langium/generate';
import type { XsmpSharedServices } from 'xsmp';
import { type TaskAcceptor, type XsmpGenerator } from 'xsmp/generator';
import type { XsmpPathService } from 'xsmp/references';
import {
    fqn,
    getLower,
    getNodeType,
    getRealVisibility,
    getUpper,
    type DocumentationHelper,
    type AttributeHelper,
    ViewKind,
    VisibilityKind,
    VisibilityKinds,
} from 'xsmp/utils';
import * as Solver from 'xsmp/utils';

/**
 * AsciiDoc generator for XSMP documents.
 * Generates documentation from XSMP catalogue, configuration, assembly, link-base and schedule models.
 */
export class ADocGenerator implements XsmpGenerator {
    protected readonly docHelper: DocumentationHelper;
    protected readonly attrHelper: AttributeHelper;
    protected readonly pathService: XsmpPathService;

    constructor(services: XsmpSharedServices) {
        this.docHelper = services.DocumentationHelper;
        this.attrHelper = services.AttributeHelper;
        this.pathService = services.PathService;
    }

    static readonly defaultDocFolder = 'adoc-gen';

    generate(node: AstNode, projectUri: URI, acceptTask: TaskAcceptor): void {
        switch (node.$type) {
            case ast.Catalogue.$type:
                acceptTask(() => this.generateCatalogue(node as ast.Catalogue, projectUri));
                break;
            case ast.Configuration.$type:
                acceptTask(() => this.generateConfiguration(node as ast.Configuration, projectUri));
                break;
            case ast.Assembly.$type:
                acceptTask(() => this.generateAssembly(node as ast.Assembly, projectUri));
                break;
            case ast.LinkBase.$type:
                acceptTask(() => this.generateLinkBase(node as ast.LinkBase, projectUri));
                break;
            case ast.Schedule.$type:
                acceptTask(() => this.generateSchedule(node as ast.Schedule, projectUri));
                break;
        }
    }

    clean(projectUri: URI): void {
        fs.rmSync(UriUtils.joinPath(projectUri, ADocGenerator.defaultDocFolder).fsPath, { recursive: true, force: true });
    }

    public async generateCatalogue(catalogue: ast.Catalogue, projectUri: URI): Promise<void> {
        await this.writeGeneratedDocument(catalogue, projectUri, await this.doGenerateCatalogue(catalogue));
    }

    public async generateConfiguration(configuration: ast.Configuration, projectUri: URI): Promise<void> {
        await this.writeGeneratedDocument(configuration, projectUri, await this.doGenerateConfiguration(configuration));
    }

    public async generateAssembly(assembly: ast.Assembly, projectUri: URI): Promise<void> {
        await this.writeGeneratedDocument(assembly, projectUri, await this.doGenerateAssembly(assembly));
    }

    public async generateLinkBase(linkBase: ast.LinkBase, projectUri: URI): Promise<void> {
        await this.writeGeneratedDocument(linkBase, projectUri, await this.doGenerateLinkBase(linkBase));
    }

    public async generateSchedule(schedule: ast.Schedule, projectUri: URI): Promise<void> {
        await this.writeGeneratedDocument(schedule, projectUri, await this.doGenerateSchedule(schedule));
    }

    private async writeGeneratedDocument(document: ast.Document, projectUri: URI, content: string): Promise<void> {
        const outputDir = UriUtils.joinPath(projectUri, ADocGenerator.defaultDocFolder);
        await fs.promises.mkdir(outputDir.fsPath, { recursive: true });
        const outputFile = UriUtils.joinPath(outputDir, this.getOutputFileName(document));
        await fs.promises.writeFile(outputFile.fsPath, content);
    }

    private getOutputFileName(document: ast.Document): string {
        return `${this.getSourceBasename(document)}-gen.adoc`;
    }

    private getSourceBasename(document: ast.Document): string {
        const uri = AstUtils.getDocument(document).uri;
        return UriUtils.basename(uri).replace(/\.[^.]+$/, '');
    }

    // ========== Shared Rendering Helpers ==========

    /**
     * Get a short representation of an expression value.
     */
    private getShortValue(expr: ast.Expression | undefined): string | undefined {
        if (!expr) {
            return undefined;
        }

        if (ast.isCollectionLiteral(expr)) {
            return this.getShortValuesArray(expr);
        }
        if (ast.isKeywordExpression(expr)) {
            return expr.name;
        }
        try {
            const value = Solver.getValue(expr);
            if (value) {
                return value.toString();
            }
        } catch {
            // ignore solver exceptions
        }

        return undefined;
    }

    /**
     * Get array representation of a collection literal.
     */
    private getShortValuesArray(cl: ast.CollectionLiteral): string {
        const results: string[] = [];

        for (const expression of cl.elements) {
            if (ast.isCollectionLiteral(expression)) {
                results.push(this.getShortValuesArray(expression));
            } else if (ast.isDesignatedInitializer(expression)) {
                results.push(this.getShortValue(expression.expr) ?? '?');
            } else {
                try {
                    const value = Solver.getValue(expression);
                    results.push(value?.toString() ?? '?');
                } catch {
                    results.push('?');
                }
            }
        }

        const text = `[${results.join(', ')}]`;
        return text.startsWith('[[') ? `\\${text}` : text;
    }

    private escapeDescription(str: string | undefined): string {
        return this.escapeCell(str);
    }

    private escapeCell(str: string | undefined): string {
        if (!str) {
            return '';
        }
        return str.replaceAll('|', '\\|').replaceAll('\n', ' ');
    }

    private quoteIfBare(value: string): string {
        return value.startsWith('"') || value.startsWith("'") ? value : JSON.stringify(value);
    }

    private renderDescriptionBlock(description: string | undefined): string | undefined {
        if (!description) {
            return undefined;
        }
        return s`
            ++++
            ${description}
            ++++
        `;
    }

    private getNodeDescription(node: AstNode): string | undefined {
        if (ast.isNamedElement(node) || ast.isReturnParameter(node)) {
            return this.docHelper.getDescription(node);
        }
        const jsDoc = this.docHelper.getJSDoc(node);
        if (!jsDoc) {
            return undefined;
        }

        const result: string[] = [];
        for (const element of jsDoc.elements) {
            if ('name' in element && typeof element.name === 'string' && !element.inline) {
                break;
            }
            result.push(element.toString());
        }
        return result.length > 0 ? result.join('\n').trim() : undefined;
    }

    private heading(level: number, title: string): string {
        return `${'='.repeat(Math.max(1, Math.min(level, 6)))} ${title}`;
    }

    private infoRow(label: string, value: string | number | boolean | undefined): string | undefined {
        if (value === undefined || value === '') {
            return undefined;
        }
        return `.^h|${label} |${this.escapeCell(String(value))}`;
    }

    private renderDocumentHeader(
        document: ast.Document,
        kind: string,
        defaultTitle: string,
        extraRows: Array<string | undefined> = [],
    ): string {
        const title = this.docHelper.getTitle(document) ?? defaultTitle;
        const description = this.docHelper.getDescription(document);
        const rows = [
            this.infoRow('Kind', kind),
            this.infoRow('Name', document.name),
            this.infoRow('Date', this.docHelper.getDate(document)?.toString().trim()),
            this.infoRow('Creator', this.docHelper.getCreator(document)),
            this.infoRow('Version', this.docHelper.getVersion(document)),
            ...extraRows,
        ].filter(Boolean).join('\n');

        return s`
            = ${title}

            ${this.renderDescriptionBlock(description)}

            .${document.name}'s information
            [%autowidth.stretch]
            |===
            ${rows}
            |===
        `;
    }

    private formatPath(path: ast.Path | undefined, includeUnsafe = true): string {
        return this.pathService.stringifyPath(path, includeUnsafe) ?? '';
    }

    private formatLocalReference(reference: ast.LocalNamedReference | undefined, includeUnsafe = true): string {
        return this.pathService.stringifyLocalNamedReference(reference, includeUnsafe) ?? '';
    }

    private formatReferenceName<T extends AstNode & { name?: string }>(
        ref: Reference<T> | undefined,
        qualified: boolean = false,
    ): string {
        if (!ref) {
            return '';
        }
        if (ref.ref) {
            return qualified && ast.isNamedElement(ref.ref) ? fqn(ref.ref, '::') : (ref.ref.name ?? '');
        }
        return ref.$refText ?? '';
    }

    private formatImplementation(model: ast.ModelInstance): string {
        if (model.implementation?.ref) {
            return fqn(model.implementation.ref, '::');
        }
        return model.implementation?.$refText ?? model.strImplementation ?? '';
    }

    private formatTemplateParameter(parameter: ast.TemplateParameter): { type: string; defaultValue: string } {
        switch (parameter.$type) {
            case ast.Int32Parameter.$type:
                return {
                    type: 'int32',
                    defaultValue: (parameter as ast.Int32Parameter).value?.toString() ?? '',
                };
            case ast.StringParameter.$type:
                return {
                    type: 'string',
                    defaultValue: (parameter as ast.StringParameter).value ?? '',
                };
            default:
                return { type: parameter.$type, defaultValue: '' };
        }
    }

    private formatTemplateArgument(parameter: ast.TemplateArgument): string {
        const name = parameter.parameter.ref?.name ?? parameter.parameter.$refText ?? '';
        switch (parameter.$type) {
            case ast.Int32Argument.$type:
                return `${name} = ${(parameter as ast.Int32Argument).value.toString()}`;
            case ast.StringArgument.$type:
                return `${name} = ${(parameter as ast.StringArgument).value}`;
            default:
                return name;
        }
    }

    private formatValue(value: ast.Value): string {
        switch (value.$type) {
            case ast.BoolValue.$type:
                return (value as ast.BoolValue).value ? 'true' : 'false';
            case ast.Char8Value.$type:
                return this.quoteIfBare((value as ast.Char8Value).value);
            case ast.DateTimeValue.$type:
                return (value as ast.DateTimeValue).value;
            case ast.DurationValue.$type:
                return (value as ast.DurationValue).value;
            case ast.FloatValue.$type:
                return (value as ast.FloatValue).value;
            case ast.Float32Value.$type:
                return (value as ast.Float32Value).value;
            case ast.Float64Value.$type:
                return (value as ast.Float64Value).value;
            case ast.IntValue.$type:
                return (value as ast.IntValue).value.toString();
            case ast.Int8Value.$type:
                return (value as ast.Int8Value).value.toString();
            case ast.Int16Value.$type:
                return (value as ast.Int16Value).value.toString();
            case ast.Int32Value.$type:
                return (value as ast.Int32Value).value.toString();
            case ast.Int64Value.$type:
                return (value as ast.Int64Value).value.toString();
            case ast.UInt8Value.$type:
                return (value as ast.UInt8Value).value.toString();
            case ast.UInt16Value.$type:
                return (value as ast.UInt16Value).value.toString();
            case ast.UInt32Value.$type:
                return (value as ast.UInt32Value).value.toString();
            case ast.UInt64Value.$type:
                return (value as ast.UInt64Value).value.toString();
            case ast.String8Value.$type:
                return this.quoteIfBare((value as ast.String8Value).value);
            case ast.EnumerationValue.$type: {
                const enumeration = value as ast.EnumerationValue;
                if (enumeration.reference?.ref) {
                    return fqn(enumeration.reference.ref, '::');
                }
                return enumeration.reference?.$refText ?? enumeration.value?.toString() ?? '';
            }
            case ast.ArrayValue.$type: {
                const rendered = `[${(value as ast.ArrayValue).elements.map(element => this.formatValue(element)).join(', ')}]`;
                return rendered.startsWith('[[') ? `\\${rendered}` : rendered;
            }
            case ast.StructureValue.$type:
                return `{ ${(value as ast.StructureValue).elements.map(element => this.formatValue(element)).join(', ')} }`;
            case ast.CfgStructureFieldValue.$type: {
                const fieldValue = value as ast.CfgStructureFieldValue;
                return `${fieldValue.unsafe ? 'unsafe ' : ''}${fieldValue.field} = ${this.formatValue(fieldValue.value)}`;
            }
            case ast.FieldValue.$type: {
                const fieldValue = value as ast.FieldValue;
                const fieldPath = this.formatPath(fieldValue.field);
                return fieldPath ? `${fieldPath} = ${this.formatValue(fieldValue.value)}` : this.formatValue(fieldValue.value);
            }
            default:
                return '?';
        }
    }

    private formatParameterValues(parameters: ast.ParameterValue[]): string {
        if (parameters.length === 0) {
            return '';
        }
        return parameters.map(parameter => `${parameter.parameter} = ${this.formatValue(parameter.value)}`).join(', ');
    }

    private formatLinkKind(link: ast.Link): string {
        switch (link.$type) {
            case ast.EventLink.$type:
                return 'event';
            case ast.FieldLink.$type:
                return 'field';
            case ast.InterfaceLink.$type:
                return 'interface';
            default:
                return 'link';
        }
    }

    private formatScheduleEventAnchor(event: ast.Event): string {
        switch (event.$type) {
            case ast.EpochEvent.$type:
                return `epoch ${(event as ast.EpochEvent).epochTime}`;
            case ast.MissionEvent.$type:
                return `mission ${(event as ast.MissionEvent).missionTime}`;
            case ast.SimulationEvent.$type:
                return `simulation ${(event as ast.SimulationEvent).simulationTime}`;
            case ast.ZuluEvent.$type:
                return `zulu ${(event as ast.ZuluEvent).zuluTime}`;
            case ast.GlobalEventTriggeredEvent.$type: {
                const triggered = event as ast.GlobalEventTriggeredEvent;
                const parts = [`on ${this.quoteIfBare(triggered.startEvent)}`];
                if (triggered.stopEvent) {
                    parts.push(`until ${this.quoteIfBare(triggered.stopEvent)}`);
                }
                if (triggered.timeKind) {
                    parts.push(`using ${triggered.timeKind}`);
                }
                return parts.join(' ');
            }
            default:
                return '';
        }
    }

    /**
     * Get field kinds (flags) from a field.
     */
    private getFieldKinds(field: ast.Field): string[] {
        const kinds: string[] = [];
        if (field.modifiers.includes('output')) kinds.push('output');
        if (field.modifiers.includes('input')) kinds.push('input');
        if (field.modifiers.includes('transient'))
            kinds.push('transient');
        else
            kinds.push('state');
        if (field.modifiers.includes('forcible')) kinds.push('forcible');
        if (field.modifiers.includes('failure')) kinds.push('failure');
        return kinds;
    }

    /**
     * Get the string representation of a multiplicity value.
     */
    private getMultiplicityValue(value: bigint | undefined): string {
        if (value === undefined) {
            return '?';
        }
        if (value < 0) {
            return '*';
        }
        return value.toString();
    }

    private renderTemplateParameters(parameters: ast.TemplateParameter[], level: number): string | undefined {
        if (parameters.length === 0) {
            return undefined;
        }

        return s`
            ${this.heading(level, 'Template Parameters')}

            .Template parameters
            [%autowidth.stretch]
            |===
            |Name |Type |Default

            ${parameters.map(parameter => {
                const rendered = this.formatTemplateParameter(parameter);
                return s`
                    |${parameter.name}
                    |${rendered.type}
                    |${this.escapeCell(rendered.defaultValue)}
                `;
            }).join('\n')}
            |===
        `;
    }

    private renderConfigurationIncludes(
        includes: ast.ConfigurationUsage[],
        level: number,
        title: string,
    ): string | undefined {
        if (includes.length === 0) {
            return undefined;
        }

        const hasDescription = includes.some(include => this.getNodeDescription(include) !== undefined);
        return s`
            ${this.heading(level, title)}

            .${title}
            [%autowidth.stretch]
            |===
            |Configuration |Path${hasDescription ? ' |Description' : ''}

            ${includes.map(include => s`
                |${this.formatReferenceName(include.configuration)}
                |${this.formatPath(include.path)}
                ${hasDescription ? `|${this.escapeDescription(this.getNodeDescription(include))}` : undefined}
            `).join('\n')}
            |===
        `;
    }

    private renderConfigurationFieldValues(
        values: ast.FieldValue[],
        level: number,
        title: string,
    ): string | undefined {
        if (values.length === 0) {
            return undefined;
        }

        const hasDescription = values.some(value => this.getNodeDescription(value) !== undefined);
        return s`
            ${this.heading(level, title)}

            .${title}
            [%autowidth.stretch]
            |===
            |Field |Value${hasDescription ? ' |Description' : ''}

            ${values.map(value => s`
                |${this.formatPath(value.field)}
                |${this.escapeCell(this.formatValue(value.value))}
                ${hasDescription ? `|${this.escapeDescription(this.getNodeDescription(value))}` : undefined}
            `).join('\n')}
            |===
        `;
    }

    private renderAssemblyStatements(
        elements: Array<ast.FieldValue | ast.GlobalEventHandler | ast.Invocation>,
        level: number,
        title: string,
    ): string | undefined {
        if (elements.length === 0) {
            return undefined;
        }

        const hasDescription = elements.some(element => this.getNodeDescription(element) !== undefined);
        return s`
            ${this.heading(level, title)}

            .${title}
            [%autowidth.stretch]
            |===
            |Kind |Target |Details${hasDescription ? ' |Description' : ''}

            ${elements.map(element => {
                let kind = '';
                let target = '';
                let details = '';

                if (ast.isFieldValue(element)) {
                    kind = 'field';
                    target = this.formatPath(element.field);
                    details = this.formatValue(element.value);
                } else if (ast.isGlobalEventHandler(element)) {
                    kind = 'subscribe';
                    target = this.formatLocalReference(element.entryPoint);
                    details = this.quoteIfBare(element.globalEventName);
                } else if (ast.isOperationCall(element)) {
                    kind = 'call';
                    target = this.formatLocalReference(element.operation);
                    details = this.formatParameterValues(element.parameters);
                } else if (ast.isPropertyValue(element)) {
                    kind = 'property';
                    target = this.formatLocalReference(element.property);
                    details = this.formatValue(element.value);
                }

                return s`
                    |${kind}
                    |${this.escapeCell(target)}
                    |${this.escapeCell(details)}
                    ${hasDescription ? `|${this.escapeDescription(this.getNodeDescription(element))}` : undefined}
                `;
            }).join('\n')}
            |===
        `;
    }

    private renderLinksTable(links: ast.Link[], level: number, title: string): string | undefined {
        if (links.length === 0) {
            return undefined;
        }

        const hasBackReference = links.some(ast.isInterfaceLink);
        const hasDescription = links.some(link => this.getNodeDescription(link) !== undefined);

        return s`
            ${this.heading(level, title)}

            .${title}
            [%autowidth.stretch]
            |===
            |Kind |Owner |Reference |Client${hasBackReference ? ' |Back Reference' : ''}${hasDescription ? ' |Description' : ''}

            ${links.map(link => {
                const owner = ast.isInterfaceLink(link)
                    ? this.pathService.stringifyInterfaceLinkOwnerPath(link.sourcePath) ?? ''
                    : this.formatPath(link.ownerPath);
                const reference = ast.isInterfaceLink(link)
                    ? this.pathService.stringifyInterfaceLinkReference(link.sourcePath) ?? ''
                    : '';
                const client = this.formatPath(link.clientPath);
                const backReference = ast.isInterfaceLink(link)
                    ? this.formatLocalReference(link.backReference)
                    : '';

                return s`
                    |${this.formatLinkKind(link)}
                    |${this.escapeCell(owner)}
                    |${this.escapeCell(reference)}
                    |${this.escapeCell(client)}
                    ${hasBackReference ? `|${this.escapeCell(backReference)}` : undefined}
                    ${hasDescription ? `|${this.escapeDescription(this.getNodeDescription(link))}` : undefined}
                `;
            }).join('\n')}
            |===
        `;
    }

    private renderModelInstance(instance: ast.ModelInstance, level: number, title: string, containerName?: string): string {
        const description = this.getNodeDescription(instance);
        const infoRows = [
            this.infoRow('Name', instance.name),
            this.infoRow('Container', containerName),
            this.infoRow('Implementation', this.formatImplementation(instance)),
        ].filter(Boolean).join('\n');

        const statements = instance.elements.filter(
            (element): element is ast.FieldValue | ast.GlobalEventHandler | ast.Invocation =>
                ast.isFieldValue(element) || ast.isGlobalEventHandler(element) || ast.isInvocation(element),
        );
        const subInstances = instance.elements.filter(ast.isSubInstance);

        return s`
            ${this.heading(level, title)}

            ${this.renderDescriptionBlock(description)}

            .${instance.name}'s information
            [%autowidth.stretch]
            |===
            ${infoRows}
            |===

            ${this.renderAssemblyStatements(statements, level + 1, 'Statements')}
            ${this.renderLinksTable(instance.elements.filter(ast.isLink), level + 1, 'Links')}
            ${subInstances.map(subInstance => {
                if (ast.isModelInstance(subInstance.instance)) {
                    return this.renderModelInstance(
                        subInstance.instance,
                        level + 1,
                        `Model Instance ${subInstance.instance.name}`,
                        this.formatLocalReference(subInstance.container),
                    );
                }

                const assemblyInstance = subInstance.instance;
                const assemblyDescription = this.getNodeDescription(assemblyInstance);
                const assemblyRows = [
                    this.infoRow('Name', assemblyInstance.name),
                    this.infoRow('Container', this.formatLocalReference(subInstance.container)),
                    this.infoRow('Assembly', this.formatReferenceName(assemblyInstance.assembly)),
                    this.infoRow('Configuration', this.formatReferenceName(assemblyInstance.configuration)),
                    this.infoRow('Link Base', this.formatReferenceName(assemblyInstance.linkBase)),
                    this.infoRow('Arguments', assemblyInstance.arguments.map(argument => this.formatTemplateArgument(argument)).join(', ')),
                ].filter(Boolean).join('\n');

                return s`
                    ${this.heading(level + 1, `Assembly Instance ${assemblyInstance.name}`)}

                    ${this.renderDescriptionBlock(assemblyDescription)}

                    .${assemblyInstance.name}'s information
                    [%autowidth.stretch]
                    |===
                    ${assemblyRows}
                    |===

                    ${assemblyInstance.elements.map(configuration =>
                        this.renderAssemblyConfiguration(configuration, level + 2, `Configuration ${this.formatPath(configuration.name)}`),
                    ).join('\n')}
                `;
            }).join('\n')}
        `;
    }

    private renderAssemblyConfiguration(
        configuration: ast.AssemblyComponentConfiguration,
        level: number,
        title: string = `Configure ${this.formatPath(configuration.name)}`,
    ): string {
        const description = this.getNodeDescription(configuration);
        const statements = configuration.elements.filter(
            (element): element is ast.FieldValue | ast.GlobalEventHandler | ast.Invocation =>
                ast.isFieldValue(element) || ast.isGlobalEventHandler(element) || ast.isInvocation(element),
        );

        return s`
            ${this.heading(level, title)}

            ${this.renderDescriptionBlock(description)}

            .${title}'s information
            [%autowidth.stretch]
            |===
            ${this.infoRow('Path', this.formatPath(configuration.name))}
            |===

            ${this.renderAssemblyStatements(statements, level + 1, 'Statements')}
        `;
    }

    private renderTask(task: ast.Task, level: number): string {
        const description = this.getNodeDescription(task);
        const hasDescription = task.elements.some(element => this.getNodeDescription(element) !== undefined);

        return s`
            ${this.heading(level, `Task ${task.name}`)}

            ${this.renderDescriptionBlock(description)}

            .${task.name}'s information
            [%autowidth.stretch]
            |===
            ${this.infoRow('Name', task.name)}
            ${this.infoRow('Context', this.formatReferenceName(task.context, true))}
            |===

            ${task.elements.length > 0 ? s`
                ${this.heading(level + 1, 'Activities')}

                .${task.name}'s activities
                [%autowidth.stretch]
                |===
                |Kind |Target |Details${hasDescription ? ' |Description' : ''}

                ${task.elements.map(activity => {
                    let kind = '';
                    let target = '';
                    let details = '';

                    switch (activity.$type) {
                        case ast.CallOperation.$type:
                            kind = 'call';
                            target = this.formatPath((activity as ast.CallOperation).operationPath);
                            details = this.formatParameterValues((activity as ast.CallOperation).parameters);
                            break;
                        case ast.SetProperty.$type:
                            kind = 'property';
                            target = this.formatPath((activity as ast.SetProperty).propertyPath);
                            details = this.formatValue((activity as ast.SetProperty).value);
                            break;
                        case ast.Transfer.$type:
                            kind = 'transfer';
                            target = this.formatPath((activity as ast.Transfer).outputFieldPath);
                            details = `to ${this.formatPath((activity as ast.Transfer).inputFieldPath)}`;
                            break;
                        case ast.Trigger.$type:
                            kind = 'trig';
                            target = this.formatPath((activity as ast.Trigger).entryPoint);
                            break;
                        case ast.ExecuteTask.$type:
                            kind = 'execute';
                            target = this.formatReferenceName((activity as ast.ExecuteTask).task);
                            details = [
                                this.formatPath((activity as ast.ExecuteTask).root),
                                (activity as ast.ExecuteTask).parameter.map(argument => this.formatTemplateArgument(argument)).join(', '),
                            ].filter(Boolean).join(' | ');
                            break;
                        case ast.EmitGlobalEvent.$type:
                            kind = 'emit';
                            target = this.quoteIfBare((activity as ast.EmitGlobalEvent).eventName);
                            details = (activity as ast.EmitGlobalEvent).asynchronous ? 'async' : 'sync';
                            break;
                    }

                    return s`
                        |${kind}
                        |${this.escapeCell(target)}
                        |${this.escapeCell(details)}
                        ${hasDescription ? `|${this.escapeDescription(this.getNodeDescription(activity))}` : undefined}
                    `;
                }).join('\n')}
                |===
            ` : undefined}
        `;
    }

    // ========== DSL-Specific Generation ==========

    public async doGenerateCatalogue(catalogue: ast.Catalogue): Promise<string> {
        const title = this.docHelper.getTitle(catalogue) ?? `Catalogue ${catalogue.name}`;
        const description = this.docHelper.getDescription(catalogue);
        return s`
            = ${title}

            ${this.renderDescriptionBlock(description)}

            ${catalogue.elements.filter(element => ast.isNamespace(element)).map(namespace => this.generateNamespace(namespace), this).join('\n')}
        `;
    }

    public async doGenerateConfiguration(configuration: ast.Configuration): Promise<string> {
        const includes = configuration.elements.filter(ast.isConfigurationUsage);
        const components = configuration.elements.filter(ast.isComponentConfiguration);

        return s`
            ${this.renderDocumentHeader(configuration, 'Configuration', `Configuration ${configuration.name}`)}

            ${this.renderConfigurationIncludes(includes, 2, 'Includes')}
            ${components.length > 0 ? s`
                ${this.heading(2, 'Component Configurations')}

                ${components.map(component => this.renderComponentConfiguration(component, 3)).join('\n')}
            ` : undefined}
        `;
    }

    public async doGenerateAssembly(assembly: ast.Assembly): Promise<string> {
        return s`
            ${this.renderDocumentHeader(assembly, 'Assembly', `Assembly ${assembly.name}`)}

            ${this.renderTemplateParameters(assembly.parameters, 2)}
            ${assembly.configurations.length > 0 ? s`
                ${this.heading(2, 'Configure Blocks')}

                ${assembly.configurations.map(configuration => this.renderAssemblyConfiguration(configuration, 3)).join('\n')}
            ` : undefined}

            ${this.heading(2, 'Root Model Instance')}

            ${this.renderModelInstance(assembly.model, 3, `Model Instance ${assembly.model.name}`)}
        `;
    }

    public async doGenerateLinkBase(linkBase: ast.LinkBase): Promise<string> {
        return s`
            ${this.renderDocumentHeader(
                linkBase,
                'Link Base',
                `Link Base ${linkBase.name}`,
                [this.infoRow('Assembly', this.formatReferenceName(linkBase.assembly))],
            )}

            ${linkBase.elements.length > 0 ? s`
                ${this.heading(2, 'Component Link Blocks')}

                ${linkBase.elements.filter(ast.isComponentLinkBase).map(component => this.renderComponentLinkBase(component, 3)).join('\n')}
            ` : undefined}
        `;
    }

    public async doGenerateSchedule(schedule: ast.Schedule): Promise<string> {
        return s`
            ${this.renderDocumentHeader(
                schedule,
                'Schedule',
                `Schedule ${schedule.name}`,
                [
                    this.infoRow('Epoch', schedule.epochTime),
                    this.infoRow('Mission Start', schedule.missionStart),
                ],
            )}

            ${this.renderTemplateParameters(schedule.parameters, 2)}
            ${schedule.elements.some(ast.isTask) ? s`
                ${this.heading(2, 'Tasks')}

                ${schedule.elements.filter(ast.isTask).map(task => this.renderTask(task, 3)).join('\n')}
            ` : undefined}
            ${schedule.elements.some(ast.isEvent) ? s`
                ${this.heading(2, 'Events')}

                .Events
                [%autowidth.stretch]
                |===
                |Task |Kind |Anchor |Delay |Cycle |Repeat |Description

                ${schedule.elements.filter(ast.isEvent).map(event => s`
                    |${this.formatReferenceName(event.task)}
                    |${this.escapeCell(event.$type.replace('Event', ' event').toLowerCase())}
                    |${this.escapeCell(this.formatScheduleEventAnchor(event))}
                    |${this.escapeCell(ast.isGlobalEventTriggeredEvent(event) ? event.delay : '')}
                    |${this.escapeCell(event.cycleTime)}
                    |${this.escapeCell(event.repeatCount?.toString())}
                    |${this.escapeDescription(this.getNodeDescription(event))}
                `).join('\n')}
                |===
            ` : undefined}
        `;
    }

    private renderComponentConfiguration(component: ast.ComponentConfiguration, level: number): string {
        const includes = component.elements.filter(ast.isConfigurationUsage);
        const fieldValues = component.elements.filter(ast.isFieldValue);
        const nestedComponents = component.elements.filter(ast.isComponentConfiguration);
        const description = this.getNodeDescription(component);
        const title = `Component ${this.formatPath(component.name)}`;

        return s`
            ${this.heading(level, title)}

            ${this.renderDescriptionBlock(description)}

            .${title}'s information
            [%autowidth.stretch]
            |===
            ${this.infoRow('Path', this.formatPath(component.name))}
            ${this.infoRow('Context', this.formatReferenceName(component.context, true))}
            |===

            ${this.renderConfigurationIncludes(includes, level + 1, 'Includes')}
            ${this.renderConfigurationFieldValues(fieldValues, level + 1, 'Field Values')}
            ${nestedComponents.map(nestedComponent => this.renderComponentConfiguration(nestedComponent, level + 1)).join('\n')}
        `;
    }

    private renderComponentLinkBase(linkBase: ast.ComponentLinkBase, level: number): string {
        const title = `Component ${this.formatPath(linkBase.name)}`;
        const description = this.getNodeDescription(linkBase);

        return s`
            ${this.heading(level, title)}

            ${this.renderDescriptionBlock(description)}

            .${title}'s information
            [%autowidth.stretch]
            |===
            ${this.infoRow('Path', this.formatPath(linkBase.name))}
            |===

            ${this.renderLinksTable(linkBase.elements.filter(ast.isLink), level + 1, 'Links')}
            ${linkBase.elements.filter(ast.isComponentLinkBase).map(component => this.renderComponentLinkBase(component, level + 1)).join('\n')}
        `;
    }

    // ========== Catalogue Rendering ==========

    private crossReference(ref: Reference<ast.NamedElement> | string[], context: ast.NamedElement | ast.ReturnParameter): string {
        if (isReference(ref)) {
            if (ref.ref === undefined) {
                return '<<?,??>>';
            }
            if (AstUtils.getDocument(ref.ref) === AstUtils.getDocument(context)) {
                return `<<${fqn(ref.ref, '-')},${ref.ref.name}>>`;
            }
            return `<<${fqn(ref.ref, '-')},${fqn(ref.ref, '::')}>>`;
        }

        return `<<${ref.join('-')},${ref.join('::')}>>`;
    }

    private generateNamespace(namespace: ast.Namespace): string {
        const types = namespace.elements.filter(ast.isType);
        if (types.length === 0) {
            return '';
        }
        const description = this.docHelper.getDescription(namespace);
        return s`
            == Namespace ${fqn(namespace, '::')}

            ${this.renderDescriptionBlock(description)}
            [.center]
            [mermaid]
            ....
            classDiagram

            direction LR

            namespace ${namespace.name} {
            ${types.length > 8 ? `
                ${types.slice(0, 6).map(type => `class ${type.name} { <<${getNodeType(type)}>> }`).join('\n')}
                class - { <<...>> }
                ` : `
                ${types.map(type => `class ${type.name} { <<${getNodeType(type)}>> }`).join('\n')}
                `}
            }
            ....

            ${types.map(this.generateType, this).join('\n')}
        `;
    }

    private generateType(type: ast.Type): string {
        const description = this.docHelper.getDescription(type);
        return s`
            [#${fqn(type, '-')}]
            === ${getNodeType(type)} ${type.name}

            ${this.renderDescriptionBlock(description)}

            .${type.name}'s informations
            [%autowidth.stretch]
            |===
            ${this.generateTypeInfoDetails(type)}
            |===

            ${this.generateMermaid(type)}

            ${this.generateContent(type)}
        `;
    }

    protected generateTypeInfoDetails(type: ast.Type): string | undefined {
        const typeInfo = s`
            .^h|Visibility |${VisibilityKind[getRealVisibility(type)]}
            .^h|Qualified Name |${fqn(type, '::')}
            .^h|UUID |${this.docHelper.getUuid(type)?.toString().trim()}
        `;
        switch (type.$type) {
            case ast.Integer.$type: {
                const integer = type as ast.Integer;
                const unit = this.docHelper.getUnit(integer);
                return s`
                    ${typeInfo}
                    .^h|Primitive Type |${this.crossReference(integer.primitiveType ?? ['Smp', 'Int32'], integer)}
                    ${integer.minimum ? `.^h|Minimum |${this.getShortValue(integer.minimum)}` : undefined}
                    ${integer.maximum ? `.^h|Maximum |${this.getShortValue(integer.maximum)}` : undefined}
                    ${unit ? `.^h|Unit |${unit}` : undefined}
                `;
            }
            case ast.Float.$type: {
                const float = type as ast.Float;
                const unit = this.docHelper.getUnit(float);
                return s`
                    ${typeInfo}
                    .^h|Primitive Type |${this.crossReference(float.primitiveType ?? ['Smp', 'Float64'], float)}
                    ${float.minimum ? `.^h|Minimum |${this.getShortValue(float.minimum)}${float.range === '<..' || float.range === '<.<' ? ' (exclusive)' : ''}` : undefined}
                    ${float.maximum ? `.^h|Maximum |${this.getShortValue(float.maximum)}${float.range === '..<' || float.range === '<.<' ? ' (exclusive)' : ''}` : undefined}
                    ${unit ? `.^h|Unit |${unit}` : undefined}
                `;
            }
            case ast.ArrayType.$type: {
                const array = type as ast.ArrayType;
                return s`
                    ${typeInfo}
                    .^h|Item Type |${this.crossReference(array.itemType, array)}
                    .^h|Size |${this.getShortValue(array.size)}
                `;
            }
            case ast.EventType.$type: {
                const event = type as ast.EventType;
                return s`
                    ${typeInfo}
                    .^h|Event Type |${this.crossReference(event.eventArgs ?? ['void'], event)}
                `;
            }
            case ast.NativeType.$type: {
                const native = type as ast.NativeType;
                const location = this.docHelper.getNativeLocation(native);
                const namespace = this.docHelper.getNativeNamespace(native);
                return s`
                    ${typeInfo}
                    .^h|Type |${this.crossReference([this.docHelper.getNativeType(native)!], native)}
                    ${location ? `.^h|Location |${location}` : undefined}
                    ${namespace ? `.^h|Namespace |${namespace}` : undefined}
                `;
            }
            case ast.StringType.$type: {
                const string = type as ast.StringType;
                return s`
                    ${typeInfo}
                    .^h|Length |${this.getShortValue(string.length)}
                `;
            }
            case ast.Class.$type: {
                const clazz = type as ast.Class;
                return s`
                    ${typeInfo}
                    ${clazz.base ? `.^h|Extends |${this.crossReference(clazz.base, clazz)}` : undefined}
                `;
            }
            case ast.Exception.$type: {
                const exception = type as ast.Exception;
                return s`
                    ${typeInfo}
                    .^h|Extends |${this.crossReference(exception.base ?? ['Smp', 'Exception'], exception)}
                `;
            }
            case ast.Interface.$type: {
                const inter = type as ast.Interface;
                return s`
                    ${typeInfo}
                    ${inter.base.length > 0 ? `.${inter.base.length}+.^h|Extends ${inter.base.map(i => `|${this.crossReference(i, inter)}`, this).join(' ')}` : undefined}
                `;
            }

            case ast.Model.$type:
            case ast.Service.$type: {
                const component = type as ast.Component;
                return s`
                    ${typeInfo}
                    ${component.base ? `.^h|Extends |${this.crossReference(component.base, component)}` : undefined}
                    ${component.interface.length > 0 ? `.${component.interface.length}+.^h|Implements ${component.interface.map(i => `|${this.crossReference(i, component)}`, this).join(' ')}` : undefined}
                `;
            }
            default:
                return typeInfo;
        }
    }

    private generateMermaid(obj: ast.Type): string | undefined {
        if (ast.isComponent(obj)) return this.generateMermaidComponent(obj);
        if (ast.isInterface(obj)) return this.generateMermaidInterface(obj);
        if (ast.isStructure(obj)) return this.generateMermaidStructure(obj);
        return undefined;
    }

    protected multiplicity(node: ast.NamedElementWithMultiplicity): string {
        const lower = getLower(node) ?? BigInt(1);
        const upper = getUpper(node) ?? BigInt(1);
        if (lower === BigInt(0) && upper === BigInt(1)) {
            return '?';
        } else if (lower === upper) {
            return lower.toString();
        } else if (upper < BigInt(0)) {
            if (lower === BigInt(0)) {
                return '*';
            } else if (lower === BigInt(1)) {
                return '+';
            } else {
                return `${lower} .. *`;
            }
        } else {
            return `${lower} .. ${upper}`;
        }
    }

    private generateMermaidComponent(component: ast.Component): string {
        const interfaces = component.interface;
        const base = component.base;
        const references = component.elements.filter(ast.isReference);
        const containers = component.elements.filter(ast.isContainer);
        return s`
            ==== Diagram

            [.center]
            [mermaid]
            ....
            classDiagram
                ${base?.ref !== undefined ? `class ${base.ref.name} { <<${getNodeType(base.ref)}>> }` : ''}
                ${interfaces.map(interf => `class ${interf.ref?.name} { <<${getNodeType(interf.ref!)}>> }`).join('\n')}
                ${references.map(ref => ref.interface.ref ? `class ${ref.interface.ref.name} { <<${getNodeType(ref.interface.ref)}>> }` : '').join('\n')}
                ${containers.map(container => container.type.ref ? `class ${container.type.ref.name} { <<${getNodeType(container.type.ref)}>> }` : '').join('\n')}
                class ${component.name} {
                    ${this.mermaidClassAttributes(component)}
                }
                ${base?.ref !== undefined ? `${base.ref.name} <|-- ${component.name} : extends` : undefined}
                ${interfaces.map(interf => `${interf.ref?.name} <|.. ${component.name} : implements`).join('\n')}
                ${references.map(ref => ref.interface.ref ? `${component.name} "${this.multiplicity(ref as unknown as ast.NamedElementWithMultiplicity)}" o-- ${ref.interface.ref.name} : ${ref.name}` : '', this).join('\n')}
                ${containers.map(container => container.type.ref ? `${component.name} "${this.multiplicity(container as unknown as ast.NamedElementWithMultiplicity)}" *-- ${container.type.ref.name} : ${container.name}` : '', this).join('\n')}
            ....
        `;
    }

    private generateMermaidInterface(interf: ast.Interface): string {
        const base = interf.base;
        return s`
            ==== Diagram

            [.center]
            [mermaid]
            ....
            classDiagram
                ${base.map(b => `class ${b.ref?.name} { <<Interface>> }`).join('\n')}

                class ${interf.name} {
                    ${this.mermaidClassAttributes(interf)}
                }

                ${base.map(b => `${b.ref?.name} <|-- ${interf.name} : extends`).join('\n')}
            ....
        `;
    }

    private generateMermaidStructure(structure: ast.Structure): string {
        const base = ast.isClass(structure) ? structure.base?.ref : undefined;
        return s`
            ==== Diagram

            [.center]
            [mermaid]
            ....
            classDiagram
                ${base ? `class ${base.name} { <<${getNodeType(base)}>> }` : ''}

                class ${structure.name} {
                    ${this.mermaidClassAttributes(structure)}
                }

                ${base ? `${base.name} <|-- ${structure.name}` : ''}
            ....
        `;
    }

    private mermaidClassAttributes(element: ast.WithBody): string {
        const members = element.elements.filter(m => ast.isConstant(m) || ast.isField(m) || ast.isEventSink(m) || ast.isEventSource(m) || ast.isEntryPoint(m) || ast.isAssociation(m));
        const operations = element.elements.filter(ast.isOperation);
        const maxMembers = Math.max(5, 10 - operations.length);
        const maxOperations = Math.max(5, 10 - members.length);
        return s`
            ${members.length > maxMembers ? `
                ${members.slice(0, maxMembers - 2).map(this.generateMermaidMembers, this).join('\n')}
                ...
                ` : members.map(this.generateMermaidMembers, this).join('\n')}
            ${operations.length > maxOperations ? `
                ${operations.slice(0, maxOperations - 2).map(this.generateMermaidMembers, this).join('\n')}
                ...()
                ` : operations.map(this.generateMermaidMembers, this).join('\n')}
        `;
    }

    private generateMermaidMembers(element: ast.NamedElement): string | undefined {
        switch (element.$type) {
            case ast.Field.$type: {
                const field = element as ast.Field;
                return `${this.generateMermaidVisibility(field)}${field.type.ref?.name} ${field.name}`;
            }
            case ast.EventSource.$type: {
                const eventSource = element as ast.EventSource;
                return `+EventSource<${eventSource.type.ref?.name}> ${eventSource.name}`;
            }
            case ast.EventSink.$type: {
                const eventSink = element as ast.EventSink;
                return `+EventSink<${eventSink.type.ref?.name}> ${eventSink.name}`;
            }
            case ast.EntryPoint.$type: {
                const entryPoint = element as ast.EntryPoint;
                return `+EntryPoint ${entryPoint.name}`;
            }
            case ast.Constant.$type: {
                const constant = element as ast.Constant;
                return `${this.generateMermaidVisibility(constant)}constexpr ${constant.type.ref?.name} ${constant.name} = ${this.getShortValue(constant.value)}`;
            }
            case ast.Association.$type: {
                const association = element as ast.Association;
                return `${this.generateMermaidVisibility(association)}${association.type.ref?.name}* ${association.name}`;
            }
            case ast.Operation.$type: {
                const op = element as ast.Operation;
                return `${this.generateMermaidVisibility(op)}${op.name}(${op.parameter.map(param => `${param.direction ?? 'in'} ${param.type.ref?.name}`).join(', ')}) ${op.returnParameter?.type.ref?.name ?? 'void'} `;
            }
            default:
                return undefined;
        }
    }

    private generateMermaidVisibility(elem: ast.VisibilityElement): string {
        switch (getRealVisibility(elem)) {
            case VisibilityKind.public:
                return '+';
            case VisibilityKind.protected:
                return '#';
            case VisibilityKind.private:
                return '-';
            default:
                return '';
        }
    }

    private generateContent(element: ast.Type): string | undefined {
        if (ast.isEnumeration(element)) {
            return s`
                .${element.name}'s literals
                [%autowidth.stretch]
                |===
                |Name |Value
                ${element.literal.map(literal => `|${literal.name}|${this.getShortValue(literal.value)}`).join('\n')}
                |===
            `;
        }
        if (ast.isWithBody(element))
            return s`
                ${this.generateConstants(element)}
                ${this.generateProperties(element)}
                ${this.generateOperations(element)}
                ${this.generateEntryPoints(element)}
                ${this.generateEventSinks(element)}
                ${this.generateEventSources(element)}
                ${this.generateFields(element)}
                ${this.generateAssociations(element)}
                ${this.generateContainers(element)}
                ${this.generateReferences(element)}
            `;
        return undefined;
    }

    private generateFields(element: ast.WithBody): string | undefined {
        const fields = element.elements.filter(ast.isField);
        if (fields.length === 0) return undefined;

        return s`
            ==== Fields
            The ${element.name} ${element.$type.toLowerCase()} provides the following fields:

            ${VisibilityKinds.map(v => this.generateFieldsWithVisibility(element, v), this).filter(text => text !== undefined).join('\n')}
        `;
    }

    private unit(field: ast.Field): string | undefined {
        if (ast.isInteger(field.type.ref) || ast.isFloat(field.type.ref))
            return this.docHelper.getUnit(field.type.ref);
        return undefined;
    }

    private viewKind(node: ast.Property | ast.Field | ast.Operation | ast.EntryPoint): string {
        switch (this.attrHelper.getViewKind(node)) {
            case ViewKind.VK_None:
                return 'None';
            case ViewKind.VK_Debug:
                return 'Debug';
            case ViewKind.VK_Expert:
                return 'Expert';
            case ViewKind.VK_All:
                return 'All';
            default:
                return '';
        }
    }

    private generateFieldsWithVisibility(element: ast.WithBody, visibility: VisibilityKind): string | undefined {
        const fields = element.elements.filter(ast.isField).filter(field => getRealVisibility(field) === visibility);
        if (fields.length === 0) return undefined;
        const hasUnit = fields.some(field => this.unit(field) !== undefined);
        const hasInitialValue = fields.some(field => field.default !== undefined);
        const hasDescription = fields.some(field => this.docHelper.getDescription(field) !== undefined);
        const hasViewKind = fields.some(field => this.attrHelper.getViewKind(field) !== undefined);
        return s`
            .${element.name}'s ${VisibilityKind[visibility]} fields
            [%autowidth.stretch]
            |===
            |Kind |Name |Type${hasUnit ? ' |Unit' : ''}${hasViewKind ? ' |View Kind' : ''}${hasInitialValue ? ' |Initial Value' : ''}${hasDescription ? ' |Description' : ''}

            ${fields.map(field => s`
                |${this.getFieldKinds(field).join(', ')}
                |${field.name}
                |${this.crossReference(field.type, field)}
                ${hasUnit ? `|${this.unit(field) ?? ''}` : undefined}
                ${hasViewKind ? `|${this.viewKind(field)}` : undefined}
                ${hasInitialValue ? `|${this.getShortValue(field.default) ?? ''}` : undefined}
                ${hasDescription ? `|${this.escapeDescription(this.docHelper.getDescription(field))}` : undefined}
            `).join('\n')}
            |===
        `;
    }

    private generateConstants(element: ast.WithBody): string | undefined {
        const constants = element.elements.filter(ast.isConstant);

        return constants.length > 0 ? s`
            ==== Constants
            The ${element.name} ${element.$type.toLowerCase()} provides the following constants:

            ${VisibilityKinds.map(v => this.generateConstantsWithVisibility(element, v)).filter(text => text !== undefined).join('\n')}
        ` : undefined;
    }

    private generateConstantsWithVisibility(element: ast.WithBody, visibility: VisibilityKind): string | undefined {
        const constants = element.elements.filter(ast.isConstant).filter(constant => getRealVisibility(constant) === visibility);
        const hasDescription = constants.some(constant => this.docHelper.getDescription(constant) !== undefined);
        return constants.length > 0 ? s`
            .${element.name}'s ${VisibilityKind[visibility]} constants
            [%autowidth.stretch]
            |===
            |Name |Type |Value${hasDescription ? ' |Description' : ''}

            ${constants.map(constant => s`
                |${constant.name}
                |${this.crossReference(constant.type, constant)}
                |${this.getShortValue(constant.value) ?? ''}
                ${hasDescription ? `|${this.escapeDescription(this.docHelper.getDescription(constant))}` : undefined}
            `).join('\n')}
            |===
        ` : undefined;
    }

    private generateContainers(element: ast.WithBody): string | undefined {
        const containers = element.elements.filter(ast.isContainer);
        const hasDescription = containers.some(e => this.docHelper.getDescription(e) !== undefined);
        return containers.length > 0 ? s`
            ==== Containers
            The ${element.name} ${element.$type.toLowerCase()} provides the following containers:

            .${element.name}'s containers
            [%autowidth.stretch]
            |===
            |Name |Type |Minimum |Maximum${hasDescription ? ' |Description' : ''}

            ${containers.map(container => {
                const lower = getLower(container);
                const upper = getUpper(container);
                return s`
                    |${container.name}
                    |${this.crossReference(container.type, container)}
                    |${this.getMultiplicityValue(lower)}
                    |${this.getMultiplicityValue(upper)}
                    ${hasDescription ? `|${this.escapeDescription(this.docHelper.getDescription(container))}` : undefined}
                `;
            }).join('\n')}
            |===
        ` : undefined;
    }

    private generateReferences(element: ast.WithBody): string | undefined {
        const references = element.elements.filter(ast.isReference);
        const hasDescription = references.some(e => this.docHelper.getDescription(e) !== undefined);
        return references.length > 0 ? s`
            ==== References
            The ${element.name} ${element.$type.toLowerCase()} provides the following references:

            .${element.name}'s references
            [%autowidth.stretch]
            |===
            |Name |Type |Minimum |Maximum${hasDescription ? ' |Description' : ''}

            ${references.map(reference => {
                const lower = getLower(reference);
                const upper = getUpper(reference);
                return s`
                    |${reference.name}
                    |${this.crossReference(reference.interface, reference)}
                    |${this.getMultiplicityValue(lower)}
                    |${this.getMultiplicityValue(upper)}
                    ${hasDescription ? `|${this.escapeDescription(this.docHelper.getDescription(reference))}` : undefined}
                `;
            }).join('\n')}
            |===
        ` : undefined;
    }

    private generateOperations(element: ast.WithBody): string | undefined {
        const operations = element.elements.filter(ast.isOperation);
        return operations.length > 0 ? s`
            ==== Operations
            The ${element.name} ${element.$type.toLowerCase()} provides the following operations:

            ${operations.map(op => this.generateOperation(op)).join('\n')}
        ` : undefined;
    }

    private generateOperation(element: ast.Operation): string | undefined {
        const hasParameters = element.parameter.length > 0 || element.returnParameter !== undefined;
        const hasDefaultValue = element.parameter.some(p => p.default !== undefined);
        const hasDescription = element.parameter.some(e => this.docHelper.getDescription(e) !== undefined);
        return s`
            ===== Operation ${element.name}
            ${this.docHelper.getDescription(element)}
            ${hasParameters ? s`
                .${element.name}'s parameters
                [%autowidth.stretch]
                |===
                |Direction |Name |Type${hasDefaultValue ? ' |Default Value' : ''}${hasDescription ? ' |Description' : ''}

                ${element.parameter.map(param => s`
                    |${param.direction ?? 'in'} |${param.name} |${this.crossReference(param.type, param)}${hasDefaultValue ? ` |${this.getShortValue(param.default) ?? ''}` : undefined}${hasDescription ? ` |${this.escapeDescription(this.docHelper.getDescription(param))}` : undefined}
                `).join('\n')}
                ${element.returnParameter ? s`
                    |return |${element.returnParameter.name ?? 'return'} |${this.crossReference(element.returnParameter.type, element.returnParameter)}${hasDefaultValue ? ' |' : undefined}${hasDescription ? ` |${this.escapeDescription(this.docHelper.getDescription(element.returnParameter))}` : undefined}
                ` : ''}
                |===
            ` : undefined}
        `;
    }

    private generateEventSinks(element: ast.WithBody): string | undefined {
        const eventSinks = element.elements.filter(ast.isEventSink);
        const hasDescription = eventSinks.some(e => this.docHelper.getDescription(e) !== undefined);
        return eventSinks.length > 0 ? s`
            ==== Event Sinks
            The ${element.name} ${element.$type.toLowerCase()} provides the following event sinks:

            .${element.name}'s Event Sinks
            [%autowidth.stretch]
            |===
            |Name |Type${hasDescription ? ' |Description' : ''}

            ${eventSinks.map(eventSink => s`
                |${eventSink.name}
                |${this.crossReference(eventSink.type, eventSink)}
                ${hasDescription ? `|${this.escapeDescription(this.docHelper.getDescription(eventSink))}` : undefined}
            `).join('\n')}
            |===
        ` : undefined;
    }

    private generateEventSources(element: ast.WithBody): string | undefined {
        const eventSources = element.elements.filter(ast.isEventSource);
        const hasDescription = eventSources.some(e => this.docHelper.getDescription(e) !== undefined);
        return eventSources.length > 0 ? s`
            ==== Event Sources
            The ${element.name} ${element.$type.toLowerCase()} provides the following event sources:

            .${element.name}'s Event Sources
            [%autowidth.stretch]
            |===
            |Name |Type${hasDescription ? ' |Description' : ''}

            ${eventSources.map(eventSource => s`
                |${eventSource.name}
                |${this.crossReference(eventSource.type, eventSource)}
                ${hasDescription ? `|${this.escapeDescription(this.docHelper.getDescription(eventSource))}` : undefined}
            `).join('\n')}
            |===
        ` : undefined;
    }

    private generateEntryPoints(element: ast.WithBody): string | undefined {
        const entryPoints = element.elements.filter(ast.isEntryPoint);
        const hasViewKind = entryPoints.some(p => this.attrHelper.getViewKind(p) !== undefined);
        const hasDescription = entryPoints.some(e => this.docHelper.getDescription(e) !== undefined);
        return entryPoints.length > 0 ? s`
            ==== Entry Points
            The ${element.name} ${element.$type.toLowerCase()} provides the following entry points:

            .${element.name}'s Entry Points
            [%autowidth.stretch]
            |===
            |Name${hasViewKind ? ' |View Kind' : ''}${hasDescription ? ' |Description' : ''}

            ${entryPoints.map(entryPoint => s`
                |${entryPoint.name}
                ${hasViewKind ? `|${this.viewKind(entryPoint)}` : undefined}
                ${hasDescription ? `|${this.escapeDescription(this.docHelper.getDescription(entryPoint))}` : undefined}
            `).join('\n')}
            |===
        ` : undefined;
    }

    private generateProperties(element: ast.WithBody): string | undefined {
        const properties = element.elements.filter(ast.isProperty);
        return properties.length > 0 ? s`
            ==== Properties
            The ${element.name} ${element.$type.toLowerCase()} provides the following properties:

            ${VisibilityKinds.map(v => this.generatePropertiesWithVisibility(element, v)).filter(text => text !== undefined).join('\n')}
        ` : undefined;
    }

    private generatePropertiesWithVisibility(element: ast.WithBody, visibility: VisibilityKind): string | undefined {
        const properties = element.elements.filter(ast.isProperty).filter(property => getRealVisibility(property) === visibility);
        const hasCategory = properties.some(property => this.docHelper.getPropertyCategory(property) !== undefined);
        const hasViewKind = properties.some(p => this.attrHelper.getViewKind(p) !== undefined);
        const hasDescription = properties.some(property => this.docHelper.getDescription(property) !== undefined);
        return properties.length > 0 ? s`
            .${element.name}'s ${VisibilityKind[visibility]} properties
            [%autowidth.stretch]
            |===
            |Name |Type${hasCategory ? ' |Category' : ''}${hasViewKind ? ' |View Kind' : ''}${hasDescription ? ' |Description' : ''}

            ${properties.map(property => s`
                |${property.name}
                |${this.crossReference(property.type, property)}
                ${hasCategory ? `|${this.docHelper.getPropertyCategory(property) ?? ''}` : undefined}
                ${hasViewKind ? `|${this.viewKind(property)}` : undefined}
                ${hasDescription ? `|${this.escapeDescription(this.docHelper.getDescription(property))}` : undefined}
            `).join('\n')}
            |===
        ` : undefined;
    }

    private generateAssociations(element: ast.WithBody): string | undefined {
        const associations = element.elements.filter(ast.isAssociation);
        return associations.length > 0 ? s`
            ==== Associations
            The ${element.name} ${element.$type.toLowerCase()} provides the following associations:

            ${VisibilityKinds.map(v => this.generateAssociationsWithVisibility(element, v)).join('\n')}
        ` : undefined;
    }

    private generateAssociationsWithVisibility(element: ast.WithBody, visibility: VisibilityKind): string | undefined {
        const associations = element.elements.filter(ast.isAssociation).filter(association => getRealVisibility(association) === visibility);
        const hasDescription = associations.some(association => this.docHelper.getDescription(association) !== undefined);
        return associations.length > 0 ? s`
            .${element.name}'s ${VisibilityKind[visibility]} associations
            [%autowidth.stretch]
            |===
            |Name |Type${hasDescription ? ' |Description' : ''}

            ${associations.map(association => s`
                |${association.name}
                |${this.crossReference(association.type, association)}
                ${hasDescription ? `|${this.escapeDescription(this.docHelper.getDescription(association))}` : undefined}
            `).join('\n')}
            |===
        ` : undefined;
    }
}
