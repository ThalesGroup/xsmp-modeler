grammar Xsmplnk

import 'xsmp-types'

/*
 * This stand-alone file format allows collecting Links between objects in different Assemblies.
 * A Link Base acts as the root element (top-level node) in an SMDL Link Base document.
 * A Link Base contains a tree of component link bases that define links of component instances (model or service instances).
*/
entry LinkBase returns LinkBase:
    /**
     * `link <name> [for <assembly>]`
     *
     * Declares a standalone link base document.
     * A link base groups reusable connection definitions between component instances and can optionally anchor itself on an assembly to type-check templated paths.
     *
     * **Example**
     * ```xsmp
     * link OrbitalLinks for OrbitalSegment
     * /avionics
     * {
     * }
     * ```
     */
    'link' name=ValidID
    ('for' assembly=[Assembly:ValidID])?
    elements+=ComponentLinkBase*;


/*
 * A Component Link Base defines links of a Component Instance (Model or Service Instance). The Component Instance is specified via the Path attribute, which can be
 * - absolute, i.e. the path starts with a slash "/", and at the root of the simulation tree (e.g. Path="/Spacecraft/AOCS" or Path="/Logger"), or</li>
 * - relative, i.e. the path does not start with a slash "/" and is appended to the path of the parent Component Link Base.</li>
 * 
 * Each Link is an instance of one of the available Link metaclasses. 
 * A Link has to reference Owner and Client via its Owner Path and Client Path elements which specify which objects are connected by the Link.
 */
ComponentLinkBase returns ComponentLinkBase:
    name=Path
    '{' 
    elements+=(Link|ComponentLinkBase)*
    '}';

Link returns Link:
    EventLink | FieldLink | InterfaceLink;

EventLink returns EventLink:
    /**
     * `event link <owner> -> <client>`
     *
     * Connects an event source to a compatible event sink.
     *
     * **Example**
     * ```xsmp
     * event link publishedMode -> child.commandedMode
     * ```
     */
    'event' 'link' ownerPath=Path '->' clientPath=Path;
FieldLink returns FieldLink:
    /**
     * `field link <owner> -> <client>`
     *
     * Connects an output field to an input field.
     *
     * **Example**
     * ```xsmp
     * field link outValue -> child.inValue
     * ```
     */
    'field' 'link' ownerPath=Path '->' clientPath=Path;

InterfaceLink returns InterfaceLink:
    /**
     * `interface link <sourcePath> -> <client> [:<backReference>]`
     *
     * Connects one published reference to a compatible client component.
     * The last segment of `sourcePath` selects the published reference, while any preceding segments navigate to the owner component instance.
     *
     * **Example**
     * ```xsmp
     * interface link logger -> payload
     * interface link nested.logger -> payload:backLogger
     * ```
     */
    'interface' 'link' sourcePath=Path '->' clientPath=Path (':'backReference=LocalNamedReference)?;

LocalNamedReference returns LocalNamedReference:
    (unsafe?='unsafe')? reference=[NamedElement:ValidID];


ValidID returns string:
    ID | 'event'|'field'|'interface'|'link';

Path returns Path:
    {Path}
    (
        /**
         * `unsafe`
         *
         * Marks a link path as intentionally unchecked while keeping completion and navigation.
         *
         * **Example**
         * ```xsmp
         * field link unsafe outValue -> unsafe child.inValue
         * ```
         */
        unsafe?='unsafe'
    )?
    (absolute?='/' (head=PathSegment elements+=PathElement*)?
    | head=PathSegment elements+=PathElement*);

PathElement returns PathElement:
    PathMember | PathIndex;

PathMember returns PathMember:
    separator=PathSeparator segment=PathSegment;

PathIndex returns PathIndex:
    '[' index=INT ']';

PathSegment returns PathSegment:
    ConcretePathNamedSegment | PatternPathNamedSegment | PathParentSegment | PathSelfSegment;

ConcretePathNamedSegment returns ConcretePathNamedSegment:
    reference=[NamedElement:ValidID];

PatternPathNamedSegment returns PatternPathNamedSegment:
    pattern=TemplateIdentifierPattern;

TemplateIdentifierPattern returns IdentifierPattern:
    {IdentifierPattern}
    parts+=IdentifierTextPart*
    parts+=IdentifierTemplatePart
    parts+=IdentifierPatternPart*;

IdentifierPatternPart returns IdentifierPatternPart:
    IdentifierTextPart | IdentifierTemplatePart;

IdentifierTextPart returns IdentifierTextPart:
    text=ID;

IdentifierTemplatePart returns IdentifierTemplatePart:
    text=TEMPLATE_ID;

PathParentSegment returns PathParentSegment:
    {PathParentSegment} '..';

PathSelfSegment returns PathSelfSegment:
    {PathSelfSegment} '.';

PathSeparator returns string:
    '.' | '/';

hidden terminal WS: /\s+/;

terminal TEMPLATE_ID: /\{[_a-zA-Z]\w*\}/;
terminal ID: /[_a-zA-Z]\w*/;

terminal INT returns bigint: /[+-]?(0|[1-9]\d*)/;



hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;
