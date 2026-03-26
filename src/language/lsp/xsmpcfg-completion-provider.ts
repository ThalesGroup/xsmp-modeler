import { AstUtils, type GrammarAST } from 'langium';
import type { CompletionAcceptor, CompletionContext, NextFeature } from 'langium/lsp';
import type { AstNodeDescription, ReferenceInfo } from 'langium';
import * as ast from '../generated/ast-partial.js';
import type { XsmpcfgServices } from '../xsmpcfg-module.js';
import * as XsmpUtils from '../utils/xsmp-utils.js';
import { XsmpCompletionProviderBase } from './xsmp-completion-provider-base.js';

export class XsmpcfgCompletionProvider extends XsmpCompletionProviderBase {
    constructor(services: XsmpcfgServices) {
        super(services);
    }

    protected override createKeywordSnippets(context: CompletionContext, keyword: GrammarAST.Keyword, acceptor: CompletionAcceptor): void {
        switch (keyword.value) {
            case 'configuration':
                acceptor(context, this.createKeywordSnippet(keyword, 'configuration ${1:Name}\n$0', 'Configuration Definition'));
                break;
            case 'include': {
                const configurations = this.getCrossReferenceNames(context, ast.ConfigurationUsage, 'configuration');
                acceptor(context, this.createKeywordSnippet(
                    keyword,
                    `include ${this.createChoicePlaceholder(1, configurations, 'Configuration')}${this.createPlaceholder(2, ' at path')}`,
                    'Configuration Include',
                    'include'
                ));
                break;
            }
        }
    }

    protected override addContextualCompletions(context: CompletionContext, _next: NextFeature, acceptor: CompletionAcceptor): void {
        this.addStandaloneCompletions(context, acceptor);
    }

    protected override addStandaloneCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        this.addStatementSnippets(context, acceptor);
        this.addNestedComponentConfigurationCompletions(context, acceptor);
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
            const path = ast.isPath(refInfo.container.$container)
                ? refInfo.container.$container
                : AstUtils.getContainerOfType(refInfo.container.$container, ast.isPath);
            if (path && ast.isFieldValue(path.$container)) {
                if (!nodeDescription.name) {
                    return undefined;
                }
                const expectedType = nodeDescription.node.type?.ref;
                const defaultValue = this.getDefaultValueForType(expectedType, 'cfg', true) || 'value';
                return this.createReferenceLikeItem(
                    nodeDescription,
                    `${nodeDescription.name} = ${this.createPlaceholder(1, defaultValue)}`,
                    'Configurable field of the current component.'
                );
            }
        }
        return undefined;
    }

    protected addStatementSnippets(context: CompletionContext, acceptor: CompletionAcceptor): void {
        if (!this.isAtStatementStart(context)) {
            return;
        }

        const configuration = this.getRecoveryContainerOfType(context, ast.isConfiguration);
        const componentConfiguration = this.getRecoveryContainerOfType(context, ast.isComponentConfiguration);
        const components = this.getCrossReferenceNames(context, ast.ComponentConfiguration, 'component');
        const configurations = this.getCrossReferenceNames(context, ast.ConfigurationUsage, 'configuration');

        if (componentConfiguration) {
            acceptor(context, this.createSnippetItem(
                'Component Configuration',
                `${this.createPlaceholder(1, 'child')}: ${this.createChoicePlaceholder(2, components, 'demo.Component')}\n{\n\t$0\n}`,
                'Nested Component Configuration'
            ));
            acceptor(context, this.createSnippetItem(
                'Include Configuration',
                `include ${this.createChoicePlaceholder(1, configurations, 'Configuration')} at ${this.createPlaceholder(2, 'path')}`,
                'Configuration Include'
            ));
            return;
        }

        if (configuration) {
            acceptor(context, this.createSnippetItem(
                'Root Component Configuration',
                `/${this.createPlaceholder(1, 'root')}: ${this.createChoicePlaceholder(2, components, 'demo.Component')}\n{\n\t$0\n}`,
                'Root Component Configuration'
            ));
            acceptor(context, this.createSnippetItem(
                'Include Configuration',
                `include ${this.createChoicePlaceholder(1, configurations, 'Configuration')}${this.createPlaceholder(2, ' at path')}`,
                'Configuration Include'
            ));
        }
    }

    protected addConfigurableFieldCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        const linePrefix = this.getLinePrefix(context);
        if (!this.isAtStatementStart(context) && !/^\s*[\w./{}]*$/.test(linePrefix)) {
            return;
        }
        const configuration = this.getRecoveryContainerOfType(context, ast.isComponentConfiguration);
        const component = configuration
            ? (ast.isComponent(configuration.component?.ref)
                ? configuration.component.ref
                : undefined)
                ?? this.cfgPathResolver.getConfigurationComponentStack(configuration)?.at(-1)
            : undefined;
        if (!component) {
            return;
        }
        for (const field of this.cfgPathResolver.getFieldCandidatesForType(component)) {
            if (!field.name) {
                continue;
            }
            const defaultValue = this.getDefaultValueForType(field.type?.ref, 'cfg', true) || 'value';
            acceptor(context, this.createContextualValueItem(
                context,
                field.name,
                `${field.name} = ${this.createPlaceholder(1, defaultValue)}`,
                `Configurable field of ${component.name}.`
            ));
        }
    }

    protected addNestedComponentConfigurationCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        if (!this.isAtStatementStart(context)) {
            return;
        }
        const configuration = this.getRecoveryContainerOfType(context, ast.isComponentConfiguration);
        const component = configuration
            ? (ast.isComponent(configuration.component?.ref)
                ? configuration.component.ref
                : undefined)
                ?? this.cfgPathResolver.getConfigurationComponentStack(configuration)?.at(-1)
            : undefined;
        if (!component) {
            return;
        }

        const configurations = this.getCrossReferenceNames(context, ast.ConfigurationUsage, 'configuration');
        for (const child of this.getDirectChildComponentContexts(component)) {
            const componentName = XsmpUtils.fqn(child.component);
            acceptor(context, this.createContextualValueItem(
                context,
                `${child.path}: ${componentName}`,
                `${child.path}: ${componentName}\n{\n\t$0\n}`,
                'Nested Component Configuration'
            ));
            acceptor(context, this.createContextualValueItem(
                context,
                `include at ${child.path}`,
                `include ${this.createChoicePlaceholder(1, configurations, 'Configuration')} at ${child.path}`,
                'Configuration Include'
            ));
        }
    }

    protected addTypedValueCompletions(context: CompletionContext, acceptor: CompletionAcceptor): void {
        if (!this.isAfterEquals(context)) {
            return;
        }
        const fieldValue = AstUtils.getContainerOfType(this.getRecoveryAstNode(context), ast.isFieldValue);
        const path = fieldValue?.field;
        const targetType = path ? this.cfgPathResolver.getFieldPathResolution(path).finalType : undefined;
        for (const item of this.getSimpleValueCompletions(targetType, 'cfg', true)) {
            acceptor(context, item);
        }
    }
}
