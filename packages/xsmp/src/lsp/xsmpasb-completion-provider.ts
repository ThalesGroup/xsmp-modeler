import { AstUtils, type AstNodeDescription, type GrammarAST, type ReferenceInfo } from 'langium';
import type { CompletionAcceptor, CompletionContext, NextFeature } from 'langium/lsp';
import type { CompletionItem } from 'vscode-languageserver';
import * as ast from '../generated/ast-partial.js';
import type { XsmpasbServices } from '../xsmpasb-module.js';
import * as XsmpUtils from '../utils/xsmp-utils.js';
import { XsmpCompletionProviderBase } from './xsmp-completion-provider-base.js';

const identifierPrefixPattern = /^[_a-zA-Z]\w*/;
const placeholderPrefixPattern = /^\{[_a-zA-Z]\w*\}/;
const typeSegmentPattern = /^[_a-zA-Z]\w*$/;

export class XsmpasbCompletionProvider extends XsmpCompletionProviderBase {
    protected readonly snippetOnlyKeywords = new Set([
        'assembly',
        'configure',
        'subscribe',
        'property',
        'call',
        'event',
        'field',
        'interface',
    ]);

    constructor(services: XsmpasbServices) {
        super(services);
    }

    protected override completionForKeyword(context: CompletionContext, keyword: GrammarAST.Keyword, acceptor: CompletionAcceptor) {
        if (this.snippetOnlyKeywords.has(keyword.value)) {
            return;
        }
        return super.completionForKeyword(context, keyword, acceptor);
    }

    protected override createKeywordSnippets(context: CompletionContext, keyword: GrammarAST.Keyword, acceptor: CompletionAcceptor): void {
        switch (keyword.value) {
            case 'assembly':
                acceptor(context, this.createKeywordSnippet(keyword, 'assembly ${1:Name}\n$0', 'Assembly Definition'));
                break;
        }
    }

    protected override addContextualCompletions(context: CompletionContext, _next: NextFeature, acceptor: CompletionAcceptor): void {
        this.addStandaloneCompletions(context, acceptor);
    }

    protected override addStandaloneCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        this.addStatementSnippets(context, acceptor);
        this.addModelStructureCompletions(context, acceptor);
        this.addInstanceTypeCompletions(context, acceptor);
        this.addConfigurableFieldCompletions(context, acceptor);
        this.addComponentConfigurationInvocationCompletions(context, acceptor);
        this.addLocalReferenceCompletions(context, acceptor);
        this.addTypedValueCompletions(context, acceptor);
    }

    protected override addFallbackStandaloneCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        if (this.isModelImplementationTypePosition(context) || this.isSubInstanceTypePosition(context)) {
            this.addInstanceTypeCompletions(context, acceptor);
            return;
        }
        this.addStandaloneCompletions(context, acceptor);
    }

    protected override filterCompletionItems(context: CompletionContext, items: CompletionItem[]): CompletionItem[] {
        if (this.isModelImplementationTypePosition(context)) {
            return items.filter(item => item.detail === 'Component implementation type.');
        }
        if (this.isSubInstanceTypePosition(context)) {
            return items.filter(item => item.detail === 'Component implementation type.' || item.detail === 'Assembly type.');
        }
        return items;
    }

    protected override createEnrichedReferenceCompletionItem(
        refInfo: ReferenceInfo,
        _context: CompletionContext,
        nodeDescription: AstNodeDescription,
    ) {
        if (ast.isLocalNamedReference(refInfo.container)) {
            const localRef = refInfo.container;
            const subInstance = AstUtils.getContainerOfType(localRef, ast.isSubInstance);
            const eventHandler = AstUtils.getContainerOfType(localRef, ast.isGlobalEventHandler);
            const operationCall = AstUtils.getContainerOfType(localRef, ast.isOperationCall);
            const propertyValue = AstUtils.getContainerOfType(localRef, ast.isPropertyValue);

            if (subInstance?.container === localRef && ast.isContainer(nodeDescription.node)) {
                const instanceType = this.getContainerComponentName(nodeDescription.node);
                return this.createReferenceLikeItem(
                    nodeDescription,
                    `${nodeDescription.name} += ${this.createPlaceholder(1, 'Child')}: ${this.createPlaceholder(2, instanceType)}`,
                    'Sub-instance container.'
                );
            }

            if (eventHandler?.entryPoint === localRef && ast.isEntryPoint(nodeDescription.node)) {
                return this.createReferenceLikeItem(
                    nodeDescription,
                    this.createSubscriptionText(nodeDescription.name),
                    'Entry point of the current component.'
                );
            }

            if (operationCall?.operation === localRef && ast.isOperation(nodeDescription.node)) {
                return this.createReferenceLikeItem(
                    nodeDescription,
                    this.createOperationCallText(nodeDescription.node),
                    'Operation of the current component.'
                );
            }

            if (propertyValue?.property === localRef && ast.isProperty(nodeDescription.node)) {
                if (!nodeDescription.name) {
                    return undefined;
                }
                return this.createReferenceLikeItem(
                    nodeDescription,
                    this.createPropertyAssignmentText(nodeDescription.name, nodeDescription.node.type?.ref, 'l2'),
                    'Writable property of the current component.'
                );
            }
        }

        if (
            ast.isConcretePathNamedSegment(refInfo.container)
            && ast.isField(nodeDescription.node)
        ) {
            const path = ast.isPath(refInfo.container.$container)
                ? refInfo.container.$container
                : AstUtils.getContainerOfType(refInfo.container.$container, ast.isPath);
            if (path && ast.isFieldValue(path.$container)) {
                if (!nodeDescription.name) {
                    return undefined;
                }
                const defaultValue = this.getDefaultValueForType(nodeDescription.node.type?.ref, 'l2', true) || 'value';
                return this.createReferenceLikeItem(
                    nodeDescription,
                    `${nodeDescription.name} = ${this.createPlaceholder(1, defaultValue)}`,
                    `Field of ${nodeDescription.node.$container.name}.`
                );
            }
        }

        if (refInfo.property === ast.ModelInstance.implementation && ast.isComponent(nodeDescription.node)) {
            return this.createReferenceLikeItem(
                nodeDescription,
                nodeDescription.name,
                'Component implementation type.'
            );
        }

        if (refInfo.property === ast.AssemblyInstance.assembly && ast.isAssembly(nodeDescription.node)) {
            return this.createReferenceLikeItem(
                nodeDescription,
                nodeDescription.name,
                'Assembly type.'
            );
        }

        return undefined;
    }

    protected addStatementSnippets(context: CompletionContext, acceptor: CompletionAcceptor): void {
        if (!this.isAtStatementPrefix(context)) {
            return;
        }

        const model = this.getCurrentBlockModel(context);
        const componentConfiguration = this.getCurrentBlockComponentConfiguration(context);
        const assembly = !model && !componentConfiguration
            ? this.getRecoveryContainerOfType(context, ast.isAssembly)
            : undefined;
        const components = this.getCrossReferenceNames(context, ast.ModelInstance, ast.ModelInstance.implementation);
        const assemblies = this.getCrossReferenceNames(context, ast.AssemblyInstance, ast.AssemblyInstance.assembly);
        const configurations = this.getCrossReferenceNames(context, ast.AssemblyInstance, ast.AssemblyInstance.configuration);
        const linkBases = this.getCrossReferenceNames(context, ast.AssemblyInstance, ast.AssemblyInstance.linkBase);

        if (!assembly && !model && !componentConfiguration) {
            acceptor(context, this.createSnippetItem(
                'Assembly',
                'assembly ${1:Name}\n$0',
                'Assembly Definition'
            ));
            return;
        }

        if (componentConfiguration) {
            acceptor(context, this.createSnippetItem('Subscribe', 'subscribe ${1:entryPoint} -> "${2:GlobalEvent}"', 'Global Event Subscription'));
            acceptor(context, this.createSnippetItem('Property Value', 'property ${1:name} = ${2:value}', 'Property Value'));
            acceptor(context, this.createSnippetItem('Operation Call', 'call ${1:name}($0)', 'Operation Call'));
            return;
        }

        if (model) {
            const assemblyUsageSnippet = this.createAssemblyUsageSnippet(configurations, linkBases, 4);
            acceptor(context, this.createSnippetItem(
                'Sub Model Instance',
                `${this.createPlaceholder(1, 'container')} += ${this.createPlaceholder(2, 'Child')}: ${this.createChoicePlaceholder(3, components, 'demo.Component')}`,
                'Sub Model Instance'
            ));
            acceptor(context, this.createSnippetItem(
                'Sub Assembly Instance',
                `${this.createPlaceholder(1, 'container')} += ${this.createPlaceholder(2, 'Child')}: ${this.createChoicePlaceholder(3, assemblies, 'Assembly')}${assemblyUsageSnippet}`,
                'Sub Assembly Instance'
            ));
            acceptor(context, this.createSnippetItem('Event Link', 'event link ${1:owner} -> ${2:client}', 'Event Link'));
            acceptor(context, this.createSnippetItem('Field Link', 'field link ${1:owner} -> ${2:client}', 'Field Link'));
            acceptor(context, this.createSnippetItem('Interface Link', 'interface link ${1:sourcePath} -> ${2:client}${3::${4:backReference}}', 'Interface Link'));
            return;
        }

        if (assembly) {
            acceptor(context, this.createSnippetItem(
                'Configure Instance',
                'configure ${1:path}\n{\n\t$0\n}',
                'Component Configuration'
            ));
            acceptor(context, this.createSnippetItem(
                'Root Model Instance',
                `${this.createPlaceholder(1, 'Root')}: ${this.createChoicePlaceholder(2, components, 'demo.Component')}\n{\n\t$0\n}`,
                'Root Model Instance'
            ));
        }
    }

    protected addConfigurableFieldCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        if (!this.isAtStatementPrefix(context)) {
            return;
        }
        const component = this.getCurrentComponent(context);
        if (!component) {
            return;
        }
        for (const field of this.l2PathResolver.getFieldCandidatesForType(component)) {
            if (!field.name) {
                continue;
            }
            const defaultValue = this.getDefaultValueForType(field.type?.ref, 'l2', true) || 'value';
            acceptor(context, this.createContextualValueItem(
                context,
                field.name,
                `${field.name} = ${this.createPlaceholder(1, defaultValue)}`,
                `Field of ${component.name}.`
            ));
        }
    }

    protected addInstanceTypeCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        const isModelImplementationType = this.isModelImplementationTypePosition(context);
        const isSubInstanceType = this.isSubInstanceTypePosition(context);
        if (!isModelImplementationType && !isSubInstanceType) {
            return;
        }

        const expectedType = isSubInstanceType ? this.getExpectedSubInstanceType(context) : undefined;

        for (const candidate of this.getReferenceCandidateDescriptions(context, ast.ModelInstance, ast.ModelInstance.implementation)) {
            if (!ast.isComponent(candidate.node)) {
                continue;
            }
            if (expectedType && !XsmpUtils.isBaseOfReferenceType(expectedType, candidate.node)) {
                continue;
            }
            acceptor(context, this.createContextualValueItem(
                context,
                candidate.name,
                candidate.name,
                'Component implementation type.',
                this.getReferenceDocumentation(candidate)
            ));
        }

        if (!isSubInstanceType) {
            return;
        }

        for (const candidate of this.getReferenceCandidateDescriptions(context, ast.AssemblyInstance, ast.AssemblyInstance.assembly)) {
            if (!ast.isAssembly(candidate.node)) {
                continue;
            }
            const rootComponent = ast.isComponent(candidate.node.model?.implementation?.ref)
                ? candidate.node.model.implementation.ref
                : undefined;
            if (expectedType && rootComponent && !XsmpUtils.isBaseOfReferenceType(expectedType, rootComponent)) {
                continue;
            }
            acceptor(context, this.createContextualValueItem(
                context,
                candidate.name,
                candidate.name,
                'Assembly type.',
                this.getReferenceDocumentation(candidate)
            ));
        }
    }

    protected addModelStructureCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        if (!this.isAtStatementPrefix(context)) {
            return;
        }
        const model = this.getCurrentBlockModel(context);
        const component = model && ast.isComponent(model.implementation?.ref) ? model.implementation.ref : undefined;
        if (!component) {
            return;
        }

        const assemblies = this.getCrossReferenceNames(context, ast.AssemblyInstance, ast.AssemblyInstance.assembly);
        const configurations = this.getCrossReferenceNames(context, ast.AssemblyInstance, ast.AssemblyInstance.configuration);
        const linkBases = this.getCrossReferenceNames(context, ast.AssemblyInstance, ast.AssemblyInstance.linkBase);

        for (const child of this.getDirectChildComponentContexts(component)) {
            const componentName = XsmpUtils.fqn(child.component);
            const defaultName = child.component.name ?? 'Child';
            acceptor(context, this.createContextualValueItem(
                context,
                `${child.path} += ${defaultName}: ${componentName}`,
                `${child.path} += ${this.createPlaceholder(1, defaultName)}: ${componentName}`,
                'Sub Model Instance'
            ));

            if (assemblies.length > 0) {
                acceptor(context, this.createContextualValueItem(
                    context,
                    `${child.path} += ${defaultName}: Assembly`,
                    `${child.path} += ${this.createPlaceholder(1, defaultName)}: ${this.createChoicePlaceholder(2, assemblies, 'Assembly')}${this.createAssemblyUsageSnippet(configurations, linkBases, 3)}`,
                    'Sub Assembly Instance'
                ));
            }
        }

        this.addContextualEventLinkCompletions(context, acceptor, component);
        this.addContextualFieldLinkCompletions(context, acceptor, component);
        this.addContextualInterfaceLinkCompletions(context, acceptor, component);
    }

    protected addComponentConfigurationInvocationCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        if (!this.isAtStatementPrefix(context)) {
            return;
        }
        const componentConfiguration = this.getCurrentBlockComponentConfiguration(context);
        const component = componentConfiguration ? this.getCurrentComponent(context) : undefined;
        if (!component) {
            return;
        }

        for (const candidate of this.getEntryPoints(component)) {
            if (!candidate.name) {
                continue;
            }
            acceptor(context, this.createContextualValueItem(
                context,
                `subscribe ${candidate.name}`,
                `subscribe ${this.createSubscriptionText(candidate.name)}`,
                `Global event subscription for entry point ${candidate.name}.`
            ));
        }

        for (const candidate of this.getProperties(component)) {
            if (!candidate.name) {
                continue;
            }
            acceptor(context, this.createContextualValueItem(
                context,
                `property ${candidate.name}`,
                `property ${this.createPropertyAssignmentText(candidate.name, candidate.type?.ref, 'l2')}`,
                `Property value for ${candidate.name}.`
            ));
        }

        for (const candidate of this.getOperations(component)) {
            if (!candidate.name) {
                continue;
            }
            acceptor(context, this.createContextualValueItem(
                context,
                `call ${candidate.name}`,
                `call ${this.createOperationCallText(candidate, 'l2')}`,
                `Operation call for ${candidate.name}.`
            ));
        }
    }

    protected addLocalReferenceCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        const linePrefix = this.getLinePrefix(context);
        const localComponent = this.getCurrentComponent(context);

        if (localComponent && /^\s*call\s+\w*$/.test(linePrefix)) {
            for (const candidate of this.getOperations(localComponent)) {
                if (!candidate.name) {
                    continue;
                }
                acceptor(context, this.createContextualValueItem(
                    context,
                    candidate.name,
                    this.createOperationCallText(candidate, 'l2'),
                    `Operation of ${candidate.$container.name}.`
                ));
            }
        }

        if (localComponent && /^\s*property\s+\w*$/.test(linePrefix)) {
            for (const candidate of this.getProperties(localComponent)) {
                if (!candidate.name) {
                    continue;
                }
                acceptor(context, this.createContextualValueItem(
                    context,
                    candidate.name,
                    this.createPropertyAssignmentText(candidate.name, candidate.type?.ref, 'l2'),
                    `Writable property of ${candidate.$container.name}.`
                ));
            }
        }

        if (localComponent && /^\s*subscribe\s+\w*$/.test(linePrefix)) {
            for (const candidate of this.getEntryPoints(localComponent)) {
                if (!candidate.name) {
                    continue;
                }
                acceptor(context, this.createContextualValueItem(
                    context,
                    candidate.name,
                    this.createSubscriptionText(candidate.name),
                    `Entry point of ${candidate.$container.name}.`
                ));
            }
        }
    }

    protected addTypedValueCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        if (!this.isAfterEquals(context)) {
            return;
        }
        const node = this.getRecoveryAstNode(context);
        const fieldValue = AstUtils.getContainerOfType(node, ast.isFieldValue);
        if (fieldValue?.field) {
            const targetType = this.l2PathResolver.getAssemblyFieldPathResolution(fieldValue.field).finalType;
            for (const item of this.getSimpleValueCompletions(targetType, 'l2', true)) {
                acceptor(context, item);
            }
            return;
        }

        const propertyValue = AstUtils.getContainerOfType(node, ast.isPropertyValue);
        if (propertyValue) {
            const property = this.l2PathResolver.getLocalNamedReferenceTarget(propertyValue.property);
            const targetType = ast.isProperty(property) ? property.type?.ref : undefined;
            for (const item of this.getSimpleValueCompletions(targetType, 'l2', false)) {
                acceptor(context, item);
            }
            return;
        }

        const parameterValue = AstUtils.getContainerOfType(node, ast.isParameterValue);
        const operationCall = parameterValue ? AstUtils.getContainerOfType(parameterValue, ast.isOperationCall) : undefined;
        const operation = operationCall ? this.l2PathResolver.getLocalNamedReferenceTarget(operationCall.operation) : undefined;
        const parameterName = parameterValue?.parameter;
        const parameter = ast.isOperation(operation)
            ? operation.parameter.find(candidate => candidate.name === parameterName)
            : undefined;
        for (const item of this.getSimpleValueCompletions(parameter?.type?.ref, 'l2', false)) {
            acceptor(context, item);
        }
    }
    protected getContainerComponentName(container: ast.Container): string {
        if (ast.isComponent(container.defaultComponent?.ref)) {
            return XsmpUtils.fqn(container.defaultComponent.ref);
        }
        if (ast.isComponent(container.type?.ref)) {
            return XsmpUtils.fqn(container.type.ref);
        }
        return 'demo.Component';
    }

    protected getCurrentComponent(context: CompletionContext): ast.Component | undefined {
        const model = this.getCurrentBlockModel(context);
        const implementation = model?.implementation?.ref;
        if (ast.isComponent(implementation)) {
            return implementation;
        }
        const configuration = this.getCurrentBlockComponentConfiguration(context);
        const resolution = configuration?.name ? this.l2PathResolver.getAssemblyComponentPathResolution(configuration.name) : undefined;
        return resolution?.finalComponent;
    }

    protected getCurrentBlockModel(context: CompletionContext): ast.ModelInstance | undefined {
        return this.findContainingTextBlockNode(context, ast.isModelInstance);
    }

    protected getCurrentBlockComponentConfiguration(context: CompletionContext): ast.AssemblyComponentConfiguration | undefined {
        return this.findContainingTextBlockNode(context, ast.isAssemblyComponentConfiguration);
    }

    protected isSubInstanceTypePosition(context: CompletionContext): boolean {
        const typePosition = this.parseTypePosition(this.getLinePrefix(context));
        if (!typePosition) {
            return false;
        }
        const assignmentIndex = typePosition.left.indexOf('+=');
        if (assignmentIndex === -1) {
            return false;
        }
        const container = typePosition.left.slice(0, assignmentIndex).trim();
        const subInstanceName = typePosition.left.slice(assignmentIndex + 2).trim();
        return this.isTemplatedIdentifier(container)
            && this.isTemplatedIdentifier(subInstanceName)
            && this.isPartialQualifiedType(typePosition.typeFragment);
    }

    protected isModelImplementationTypePosition(context: CompletionContext): boolean {
        const typePosition = this.parseTypePosition(this.getLinePrefix(context));
        return typePosition !== undefined
            && !typePosition.left.includes('+=')
            && this.isTemplatedIdentifier(typePosition.left)
            && this.isPartialQualifiedType(typePosition.typeFragment);
    }

    private createAssemblyUsageSnippet(configurations: string[], linkBases: string[], configurationPlaceholderIndex: number): string {
        const configurationPart = configurations.length > 0
            ? ` using config ${this.createChoicePlaceholder(configurationPlaceholderIndex, configurations, 'Configuration')}`
            : '';
        const linkBasePlaceholderIndex = configurations.length > 0
            ? configurationPlaceholderIndex + 1
            : configurationPlaceholderIndex;
        const linkBasePart = linkBases.length > 0
            ? ` using link ${this.createChoicePlaceholder(linkBasePlaceholderIndex, linkBases, 'LinkBase')}`
            : '';
        return `${configurationPart}${linkBasePart}`;
    }

    private parseTypePosition(linePrefix: string): { left: string; typeFragment: string } | undefined {
        const separatorIndex = linePrefix.lastIndexOf(':');
        if (separatorIndex === -1) {
            return undefined;
        }
        const left = linePrefix.slice(0, separatorIndex).trim();
        if (left.length === 0) {
            return undefined;
        }
        return {
            left,
            typeFragment: linePrefix.slice(separatorIndex + 1).trim(),
        };
    }

    private isTemplatedIdentifier(candidate: string): boolean {
        let remaining = candidate.trim();
        if (remaining.length === 0) {
            return false;
        }
        while (remaining.length > 0) {
            const placeholderMatch = placeholderPrefixPattern.exec(remaining);
            if (placeholderMatch) {
                remaining = remaining.slice(placeholderMatch[0].length);
                const suffixMatch = /^\w*/.exec(remaining)?.[0] ?? '';
                remaining = remaining.slice(suffixMatch.length);
                continue;
            }
            const identifierMatch = identifierPrefixPattern.exec(remaining);
            if (!identifierMatch) {
                return false;
            }
            remaining = remaining.slice(identifierMatch[0].length);
        }
        return true;
    }

    private isPartialQualifiedType(candidate: string): boolean {
        if (candidate.length === 0) {
            return true;
        }
        const segments = candidate.split('.');
        return segments.every((segment, index) =>
            segment.length > 0
                ? typeSegmentPattern.test(segment)
                : index === segments.length - 1
        );
    }

    protected getExpectedSubInstanceType(context: CompletionContext): ast.ReferenceType | undefined {
        const subInstance = this.getRecoveryContainerOfType(context, ast.isSubInstance);
        const parentModel = subInstance ? AstUtils.getContainerOfType(subInstance, ast.isModelInstance) : undefined;
        const parentComponent = parentModel && ast.isComponent(parentModel.implementation?.ref)
            ? parentModel.implementation.ref
            : undefined;
        const container = subInstance && parentComponent
            ? this.l2PathResolver.getSubInstanceContainerForCompletion(subInstance, parentComponent)
            : undefined;
        return ast.isReferenceType(container?.type?.ref) ? container.type.ref : undefined;
    }

    protected getReferenceCandidateDescriptions(
        context: CompletionContext,
        type: string | { readonly $type: string },
        property: string,
    ): AstNodeDescription[] {
        const container = this.getRecoveryAstNode(context);
        const refInfo: ReferenceInfo = {
            reference: { $refText: '', ref: undefined },
            container: {
                $container: container,
                $type: typeof type === 'string' ? type : type.$type,
            },
            property,
        };
        return [...this.getReferenceCandidates(refInfo, context)];
    }
}
