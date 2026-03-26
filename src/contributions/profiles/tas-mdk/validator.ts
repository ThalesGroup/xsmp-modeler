import type { MultiMap } from 'langium';
import {
    AstUtils, type ValidationAcceptor, type ValidationChecks, WorkspaceCache,
    type IndexManager, type URI,
    type AstNodeDescription,
    UriUtils
} from 'langium';
import * as ast from '../../../ast-partial/index.js';
import type { XsmpcatServices } from '../../../index.js';
import * as XsmpUtils from '../../../utils/index.js';
import { VisibilityKind } from '../../../utils/index.js';
import { type DocumentationHelper } from '../../../utils/index.js';
import { type AttributeHelper } from '../../../utils/index.js';
import type { ProjectManager } from '../../../workspace/index.js';

let validator: TasMdkValidator;
/**
 * Register custom validation checks.
 */
export function registerTasMdkValidationChecks(
    services: XsmpcatServices,
    category: string = 'org.eclipse.xsmp.profile.tas-mdk',
) {
    const registry = services.validation.ValidationRegistry;
    validator = new TasMdkValidator(services);
    const checks: ValidationChecks<ast.XsmpAstType> = {

        Field: validator.checkField,
        Class: validator.checkClass,
        EventType: validator.checkEventType,
        EventSink: validator.checkEventSink,
        EventSource: validator.checkEventSource,
        EntryPoint: validator.checkEntryPoint,
        Service: validator.checkService,
        Model: validator.checkModel,
        Catalogue: validator.checkCatalogue,
        Reference: validator.checkReference,
        Operation: validator.checkOperation,
    };
    registry.register(checks, validator, category);
}

function getRootBase(component: ast.Component): ast.Component | undefined {
    while (ast.isComponent(component.base?.ref)) {
        component = component.base.ref;
    }
    return component.base ? undefined : component;
}

const tasMdkModelQfn = 'TasMdk.Model';
const tasMdkServiceQfn = 'TasMdk.Service';

/**
 * Implementation of custom validations.
 */
export class TasMdkValidator {
    protected readonly indexManager: IndexManager;
    protected readonly globalCache: WorkspaceCache<string, MultiMap<string, AstNodeDescription>>;
    protected readonly visibleCache: WorkspaceCache<URI, MultiMap<string, AstNodeDescription>>;
    protected readonly docHelper: DocumentationHelper;
    protected readonly attrHelper: AttributeHelper;
    protected readonly projectManager: ProjectManager;

    constructor(services: XsmpcatServices) {
        this.indexManager = services.shared.workspace.IndexManager;
        this.globalCache = new WorkspaceCache<string, MultiMap<string, AstNodeDescription>>(services.shared);
        this.visibleCache = new WorkspaceCache<URI, MultiMap<string, AstNodeDescription>>(services.shared);
        this.docHelper = services.shared.DocumentationHelper;
        this.attrHelper = services.shared.AttributeHelper;
        this.projectManager = services.shared.workspace.ProjectManager;
    }

    checkField(field: ast.Field, accept: ValidationAcceptor): void {

        // String8 shall be forbidden
        if (XsmpUtils.isString8(field.type?.ref)) {
            accept('error', 'String8 type is forbidden for fields.', { node: field, property: ast.Field.type });
        }

        switch (field.$container.$type) {
            case ast.Model.$type:
            case ast.Service.$type:
                if (XsmpUtils.getRealVisibility(field) === VisibilityKind.public) {
                    accept('error', 'A field cannot be public in Gram environment.', { node: field, property: ast.Field.modifiers, index: field.modifiers.indexOf('public') });
                }
                if (XsmpUtils.isInput(field) && XsmpUtils.isOutput(field)) {
                    accept('error', 'A field cannot be both an input and an output.',
                        { node: field, property: ast.Field.modifiers, index: field.modifiers.indexOf('input') });
                }
                else if (field.name) {

                    // check naming convention of fields
                    if (XsmpUtils.isInput(field) && !field.name.startsWith('inp_')) {
                        accept('error', 'The name of an input field must start with \'inp_\'.', { node: field, property: ast.Field.name }
                        );

                    }
                    else if (XsmpUtils.isOutput(field) && !field.name.startsWith('out_')) {
                        accept('error', 'The name of an output field must start with \'out_\'.', { node: field, property: ast.Field.name });
                    }
                    else if (!XsmpUtils.isOutput(field) && !XsmpUtils.isInput(field) && !field.name.startsWith('fea_')
                        && !field.name.startsWith('sta_')) {

                        accept('error', 'The name of a feature field must start with \'fea_\' and a state must start with \'sta_\'.', { node: field, property: ast.Field.name });
                    }
                }
                this.checkForMissingDescription(field, accept, 'field');
                break;
            default:
                break;
        }
    }

    checkCatalogue(n: ast.Catalogue, accept: ValidationAcceptor): void {
        const uri = AstUtils.getDocument(n).uri;

        const filename = UriUtils.basename(uri).replace(/\.[^/.]+$/, '');
        if (filename !== n.name) {
            accept('error',
                `The Catalogue name '${n.name}' must match the file name '${filename}'. Rename the file or the Catalogue name accordingly.`,
                { node: n, property: ast.Catalogue.name });
        }
    }

    checkModel(n: ast.Model, accept: ValidationAcceptor): void {
        const base = getRootBase(n);
        if (base && tasMdkModelQfn !== XsmpUtils.fqn(base)) {
            accept('error', `The Model ${n.name} must extends 'TasMdk.Model' or one of its sub class.`,
                { node: n, keyword: 'model' });
        }
    }

    checkService(n: ast.Service, accept: ValidationAcceptor): void {
        const base = getRootBase(n);
        if (base && tasMdkServiceQfn !== XsmpUtils.fqn(base)) {
            accept('error', `The Service ${n.name} must extends 'TasMdk.Service' or one of its sub class.`,
                { node: n, keyword: 'service' });
        }
    }

    checkEventType(n: ast.EventType, accept: ValidationAcceptor): void {
        // check event do not have a type
        if (n.eventArgs?.ref) {
            accept('error', 'In Gram environment, an Event shall only be of type void.',
                { node: n, keyword: 'event' });
        }
    }

    checkEventSource(n: ast.EventSource, accept: ValidationAcceptor): void {
        // check naming convention of event sources
        if (!n.name?.startsWith('eso_')) {
            accept('error', 'The name of an EventSource must start with \'eso_\'.', { node: n, property: ast.EventSource.name });
        }
        // check event type of the event source is void
        if (ast.isEventType(n.type?.ref) && n.type.ref.eventArgs?.ref) {
            accept('error', 'An EventSource must be of type void.', { node: n, property: ast.EventSource.type });
        }
        this.checkForMissingDescription(n, accept, 'eventsource');
    }

    checkEventSink(n: ast.EventSink, accept: ValidationAcceptor): void {
        // check naming convention of event sink
        if (!n.name?.startsWith('esi_')) {
            accept('error', 'The name of an EventSink must start with \'esi_\'.', { node: n, property: ast.EventSink.name });
        }
        this.checkForMissingDescription(n, accept, 'eventsink');
    }

    checkEntryPoint(n: ast.EntryPoint, accept: ValidationAcceptor): void {
        // check naming convention of entry points
        if (!n.name?.startsWith('ept_')) {
            accept('error', 'The name of an EntryPoint must start with \'ept_\'.', { node: n, property: ast.EntryPoint.name });
        }
        this.checkForMissingDescription(n, accept, 'entrypoint');
    }

    checkReference(n: ast.Reference, accept: ValidationAcceptor): void {
        // check naming convention of references
        if (!n.name?.startsWith('ref_')) {
            accept('error', 'The name of a Reference must start with \'ref_\'.', { node: n, property: ast.Reference.name });
        }
    }

    checkOperation(n: ast.Operation, accept: ValidationAcceptor): void {
        if (ast.isComponent(n.$container)) {
            if (XsmpUtils.getRealVisibility(n) === VisibilityKind.public) {
                accept('error', 'An operation cannot be public in Gram environment.', { node: n, property: ast.Operation.modifiers, index: n.modifiers.indexOf('public') });
            }

            // check naming convention of operations
            if (!n.name?.startsWith('ope_')) {
                accept('error', 'The name of an operation must start with \'ope_\'.', { node: n, property: ast.Operation.name });
            }
            this.checkOperationIsPublicable(n, accept);

            this.checkForMissingDescription(n, accept, 'def');
        }
    }

    protected checkOperationIsPublicable(op: ast.Operation, accept: ValidationAcceptor): void {

        // an operation is publicable if all parameters are publicables
        op.parameter.forEach(p => this.checkParameterIsPublicable(p, accept), this);
        if (op.returnParameter) {
            this.checkParameterIsPublicable(op.returnParameter, accept);
        }
    }

    protected checkParameterIsPublicable(p: ast.Parameter | ast.ReturnParameter, accept: ValidationAcceptor) {

        const type = p.type?.ref;
        if (!ast.isSimpleType(type)) {
            accept('error', `A parameter of type ${type?.$type} is not publicable.`, { node: p, property: ast.Parameter.type });
        }

    }

    protected checkForMissingDescription(e: ast.NamedElement, accept: ValidationAcceptor, kw: string) {
        const description = this.docHelper.getDescription(e);
        if (!description || description.length === 0) {
            accept('error', `The ${e.$type} description is missing.`, { node: e, keyword: kw });
        }

    }

    checkClass(n: ast.Class, accept: ValidationAcceptor) {
        accept('error', 'Classes are not allowed in the Gram environment.', { node: n, keyword: 'class' });
    }

}
