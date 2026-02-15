import * as ast from '../../generated/ast.js';
import { type AstNode, type URI, UriUtils } from 'langium';
import * as fs from 'node:fs';
import type { TaskAcceptor, XsmpGenerator } from '../../generator/generator.js';
import { fqn } from '../../utils/xsmp-utils.js';
import * as CopyrightNoticeProvider from '../../generator/copyright-notice-provider.js';
import { expandToString as s } from 'langium/generate';
import * as Path from 'node:path';
import type { XsmpSharedServices } from '../../xsmp-module.js';
import { type DocumentationHelper } from '../../utils/documentation-helper.js';

export class TasMdkPythonGenerator implements XsmpGenerator {

    protected helpersFolder = 'helpers';
    protected readonly docHelper: DocumentationHelper;

    constructor(services: XsmpSharedServices) {
        this.docHelper = services.DocumentationHelper;
    }

    clean(_projectUri: URI) {
        // ignore
    }

    generate(node: AstNode, projectUri: URI, acceptTask: TaskAcceptor) {
        if (ast.isCatalogue(node)) {
            const notice = CopyrightNoticeProvider.getCopyrightNotice(node.$document, '# ');
            const libName = `lib${node.name.toLowerCase()}.so`;

            const testInit = UriUtils.joinPath(projectUri, this.helpersFolder, 'test_utils', '__init__.py').fsPath;
            if (!fs.existsSync(testInit)) {
                acceptTask(() => this.generateFile(testInit, ''));
            }
            node.elements.forEach(ns => this.generateNamespace(ns, projectUri, notice, libName, acceptTask));
        }
    }

    public generateNamespace(ns: ast.Namespace, projectUri: URI, notice: string | undefined, libName: string, acceptTask: TaskAcceptor) {

        for (const elem of ns.elements) {
            switch (elem.$type) {
                case ast.Namespace:
                    this.generateNamespace(elem, projectUri, notice, libName, acceptTask);
                    break;
                case ast.Service:
                case ast.Model:
                    this.generateComponent(elem as ast.Component, projectUri, notice, libName, acceptTask);
                    break;
            }
        }
    }

    public generateComponent(type: ast.Component, projectUri: URI, notice: string | undefined, libName: string, acceptTask: TaskAcceptor) {
        const qualifiedName = fqn(type, '/');

        acceptTask(() => this.generateFile(UriUtils.joinPath(projectUri, this.helpersFolder, 'builder', qualifiedName, 'generated_info.py').fsPath,
            s`
                #!/usr/bin/env python
                # -*- coding: utf-8 -*-
                ${notice}
                
                # Import user-defined methods for model integration
                from .user_code import configureInstance, extendInstance
                
                # Model specific data
                MODEL_UUID = "${this.docHelper.getUuid(type)}"
                MODEL_LIB_NAME = "${libName}"


            `));

        const userCode = UriUtils.joinPath(projectUri, this.helpersFolder, 'builder', qualifiedName, 'user_code.py').fsPath;
        if (!fs.existsSync(userCode)) {
            acceptTask(() => this.generateFile(userCode,
                s`
                    #!/usr/bin/env python
                    # -*- coding: utf-8 -*-
                    ${notice}
                    
                    def configureInstance(jsim, instance_data):
                        pass
                    
                    def extendInstance(jsim, instance_data):
                        pass

                `));
        }
        const builderInit = UriUtils.joinPath(projectUri, this.helpersFolder, 'builder', qualifiedName, '__init__.py').fsPath;
        if (!fs.existsSync(builderInit)) {
            acceptTask(() => this.generateFile(builderInit, ''));
        }
    }
    protected async generateFile(path: string, content: string) {
        try {
            await fs.promises.mkdir(Path.dirname(path), { recursive: true });
            await fs.promises.writeFile(path, content);

        } catch (error) {
            console.error(`Error generating file ${path}:`, error);
        }
    }

}

