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
     * Use a project to select the SMP standard revision, list modeling sources, activate installed profiles and tools, and declare dependencies on other XSMP projects.
     *
     * **Example**
     * ```xsmp
     * project "MissionDemo" using "ECSS_SMP_2025"
     * source "smdl"
     * dependency "foundation"
     * profile "xsmp-sdk"
     * tool "smp"
     * ```
     */
    'project' name=STRING  (/** Specify which version of the standard to use. */ 'using' standard=STRING)?
    elements+=(ProfileReference | ToolReference | Dependency | Source)*;

ProfileReference returns ProfileReference:
    /**
     * `profile "<profile-name>"`
     *
     * Activates an XSMP profile contribution for the current project.
     * Profiles usually group reusable conventions, generators or validation rules that should apply to every source of the project.
     * Use content assist to pick one of the installed profile identifiers.
     *
     * **Example**
     * ```xsmp
     * profile "xsmp-sdk"
     * ```
     */
    'profile' profile=[Profile:STRING];

ToolReference returns ToolReference:
    /**
     * `tool "<tool-name>"`
     *
     * Enables an XSMP tool contribution for the current project.
     * Tools typically provide code generation, export pipelines or extra validation passes.
     * Use content assist to pick one of the installed tool identifiers.
     *
     * **Example**
     * ```xsmp
     * tool "smp"
     * ```
     */
    'tool' tool=[Tool:STRING];

Dependency returns Dependency:
    /**
     * `dependency "<project-name>"`
     *
     * Declares that the current project depends on another XSMP project.
     * Dependencies make the dependent project's visible modeling documents available for linking and validation,
     * such as catalogues, configurations, assemblies, link bases and schedules.
     * Profile/tool declarations and contribution payload documents are not inherited through dependencies.
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
     * Declares an XSMP profile contribution identifier that can be referenced from a project.
     * In practice, profile descriptors are usually provided by installed XSMP extensions.
     *
     * **Example**
     * ```xsmp
     * profile "xsmp-sdk"
     * ```
     */
    'profile' name=STRING;

Tool returns Tool:
    /**
     * `tool "<tool-name>"`
     *
     * Declares an XSMP tool contribution identifier that can be referenced from a project.
     * In practice, tool descriptors are usually provided by installed XSMP extensions.
     *
     * **Example**
     * ```xsmp
     * tool "smp"
     * ```
     */
    'tool' name=STRING;
