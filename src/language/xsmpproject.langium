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
     * `project "<project-name>" [using "<standard>"]`
     *
     * Declares an XSMP project root.
     * Use a project to select the SMP standard revision, list modeling sources, enable tools and declare dependencies on other XSMP projects.
     *
     * **Example**
     * ```xsmp
     * project "MissionDemo" using "ECSS_SMP_2025"
     * source "smdl"
     * dependency "foundation"
     * tool "adoc"
     * ```
     */
    'project' name=STRING  (/** Specify which version of the standard to use. */ 'using' standard=STRING)?
    elements+=(ProfileReference | ToolReference | Dependency | Source)*;

ProfileReference returns ProfileReference:
    /**
     * `profile "<profile-name>"`
     *
     * Activates a built-in XSMP profile for the current project.
     * Profiles group reusable conventions or generators that should apply to every source of the project.
     *
     * **Example**
     * ```xsmp
     * profile "esa-cdk"
     * ```
     */
    'profile' profile=[Profile:STRING];

ToolReference returns ToolReference:
    /**
     * `tool "<tool-name>"`
     *
     * Enables an additional tool for the current project.
     * Tools typically provide code generation, export or extra validation passes.
     *
     * **Example**
     * ```xsmp
     * tool "adoc"
     * ```
     */
    'tool' tool=[Tool:STRING];

Dependency returns Dependency:
    /**
     * `dependency "<project-name>"`
     *
     * Declares that the current project depends on another XSMP project.
     * Dependencies make the dependent project's catalogues and other visible documents available for linking and validation.
     *
     * **Example**
     * ```xsmp
     * dependency "01-foundation"
     * ```
     */
    'dependency' project=[Project:STRING];

Source returns Source:
    /**
     * `source "<path>"`
     *
     * Adds a modeling source root to the project.
     * The path is relative to the project directory and can target a folder or a single file.
     *
     * **Example**
     * ```xsmp
     * source "smdl"
     * ```
     */
    'source' path=STRING;

Profile returns Profile:
    /**
     * `profile "<profile-name>"`
     *
     * Declares a built-in profile name that can be referenced from a project.
     *
     * **Example**
     * ```xsmp
     * profile "esa-cdk"
     * ```
     */
    'profile' name=STRING;

Tool returns Tool:
    /**
     * `tool "<tool-name>"`
     *
     * Declares a built-in tool name that can be referenced from a project.
     *
     * **Example**
     * ```xsmp
     * tool "adoc"
     * ```
     */
    'tool' name=STRING;


