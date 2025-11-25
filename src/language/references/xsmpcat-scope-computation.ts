import type { AstNode, AstNodeDescription, AstNodeDescriptionProvider, LangiumDocument, PrecomputedScopes, ScopeComputation } from 'langium';
import * as ast from '../generated/ast.js';
import { Cancellation, MultiMap, interruptAndCheck } from 'langium';
import * as XsmpUtils from '../utils/xsmp-utils.js';
import { VisibilityKind } from '../utils/visibility-kind.js';
import { DocumentationHelper } from '../utils/documentation-helper.js';
import { XsmpServices } from '../xsmp-module.js';

export class XsmpcatScopeComputation implements ScopeComputation {

    protected readonly descriptions: AstNodeDescriptionProvider;
    protected readonly documlentationHelper : DocumentationHelper;

    constructor(services: XsmpServices) {
        this.descriptions = services.workspace.AstNodeDescriptionProvider;
        this.documlentationHelper = services.shared.DocumentationHelper;
    }

    async computeExports(document: LangiumDocument, cancelToken = Cancellation.CancellationToken.None): Promise<AstNodeDescription[]> {
        const catalogue = document.parseResult.value as ast.Catalogue,
            exportedDescriptions: AstNodeDescription[] = [];
        //Export the Catalogue
        if (catalogue.name) {
            exportedDescriptions.push(this.descriptions.createDescription(catalogue, catalogue.name, document));
        }
        for (const namespace of catalogue.elements) {
            await interruptAndCheck(cancelToken);
            if (namespace.name) {
                await this.computeNamespaceExports(document, namespace, exportedDescriptions, namespace.name, cancelToken);
            }
        }
        return exportedDescriptions;
    }

    async computeNamespaceExports(document: LangiumDocument, namespace: ast.Namespace, exportedDescriptions: AstNodeDescription[], baseName: string, cancelToken: Cancellation.CancellationToken) {
        //Export the Namespace
        exportedDescriptions.push(this.descriptions.createDescription(namespace, baseName, document));
        for (const element of namespace.elements) {
            if (element.name) {
                await interruptAndCheck(cancelToken);
                const elementName = `${baseName}.${element.name}`;
                if (element.$type === ast.Namespace) {
                    await this.computeNamespaceExports(document, element, exportedDescriptions, elementName, cancelToken);
                }
                else {
                    this.computeTypeExports(document, element, exportedDescriptions, elementName);
                }
            }
        }
    }
    computeTypeExports(document: LangiumDocument, type: ast.Type, exportedDescriptions: AstNodeDescription[], typeName: string) {
        //Export the Type
        exportedDescriptions.push(this.descriptions.createDescription(type, typeName, document));

        /*const uuid = this.documlentationHelper.getUuid(type)?.toString().trim();
        if(uuid) {
            exportedDescriptions.push(this.descriptions.createDescription(type, uuid, document));
        }*/
        switch (type.$type) {
            case ast.Enumeration: {
                const elementBaseName = `${typeName}.`;
                for (const literal of (type as ast.Enumeration).literal) { // Export the literals
                    if (literal.name) {
                        exportedDescriptions.push(this.descriptions.createDescription(literal, elementBaseName + literal.name, document));
                    }
                }
                break;
            }
            case ast.Structure:
            case ast.Class:
            case ast.Exception:
            case ast.Interface:
            case ast.Model:
            case ast.Service: {
                const elementBaseName = `${typeName}.`;
                for (const member of (type as ast.WithBody).elements) {
                    if (member.name && ast.Constant === member.$type && XsmpUtils.getRealVisibility(member) === VisibilityKind.public) { // Export only public constants
                        exportedDescriptions.push(this.descriptions.createDescription(member, elementBaseName + member.name, document));
                    }
                }
            }
        }
    }

    async computeLocalScopes(document: LangiumDocument, cancelToken = Cancellation.CancellationToken.None): Promise<PrecomputedScopes> {
        const catalogue = document.parseResult.value as ast.Catalogue,
            scopes = new MultiMap<AstNode, AstNodeDescription>(),

            localDescriptions: AstNodeDescription[] = [];
        for (const namespace of catalogue.elements) {
            if (namespace.name) {
                const nestedDescriptions = await this.computeNamespaceLocalScopes(namespace, scopes, document, cancelToken);
                nestedDescriptions.forEach(description => {
                    localDescriptions.push(this.createAliasDescription(namespace, description));
                });
            }
        }
        scopes.addAll(catalogue, localDescriptions);

        return scopes;
    }

    protected async computeNamespaceLocalScopes(
        namespace: ast.Namespace,
        scopes: PrecomputedScopes,
        document: LangiumDocument,
        cancelToken: Cancellation.CancellationToken
    ): Promise<AstNodeDescription[]> {
        const localDescriptions: AstNodeDescription[] = [];

        for (const element of namespace.elements) {
            if (!element.name) { continue; }
            await interruptAndCheck(cancelToken);
            switch (element.$type) {
                case ast.Namespace: {
                    const nestedDescriptions = await this.computeNamespaceLocalScopes(element, scopes, document, cancelToken);
                    nestedDescriptions.forEach(description => {
                        localDescriptions.push(this.createAliasDescription(element, description));
                    });
                    continue;
                }
                case ast.Enumeration: {
                    const nestedDescriptions = (element as ast.Enumeration).literal.map(literal =>
                        this.descriptions.createDescription(literal, literal.name, document)
                    );
                    scopes.addAll(element, nestedDescriptions);
                    nestedDescriptions.forEach(description => {
                        localDescriptions.push(this.createAliasDescription(element, description));
                    });
                    break;
                }
                case ast.Structure:
                case ast.Class:
                case ast.Exception:
                case ast.Interface:
                case ast.Model:
                case ast.Service: {
                    const nestedDescriptions: AstNodeDescription[] = [],
                        internalDescriptions: AstNodeDescription[] = [];

                    // Constants are exported to parent scopes whereas fields are local
                    (element as ast.WithBody).elements.forEach(member => {
                        if (ast.Constant === member.$type && member.name) {
                            nestedDescriptions.push(this.descriptions.createDescription(member, member.name, document));
                        }
                       // else if ((ast.Field === member.$type||ast.Container === member.$type) && member.name) {
                            internalDescriptions.push(this.descriptions.createDescription(member, member.name, document));
                      //  }
                    });

                    scopes.addAll(element, [...nestedDescriptions, ...internalDescriptions]);
                    nestedDescriptions.forEach(nestedDescription => {
                        localDescriptions.push(this.createAliasDescription(element, nestedDescription));
                    });
                    break;
                }
            }
            // Add the type to local scope
            localDescriptions.push(this.descriptions.createDescription(element, element.name, document));
        }

        scopes.addAll(namespace, localDescriptions);
        return localDescriptions;
    }

    private createAliasDescription(
        element: ast.NamedElement,
        description: AstNodeDescription
    ): AstNodeDescription {
        // Override the name
        return { ...description, name: `${element.name}.${description.name}` };
    }

}