grammar Xsmplnk
import 'xsmplnk-types'

/*
 * This stand-alone file format allows collecting Links between objects in different Assemblies.
 * A Link Base acts as the root element (top-level node) in an SMDL Link Base document.
 * A Link Base contains a tree of component link bases that define links of component instances (model or service instances).
*/
entry LinkBase returns LinkBase:
    'link' name=ValidID
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
    name=LnkPath 
    '{' 
    elements+=(Link|ComponentLinkBase)*
    '}';

Link returns Link:
    EventLink | FieldLink | InterfaceLink;

EventLink returns EventLink:
    'event' 'link' ownerPath=LnkPath '->' clientPath=LnkPath;
FieldLink returns FieldLink:
    'field' 'link' ownerPath=LnkPath '->' clientPath=LnkPath;

InterfaceLink returns InterfaceLink:
    'interface' 'link' ownerPath=LnkPath (':'backReference=ValidID)? '->' clientPath=LnkPath ':' reference=ValidID;


ValidID returns string:
    ID | 'event'|'field'|'interface'|'link';


LnkPath returns string:
    '/'? ValidID (('.'|'/') ValidID | '[' INT ']')*;

hidden terminal WS: /\s+/;

terminal ID: /([_a-zA-Z]\w*|{[_a-zA-Z]\w*}\w*)+/;



terminal INT returns number: /[+-]?(0|[1-9]\d*)/;



hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;

