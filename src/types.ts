import type * as vscode from "vscode";

export type ArgKind = "input" | "pick" | "shellPick" | "flag" | "multiPick";

export type ArgValue = string | string[] | boolean | undefined;

export interface PickOption {
  label: string;
  value?: string;
  description?: string;
  /**
   * Pre-selects this option instead of repeating its value in the arg's own
   * "default". For "pick" only one option may be marked; for "multiPick" every
   * marked option starts selected. Ignored if the arg also sets its own "default".
   */
  default?: boolean;
}

export interface ArgDef {
  id: string;
  kind: ArgKind;
  label?: string;
  description?: string;
  /** Flag emitted before the value, e.g. "-TargetEnv". Omit for a positional value. */
  flag?: string;
  default?: ArgValue;
  required?: boolean;
  /** Remember the last used value. Defaults to the cockpit.rememberArguments setting. */
  remember?: boolean;
  placeholder?: string;
  /** pick / multiPick options. */
  options?: (string | PickOption)[];
  /** shellPick: command whose stdout lines become the options. */
  command?: string;
  /** shellPick: working directory for `command`, relative to the workspace folder. */
  cwd?: string;
  /** multiPick: how to join the selected values. Defaults to ",". */
  separator?: string;
}

export interface CommandDef {
  id: string;
  label: string;
  description?: string;
  /** Base command line, e.g. "npm run deploy --". */
  command: string;
  args: ArgDef[];
  /** Working directory, relative to the workspace folder. */
  cwd?: string;
  /** Optional grouping, shown as a parent node in the tree. */
  group?: string;
  /** A VS Code codicon name, e.g. "rocket". */
  icon?: string;
  env?: Record<string, string>;
  /** Always confirm before running, regardless of the global setting. */
  confirm?: boolean;
  /**
   * Clear every remembered value for this command's arguments once it has
   * been launched. An argument with its own "default" (or a per-option
   * "default": true) reverts to showing that default rather than "not set" -
   * only the remembered override is cleared. Off by default: most commands
   * benefit from remembering the last run, but one-off values like a branch
   * name being created or promoted are actively risky to leave lying around
   * for the next run to silently reuse.
   */
  resetAfterRun?: boolean;
}

export interface CockpitConfig {
  version?: number;
  commands: CommandDef[];
}

export interface LoadedConfig {
  folder: vscode.WorkspaceFolder;
  configUri: vscode.Uri;
  config: CockpitConfig;
  errors: string[];
}
