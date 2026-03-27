
export enum PTK {
    Bool, Char8, Float32, Float64, Int8, Int16, Int32, Int64, UInt8, UInt16, UInt32, UInt64, DateTime, Duration, String8, None, Enum
}

export type IntegralPTK = PTK.Int8 | PTK.Int16 | PTK.UInt8 | PTK.UInt16 |
    PTK.Int32 | PTK.Int64 | PTK.UInt32 | PTK.UInt64 | PTK.DateTime | PTK.Duration;

export type FloatingPTK = PTK.Float32 | PTK.Float64;

const integralTypes = new Set<PTK>([
    PTK.Int8, PTK.Int16, PTK.UInt8, PTK.UInt16, PTK.Int32, PTK.Int64,
    PTK.UInt32, PTK.UInt64, PTK.DateTime, PTK.Duration
]);

export function isIntegralType(type: PTK): type is IntegralPTK {
    return integralTypes.has(type);
}
const floatingTypes = new Set<PTK>([
    PTK.Float32, PTK.Float64
]);

export function isFloatingType(type: PTK): type is FloatingPTK {
    return floatingTypes.has(type);
}