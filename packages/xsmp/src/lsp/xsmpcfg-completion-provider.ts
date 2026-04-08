import { AstUtils, type AstNodeDescription, type GrammarAST, type ReferenceInfo } from 'langium';
import type { CompletionAcceptor, CompletionContext } from 'langium/lsp';
import * as ast from '../generated/ast-partial.js';
import type { XsmpcfgServices } from '../xsmpcfg-module.js';
import { XsmpCompletionProviderBase } from './xsmp-completion-provider-base.js';

export class XsmpcfgCompletionProvider extends XsmpCompletionProviderBase {
    protected override readonly snippetOnlyKeywords = new Set([
        'configuration',
        'include',
    ]);

    constructor(services: XsmpcfgServices) {
        super(services);
    }

    protected override createKeywordSnippets(context: CompletionContext, keyword: GrammarAST.Keyword, acceptor: CompletionAcceptor): void {
        if (keyword.value === 'configuration') {
            acceptor(context, this.createKeywordSnippet(keyword, this.getConfigurationDefinitionSnippetText(), 'Configuration Definition'));
        }
    }

    protected override addStandaloneCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        this.addStatementSnippets(context, acceptor);
        this.addStructureFieldCompletions(context, acceptor);
        this.addConfigurableFieldCompletions(context, acceptor);
        this.addTypedValueCompletions(context, acceptor);
    }

    protected override createEnrichedReferenceCompletionItem(
        refInfo: ReferenceInfo,
        _context: CompletionContext,
        nodeDescription: AstNodeDescription,
    ) {
        if (
            ast.isConcretePathNamedSegment(refInfo.container)
            && ast.isField(nodeDescription.node)
        ) {
            const structureFieldValue = ast.isCfgStructureFieldValue(refInfo.container.$container)
                ? refInfo.container.$container
                : undefined;
            if (structureFieldValue?.field === refInfo.container) {
                return this.createFieldAssignmentReferenceCompletionItem(nodeDescription, nodeDescription.node.type?.ref, 'Field of the current Structure value.');
            }
            const path = ast.isPath(refInfo.container.$container)
                ? refInfo.container.$container
                : AstUtils.getContainerOfType(refInfo.container.$container, ast.isPath);
            if (path && ast.isFieldValue(path.$container)) {
                return this.createFieldAssignmentReferenceCompletionItem(nodeDescription, nodeDescription.node.type?.ref, 'Configurable field of the current component.');
            }
        }
        return undefined;
    }

    protected addStatementSnippets(context: CompletionContext, acceptor: CompletionAcceptor): void {
        if (!this.isAtStatementPrefix(context)) {
            return;
        }

        const configuration = this.getRecoveryContainerOfType(context, ast.isConfiguration);
        const componentConfiguration = this.getRecoveryBlockContainerOfType(context, ast.isComponentConfiguration);
        const contexts = this.getCrossReferenceNames(context, ast.ComponentConfiguration, ast.ComponentConfiguration.context);
        const configurations = this.getCrossReferenceNames(context, ast.ConfigurationUsage, ast.ConfigurationUsage.configuration);

        if (!configuration && !componentConfiguration) {
            acceptor(context, this.createSnippetItem('Configuration', this.getConfigurationDefinitionSnippetText(), 'Configuration Definition'));
            return;
        }

        if (componentConfiguration) {
            acceptor(context, this.createSnippetItem('Component Configuration', this.createComponentConfigurationSnippet(contexts, false), 'Nested Component Configuration'));
            acceptor(context, this.createSnippetItem('Include Configuration', this.createIncludeConfigurationSnippet(configurations, true), 'Configuration Include'));
            return;
        }

        if (configuration) {
            acceptor(context, this.createSnippetItem('Root Component Configuration', this.createComponentConfigurationSnippet(contexts, true), 'Root Component Configuration'));
            acceptor(context, this.createSnippetItem('Include Configuration', this.createIncludeConfigurationSnippet(configurations, false), 'Configuration Include'));
        }
    }

    protected addConfigurableFieldCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        if (!this.isAtStatementPrefix(context)) {
            return;
        }
        const configuration = this.getRecoveryBlockContainerOfType(context, ast.isComponentConfiguration);
        const component = configuration
            ? this.cfgPathResolver.getConfigurationComponentContext(configuration).component
            : undefined;
        if (!component) {
            return;
        }
        this.addFieldAssignmentCompletions(context, acceptor, component, `Configurable field of ${component.name}.`);
    }

    protected addStructureFieldCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        if (!this.isAtStatementPrefix(context)) {
            return;
        }
        this.addFieldAssignmentCompletions(context, acceptor, this.getRecoveryStructureType(context), 'Field of the current Structure value.');
    }

    protected addTypedValueCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        if (!this.isAfterEquals(context)) {
            return;
        }
        this.addSimpleValueCompletionsForType(context, acceptor, this.getExpectedTypeForValueCompletion(context), 'cfg', true);
    }

    protected addFieldAssignmentCompletions(
        context: CompletionContext,
        acceptor: CompletionAcceptor,
        type: ast.Type | undefined,
        detail: string,
    ): void {
        for (const field of this.cfgPathResolver.getFieldCandidatesForType(type)) {
            if (!field.name) {
                continue;
            }
            const defaultValue = this.getDefaultValueForType(field.type?.ref, 'cfg', true) || 'value';
            acceptor(context, this.createContextualValueItem(
                context,
                field.name,
                `${field.name} = ${this.createPlaceholder(1, defaultValue)}`,
                detail
            ));
        }
    }

    protected createFieldAssignmentReferenceCompletionItem(
        nodeDescription: AstNodeDescription,
        expectedType: ast.Type | undefined,
        detail: string,
    ) {
        if (!nodeDescription.name) {
            return undefined;
        }
        const defaultValue = this.getDefaultValueForType(expectedType, 'cfg', true) || 'value';
        return this.createReferenceLikeItem(
            nodeDescription,
            `${nodeDescription.name} = ${this.createPlaceholder(1, defaultValue)}`,
            detail
        );
    }

    protected getExpectedTypeForValueCompletion(context: CompletionContext): ast.Type | undefined {
        const recoveryNode = this.getRecoveryAstNode(context);
        // While typing `field =`, the partial AST may not yet contain a full
        // `CfgStructureFieldValue`, so recover the target type from the line prefix.
        const standaloneStructureFieldType = this.getStandaloneStructureFieldTypeAtAssignment(context);
        if (standaloneStructureFieldType) {
            return standaloneStructureFieldType;
        }
        const structureFieldValue = AstUtils.getContainerOfType(recoveryNode, ast.isCfgStructureFieldValue);
        if (structureFieldValue?.value) {
            return this.cfgPathResolver.getExpectedTypeForValue(structureFieldValue.value);
        }
        const fieldValue = AstUtils.getContainerOfType(recoveryNode, ast.isFieldValue);
        const path = fieldValue?.field;
        return path ? this.cfgPathResolver.getFieldPathResolution(path).finalType : undefined;
    }

    protected getStandaloneStructureFieldTypeAtAssignment(context: CompletionContext): ast.Type | undefined {
        const fieldName = this.getFieldNameAtAssignmentPrefix(context);
        if (!fieldName) {
            return undefined;
        }
        return this.cfgPathResolver.getFieldCandidatesForType(this.getRecoveryStructureType(context))
            .find(field => field.name === fieldName)
            ?.type?.ref;
    }

    protected getFieldNameAtAssignmentPrefix(context: CompletionContext): string | undefined {
        const prefixMatch = /^\s*(unsafe\s+)?([_a-zA-Z]\w*)\s*=\s*$/.exec(this.getLinePrefix(context));
        return prefixMatch && !prefixMatch[1] ? prefixMatch[2] : undefined;
    }

    protected getRecoveryStructureType(context: CompletionContext): ast.Structure | undefined {
        const structureValue = this.getRecoveryBlockContainerOfType(context, ast.isStructureValue);
        const structureType = structureValue
            ? this.cfgPathResolver.getExpectedTypeForValue(structureValue)
            : undefined;
        return ast.isStructure(structureType) ? structureType : undefined;
    }

    protected getConfigurationDefinitionSnippetText(): string {
        return 'configuration ${1:Name}\n$0';
    }

    protected createComponentConfigurationSnippet(contexts: string[], root: boolean): string {
        const path = root ? `/${this.createPlaceholder(1, 'root')}` : this.createPlaceholder(1, 'child');
        return `${path}: ${this.createChoicePlaceholder(2, contexts, 'demo.Component')}\n{\n\t$0\n}`;
    }

    protected createIncludeConfigurationSnippet(configurations: string[], withExplicitAtPath: boolean): string {
        const pathPart = withExplicitAtPath
            ? ` at ${this.createPlaceholder(2, 'path')}`
            : this.createPlaceholder(2, ' at path');
        return `include ${this.createChoicePlaceholder(1, configurations, 'Configuration')}${pathPart}`;
    }
}
