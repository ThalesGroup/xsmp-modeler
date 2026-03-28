import { type AstNodeDescription, type Scope, type Stream, stream } from 'langium';

export class XsmpGlobalScope implements Scope {
    readonly elements: Map<string, AstNodeDescription>;

    constructor(elements: Stream<AstNodeDescription>) {
        this.elements = new Map();
        for (const element of elements) {
            this.elements.set(element.name, element);

            // Import elements from Smp and Attributes namespaces in the global namespace.
            if (element.name.startsWith('Smp.')) {
                const name = element.name.substring(4);
                this.elements.set(name, { ...element, name });
            }
            else if (element.name.startsWith('Attributes.')) {
                const name = element.name.substring(11);
                this.elements.set(name, { ...element, name });
            }
        }
    }

    getElement(name: string): AstNodeDescription | undefined {
        return this.elements.get(name);
    }

    getElements(name: string): Stream<AstNodeDescription> {
        const element = this.getElement(name);
        return element ? stream([element]) : stream([]);
    }

    getAllElements(): Stream<AstNodeDescription> {
        return stream(this.elements.values());
    }
}

export class XsmpMapScope implements Scope {
    readonly elements: Map<string, AstNodeDescription>;
    readonly outerScope: Scope;

    constructor(elements: Map<string, AstNodeDescription>, outerScope: Scope) {
        this.elements = elements;
        this.outerScope = outerScope;
    }

    getElement(name: string): AstNodeDescription | undefined {
        return this.elements.get(name) ?? this.outerScope.getElement(name);
    }

    getElements(name: string): Stream<AstNodeDescription> {
        const element = this.elements.get(name);
        return stream(element ? [element] : []).concat(this.outerScope.getElements(name));
    }

    getAllElements(): Stream<AstNodeDescription> {
        return stream(this.elements.values()).concat(this.outerScope.getAllElements());
    }
}
