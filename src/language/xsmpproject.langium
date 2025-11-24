grammar Xsmpproject
import 'xsmpproject-types'

entry ProjectRoot:
    Project | Profile | Tool;

hidden terminal WS: /\s+/;
terminal STRING: /"[^"]*"|'[^']*'/;

hidden terminal ML_COMMENT: /\/\*[\s\S]*?\*\//;
hidden terminal SL_COMMENT: /\/\/[^\n\r]*/;

Project returns Project:
    /**
     * `project '<project-name>'`
     *
     * A **Project** is a document that defines the configuration for an XSMP project.
     *
     * It contains an optional profile, source folder(s) where modeling files are located, activated tool(s) and project dependencies.
     */
    'project' name=STRING  (/** Specify which version of the standard to use. */ 'using' standard=STRING)?
    elements+=(ProfileReference | ToolReference | Dependency | Source)*;

ProfileReference returns ProfileReference:
    /**
     * `profile '<profile-name>'`
     *
     * A **Profile** defines a whole configuration context applied to the project.
     */
    'profile' profile=[Profile:STRING];

ToolReference returns ToolReference:
    /**
     * `tool '<tool-name>'`
     *
     * A **Tool** specifies an additional code generator or validator used for the project.
     */
    'tool' tool=[Tool:STRING];

Dependency returns Dependency:
    /**
     * `dependency '<project-name>'`
     *
     * A **Dependency** establishes a relationship with another **Project**, granting the current **Project** visibility over the dependent project's modeling files.
     */
    'dependency' project=[Project:STRING];

Source returns Source:
    /**
     * `source '<path>'`
     *
     * The **Source** directive defines the location of modeling files.
     * The path can be either a folder or a filename relative to the project root.
     */
    'source' path=STRING;

Profile returns Profile:
    /**
     * `profile '<profile-name>'`
     *
     * A built-in **Profile**.
     */
    'profile' name=STRING;

Tool returns Tool:
    /**
     * `tool '<tool-name>'`
     *
     * A built-in **Tool**.
     */
    'tool' name=STRING;



