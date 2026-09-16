import * as vscode from "vscode";
import type { ArgDef, ArgValue, CommandDef } from "./types";

/**
 * Splits a base command line into tokens, honouring single and double quotes.
 * Each token is handed to VS Code separately so it can apply the quoting rules
 * of whichever shell the user actually runs (PowerShell, cmd, bash, zsh).
 */
export function tokenize(commandLine: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let hasContent = false;

  for (const char of commandLine) {
    if (quote) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      hasContent = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (hasContent || current.length > 0) {
        tokens.push(current);
        current = "";
        hasContent = false;
      }
      continue;
    }
    current += char;
  }

  if (hasContent || current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

function strong(value: string): vscode.ShellQuotedString {
  return { value, quoting: vscode.ShellQuoting.Strong };
}

function escaped(value: string): vscode.ShellQuotedString {
  return { value, quoting: vscode.ShellQuoting.Escape };
}

/** Turns one argument definition plus its value into zero or more shell tokens. */
function argTokens(arg: ArgDef, value: ArgValue): vscode.ShellQuotedString[] {
  if (value === undefined) {
    return [];
  }

  if (arg.kind === "flag") {
    if (value !== true) {
      return [];
    }
    return [escaped(arg.flag ?? arg.id)];
  }

  let rendered: string;
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [];
    }
    rendered = value.join(arg.separator ?? ",");
  } else if (typeof value === "boolean") {
    return [];
  } else {
    rendered = value;
  }

  if (rendered.trim().length === 0) {
    return [];
  }

  return arg.flag ? [escaped(arg.flag), strong(rendered)] : [strong(rendered)];
}

export interface BuiltCommand {
  executable: string;
  args: vscode.ShellQuotedString[];
  /** Display-only rendering, for confirmation dialogs and "copy command line". */
  preview: string;
}

export function build(command: CommandDef, values: Record<string, ArgValue>): BuiltCommand {
  const tokens = tokenize(command.command);
  if (tokens.length === 0) {
    throw new Error(`Command "${command.id}" has an empty "command".`);
  }

  const [executable, ...baseTokens] = tokens;
  const args: vscode.ShellQuotedString[] = baseTokens.map(escaped);

  for (const arg of command.args) {
    args.push(...argTokens(arg, values[arg.id]));
  }

  const preview = [executable, ...args.map((token) => previewToken(token))].join(" ");
  return { executable, args, preview };
}

function previewToken(token: vscode.ShellQuotedString): string {
  const needsQuotes = /[\s"']/.test(token.value);
  if (token.quoting === vscode.ShellQuoting.Strong && needsQuotes) {
    return `"${token.value.replace(/"/g, '\\"')}"`;
  }
  return token.value;
}

export async function run(
  command: CommandDef,
  values: Record<string, ArgValue>,
  folder: vscode.WorkspaceFolder,
): Promise<void> {
  const built = build(command, values);

  const settings = vscode.workspace.getConfiguration("cockpit");
  if (command.confirm || settings.get<boolean>("confirmBeforeRun", false)) {
    const choice = await vscode.window.showInformationMessage(
      built.preview,
      { modal: true, detail: `Run "${command.label}"?` },
      "Run",
    );
    if (choice !== "Run") {
      return;
    }
  }

  const cwd = command.cwd
    ? vscode.Uri.joinPath(folder.uri, ...command.cwd.split("/")).fsPath
    : folder.uri.fsPath;

  const execution = new vscode.ShellExecution(built.executable, built.args, {
    cwd,
    env: command.env,
  });

  const task = new vscode.Task(
    { type: "cockpit", commandId: command.id },
    folder,
    command.label,
    "Cockpit",
    execution,
  );
  task.presentationOptions = {
    reveal: vscode.TaskRevealKind.Always,
    panel: vscode.TaskPanelKind.Dedicated,
    clear: true,
    focus: false,
  };

  await vscode.tasks.executeTask(task);
}
