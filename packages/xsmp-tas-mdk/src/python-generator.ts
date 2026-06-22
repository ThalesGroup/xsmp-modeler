import * as ast from '@xsmp/core/ast';
import { type AstNode, type URI, UriUtils } from 'langium';
import * as fs from 'node:fs';
import type { TaskAcceptor, XsmpGenerator } from '@xsmp/core/generator';
import { fqn } from '@xsmp/core/utils';
import * as CopyrightNoticeProvider from '@xsmp/core/generator';
import { expandToString as s } from 'langium/generate';
import * as Path from 'node:path';
import type { XsmpSharedServices } from '@xsmp/core';
import { type DocumentationHelper } from '@xsmp/core/utils';

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

            const helperInit = UriUtils.joinPath(projectUri, this.helpersFolder, '__init__.py').fsPath;
            if (!fs.existsSync(helperInit)) {
                acceptTask(() => this.generateFile(helperInit, s`${notice}`));
            }

            const builderInit = UriUtils.joinPath(projectUri, this.helpersFolder, 'builder', '__init__.py').fsPath;
            if (!fs.existsSync(builderInit)) {
                acceptTask(() => this.generateFile(builderInit, s`${notice}`));
            }

            const testInit = UriUtils.joinPath(projectUri, this.helpersFolder, 'test_utils', '__init__.py').fsPath;
            if (!fs.existsSync(testInit)) {
                acceptTask(() => this.generateFile(testInit, s`${notice}`));
            }

            node.elements.forEach(ns => this.generateNamespace(ns, projectUri, notice, node.name, acceptTask));
        }
    }

    public generateNamespace(ns: ast.Namespace, projectUri: URI, notice: string | undefined, libName: string, acceptTask: TaskAcceptor) {
        const qualifiedName = fqn(ns, '/');

        const builderInit = UriUtils.joinPath(projectUri, this.helpersFolder, 'builder', qualifiedName, '__init__.py').fsPath;
        if (!fs.existsSync(builderInit)) {
            acceptTask(() => this.generateFile(builderInit, s`${notice}`));
        }

        const testInit = UriUtils.joinPath(projectUri, this.helpersFolder, 'test_utils', qualifiedName, '__init__.py').fsPath;
        if (!fs.existsSync(testInit)) {
            acceptTask(() => this.generateFile(testInit, s`${notice}`));
        }

        for (const elem of ns.elements) {
            switch (elem.$type) {
                case ast.Namespace.$type:
                    this.generateNamespace(elem, projectUri, notice, libName, acceptTask);
                    break;
                case ast.Service.$type:
                case ast.Model.$type:
                    this.generateComponent(elem as ast.Component, projectUri, notice, libName, acceptTask);
                    break;
            }
        }
    }

    public generateComponent(type: ast.Component, projectUri: URI, notice: string | undefined, libName: string, acceptTask: TaskAcceptor) {
        const qualifiedName = fqn(type, '/');

        acceptTask(() => this.generateFile(UriUtils.joinPath(projectUri, this.helpersFolder, 'builder', qualifiedName, 'generated_info.py').fsPath,
            s`
                ${notice}
                
                # Import user-defined methods for model integration
                from .user_code import configureInstance, extendInstance
                
                # Model specific data
                MODEL_UUID = "${this.docHelper.getUuid(type)}"
                MODEL_LIB_NAME = "lib${libName.toLowerCase()}.so"


            `));

        const imp_lst: Array<string | undefined> = [];
        for (const c of type.interface) {
            const name = fqn(c.ref);
            if (!name.startsWith("Smp.")) {
                imp_lst.push(name);
            }
        }
        const ref_lst: Array<Object | undefined> = [];
        for (const c of type.elements.filter(ast.isReference)) {
            ref_lst.push({name: c.name, kind: fqn(c.interface.ref)});
        }
        const esi_lst: Array<string | undefined> = [];
        for (const c of type.elements.filter(ast.isEventSink)) {
            esi_lst.push(c.name);
        }
        const eso_lst: Array<string | undefined> = [];
        for (const c of type.elements.filter(ast.isEventSource)) {
            eso_lst.push(c.name);
        }

        acceptTask(() => this.generateFile(UriUtils.joinPath(projectUri, this.helpersFolder, 'builder', qualifiedName, 'generated_icd.py').fsPath,
            s`
                ${notice}
                
                # Model specific data
                IMPLEMENTATIONS = ${JSON.stringify(imp_lst)}
                REFERENCES = ${JSON.stringify(ref_lst)}
                EVENTSINKS = ${JSON.stringify(esi_lst)}
                EVENTSOURCES = ${JSON.stringify(eso_lst)}

            `));

        const userCode = UriUtils.joinPath(projectUri, this.helpersFolder, 'builder', qualifiedName, 'user_code.py').fsPath;
        if (!fs.existsSync(userCode)) {
            acceptTask(() => this.generateFile(userCode,
                s`
                    ${notice}
                    
                    def configureInstance(jsim, instance_data):
                        pass
                    
                    def extendInstance(jsim, instance_data):
                        pass

                `));
        }

        const builderInit = UriUtils.joinPath(projectUri, this.helpersFolder, 'builder', qualifiedName, '__init__.py').fsPath;
        if (!fs.existsSync(builderInit)) {
            acceptTask(() => this.generateFile(builderInit, s`${notice}`));
        }

        let base_wrapper_name = "Model";
        let base_wrapper_path = "TasMdk.tools.model_wrapper";
        let base_wrapper_root = "TasMdk__CommonModels";
        if (type.base) {
            const wrapper_module = this.splitByLastDot(fqn(type.base.ref));
            base_wrapper_name = wrapper_module[1];
            base_wrapper_path = wrapper_module[0]+"."+wrapper_module[1];
            base_wrapper_root = wrapper_module[0].split(".")[0];
        }
        const builder_module = this.splitByLastDot(fqn(type));

        const wrapperCode = UriUtils.joinPath(projectUri, this.helpersFolder, 'test_utils', qualifiedName, 'wrapper.py').fsPath;
        if (!fs.existsSync(wrapperCode)) {
            acceptTask(() => this.generateFile(wrapperCode,
                s`
                    ${notice}
                    from ${base_wrapper_root}.test_utils.${base_wrapper_path} import ${base_wrapper_name}Wrapper
                    from ${libName}.builder.${builder_module[0]} import ${builder_module[1]}
                    
                    class ${type.name}Wrapper( ${base_wrapper_name}Wrapper ):
                        builder = ${type.name}

                `));
        }

        const testInit = UriUtils.joinPath(projectUri, this.helpersFolder, 'test_utils', qualifiedName, '__init__.py').fsPath;
        if (!fs.existsSync(testInit)) {
            acceptTask(() => this.generateFile(testInit,
                s`
                    ${notice}
                    from .wrapper import ${type.name}Wrapper

                `));
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

    protected splitByLastDot(str: string) {
        const idx = str.lastIndexOf('.'); // dernier '.'
        if (idx === -1) {
            // aucun point trouvé
            return ["TBD", str];
        }
        const before = str.slice(0, idx);
        const after = str.slice(idx + 1);
        return [before, after];
    }
}
