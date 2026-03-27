
export enum OperatorKind {
    /** No operator */
    NONE,
    /** Positive value */
    POSITIVE,
    /** Negative value */
    NEGATIVE,
    /** Assign new value */
    ASSIGN,
    /** Add value */
    ADD,
    /** Subtract value */
    SUBTRACT,
    /** Multiply with value */
    MULTIPLY,
    /** Divide by value */
    DIVIDE,
    /** Remainder of division */
    REMAINDER,
    /** Is greater than */
    GREATER,
    /** Is less than */
    LESS,
    /** Is equal */
    EQUAL,
    /** Is not greater than */
    NOT_GREATER,
    /** Is not less than */
    NOT_LESS,
    /** Is not equal */
    NOT_EQUAL,
    /** Index into array */
    INDEXER,
    /** Sum of instance and another value */
    SUM,
    /** Difference between instance and another value */
    DIFFERENCE,
    /** Product of instance and another value */
    PRODUCT,
    /** Quotient of instance and another value */
    QUOTIENT,
    /** Remainder of instance divided by another value */
    MODULE
}