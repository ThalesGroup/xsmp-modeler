import type { ValidationAcceptor } from 'langium';
import * as ast from '../generated/ast-partial.js';
import type { InstancePathResolution } from '../references/xsmp-instance-path-resolver.js';
import type { AttributeHelper } from '../utils/attribute-helper.js';
import { PTK } from '../utils/primitive-type-kind.js';
import * as Solver from '../utils/solver.js';
import { getPTK } from '../utils/xsmp-utils.js';

export function checkFieldConnection(
    source: ast.Path | undefined,
    target: ast.Path | undefined,
    resolve: (path: ast.Path) => InstancePathResolution,
    attributes: AttributeHelper,
    accept: ValidationAcceptor,
): void {
    if (!source || !target || source.unsafe || target.unsafe) return;
    const from = resolve(source);
    const to = resolve(target);
    if (!from.active || !to.active || from.invalidMessage || to.invalidMessage) return;
    if (!equivalentFieldTypes(from.finalType, to.finalType, attributes, new Map())) {
        accept('error', 'Connected fields shall have equivalent types.', { node: target });
    }
}

function equivalentFieldTypes(
    source: ast.Type | undefined,
    target: ast.Type | undefined,
    attributes: AttributeHelper,
    visited: Map<ast.Type, Set<ast.Type>>,
): boolean {
    // Missing or invalid recursive types are diagnosed separately.
    if (!source || !target || source === target || visited.get(source)?.has(target)) return true;
    let targets = visited.get(source);
    if (!targets) visited.set(source, targets = new Set());
    targets.add(target);

    if (ast.isArrayType(source) || ast.isArrayType(target)) {
        if (!ast.isArrayType(source) || !ast.isArrayType(target)) return false;
        const sourceSize = Solver.getValue(source.size)?.integralValue(PTK.Int64)?.getValue();
        const targetSize = Solver.getValue(target.size)?.integralValue(PTK.Int64)?.getValue();
        if (sourceSize !== undefined && targetSize !== undefined && sourceSize !== targetSize) return false;
        const simple = attributes.isSimpleArray(source);
        if (simple !== attributes.isSimpleArray(target)) return false;
        return (!simple && sourceSize === 0n) || equivalentFieldTypes(source.itemType?.ref, target.itemType?.ref, attributes, visited);
    }
    if (ast.isStructure(source) || ast.isStructure(target)) {
        if (!ast.isStructure(source) || !ast.isStructure(target)) return false;
        const sourceFields = attributes.getAllFields(source).toArray();
        const targetFields = attributes.getAllFields(target).toArray();
        return sourceFields.length === targetFields.length && sourceFields.every((field, index) =>
            equivalentFieldTypes(field.type?.ref, targetFields[index].type?.ref, attributes, visited));
    }
    // Enumeration fields are represented by SMP's Int32 primitive kind.
    const sourceKind = ast.isEnumeration(source) ? PTK.Int32 : getPTK(source);
    const targetKind = ast.isEnumeration(target) ? PTK.Int32 : getPTK(target);
    return sourceKind === PTK.None || targetKind === PTK.None || sourceKind === targetKind;
}
