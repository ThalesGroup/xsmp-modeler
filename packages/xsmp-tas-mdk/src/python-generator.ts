import * as ast from '@xsmp/core/ast';
import { type AstNode } from 'langium';
import type { GeneratedFiles, GenerationContext, GenerationPreparationContext, XsmpGenerator } from '@xsmp/core/generator';
import { fqn } from '@xsmp/core/utils';
import * as CopyrightNoticeProvider from '@xsmp/core/generator';
import { expandToString as s } from 'langium/generate';
import type { XsmpSharedServices } from '@xsmp/core';
import { type DocumentationHelper } from '@xsmp/core/utils';

export class TasMdkPythonGenerator implements XsmpGenerator {
    readonly id: string = 'python';
    private readonly initializers = new WeakMap<GeneratedFiles, Set<string>>();

    protected helpersFolder = 'helpers';
    protected readonly docHelper: DocumentationHelper;

    constructor(services: XsmpSharedServices) {
        this.docHelper = services.DocumentationHelper;
    }

    prepare(context: GenerationPreparationContext): GeneratedFiles {
        const files = context.createFiles({
            generated: { directory: this.helpersFolder, writeMode: 'if-changed', cleanup: 'tracked' },
            user: { directory: this.helpersFolder, writeMode: 'if-missing' },
        });
        this.initializers.set(files, new Set());
        return files;
    }

    generate(node: AstNode, context: GenerationContext) {
        if (ast.isCatalogue(node)) {
            const notice = CopyrightNoticeProvider.getCopyrightNotice(node.$document, '# ');
            for (const directory of ['', 'builder/', 'test_utils/']) {
                this.generateInitializer(`${directory}__init__.py`, context, () => s`${notice}`);
            }
            node.elements.forEach(ns => this.generateNamespace(ns, context, notice, node.name));
        }
    }

    private generateInitializer(path: string, { files, acceptTask }: GenerationContext, content: () => string): void {
        const scheduled = this.initializers.get(files)!;
        // Namespace packages can be shared by several catalogues in the same project.
        if (!scheduled.has(path)) {
            scheduled.add(path);
            acceptTask(() => files.write('user', path, content));
        }
    }

    public generateNamespace(ns: ast.Namespace, context: GenerationContext, notice: string | undefined, libName: string) {
        const qualifiedName = fqn(ns, '/');
        this.generateInitializer(`builder/${qualifiedName}/__init__.py`, context, () => s`${notice}`);
        this.generateInitializer(`test_utils/${qualifiedName}/__init__.py`, context, () => s`${notice}`);

        for (const elem of ns.elements) {
            switch (elem.$type) {
                case ast.Namespace.$type:
                    this.generateNamespace(elem, context, notice, libName);
                    break;
                case ast.Service.$type:
                case ast.Model.$type:
                    this.generateComponent(elem as ast.Component, context, notice, libName);
                    break;
            }
        }
    }

    public generateComponent(type: ast.Component, context: GenerationContext, notice: string | undefined, libName: string) {
        const { files, acceptTask } = context;
        const qualifiedName = fqn(type, '/');

        acceptTask(() => files.write('generated', `builder/${qualifiedName}/generated_info.py`, () => s`
                ${notice}

                # Import user-defined methods for model integration
                from .user_code import configureInstance, extendInstance

                # Model specific data
                MODEL_UUID = "${this.docHelper.getUuid(type)}"
                MODEL_LIB_NAME = "lib${libName.toLowerCase()}.so"


            `));
        acceptTask(() => files.write('generated', `builder/${qualifiedName}/generated_icd.py`, () => this.generateIcd(type, notice)));
        acceptTask(() => files.write('user', `builder/${qualifiedName}/user_code.py`, () => s`
                    ${notice}

                    def configureInstance(jsim, instance_data):
                        pass

                    def extendInstance(jsim, instance_data):
                        pass

                `));
        this.generateInitializer(`builder/${qualifiedName}/__init__.py`, context, () => s`${notice}`);
        acceptTask(() => files.write('user', `test_utils/${qualifiedName}/wrapper.py`, () => this.generateWrapper(type, notice, libName)));
        this.generateInitializer(`test_utils/${qualifiedName}/__init__.py`, context, () => s`
                    ${notice}
                    from .wrapper import ${type.name}Wrapper

                `);
    }

    private generateIcd(type: ast.Component, notice: string | undefined): string {
        const imp_lst: Array<string | undefined> = [];
        for (const c of type.interface) {
            const name = fqn(c.ref);
            if (!name.startsWith('Smp.')) {
                imp_lst.push(name);
            }
        }
        const ref_lst: Array<object | undefined> = [];
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
        return s`
                ${notice}

                # Model specific data
                IMPLEMENTATIONS = ${JSON.stringify(imp_lst)}
                REFERENCES = ${JSON.stringify(ref_lst)}
                EVENTSINKS = ${JSON.stringify(esi_lst)}
                EVENTSOURCES = ${JSON.stringify(eso_lst)}

            `;
    }

    private generateWrapper(type: ast.Component, notice: string | undefined, libName: string): string {
        let base_wrapper_name = 'Model';
        let base_wrapper_path = 'TasMdk.Model';
        let base_wrapper_root = 'TasMdk__CommonModels';
        if (type.base) {
            const wrapper_module = this.splitByLastDot(fqn(type.base.ref));
            base_wrapper_name = wrapper_module[1];
            base_wrapper_path = wrapper_module[0]+'.'+wrapper_module[1];
            base_wrapper_root = wrapper_module[0].split('.')[0];
            // Workaround for the TasMdk case
            if (base_wrapper_root === 'TasMdk') {
                if (base_wrapper_path.startsWith('TasMdk.CommonModels') || base_wrapper_path.startsWith('TasMdk.InterfacesImplem') || base_wrapper_path.startsWith('TasMdk.Model')) {
                    base_wrapper_root = 'TasMdk__CommonModels';
                } else if (base_wrapper_path.startsWith('TasMdk.CommonTestModels')) {
                    base_wrapper_root = 'TasMdk__CommonTestModels';
                }
            }
        }
        const builder_module = this.splitByLastDot(fqn(type));
        return s`
                    ${notice}
                    from ${base_wrapper_root}.test_utils.${base_wrapper_path} import ${base_wrapper_name}Wrapper
                    from ${libName}.builder.${builder_module[0]} import ${builder_module[1]}

                    class ${type.name}Wrapper( ${base_wrapper_name}Wrapper ):
                        builder = ${type.name}

                `;
    }

    protected splitByLastDot(str: string) {
        const idx = str.lastIndexOf('.'); // dernier '.'
        if (idx === -1) {
            // aucun point trouvé
            return ['TBD', str];
        }
        const before = str.slice(0, idx);
        const after = str.slice(idx + 1);
        return [before, after];
    }
}
