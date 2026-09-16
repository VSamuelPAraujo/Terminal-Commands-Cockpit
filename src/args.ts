import * as vscode from "vscode";
import { exec } from "node:child_process";
import type { ArgDef, ArgValue, PickOption } from "./types";

/** A cancelled prompt is distinct from one that produced an empty value. */
export const CANCELLED = Symbol("cancelled");
export type PromptResult = ArgValue | typeof CANCELLED;

function normalizeOptions(options: (string | PickOption)[]): PickOption[] {
  return options.map((option) =>
    typeof option === "string" ? { label: option, value: option } : option,
  );
}

function valueOf(option: PickOption): string {
  return option.value ?? option.label;
}

function shellPickTimeout(): number {
  return vscode.workspace.getConfiguration("cockpit").get<number>("shellPickTimeoutMs", 10000);
}

/** Runs a command and turns each non-empty stdout line into an option. */
async function loadShellOptions(arg: ArgDef, cwd: string): Promise<PickOption[]> {
  const command = arg.command as string;
  const stdout = await new Promise<string>((resolve, reject) => {
    exec(
      command,
      { cwd, timeout: shellPickTimeout(), windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (error, out) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(out);
      },
    );
  });

  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => ({ label: line, value: line }));
}

function describe(arg: ArgDef): string {
  return arg.label ?? arg.id;
}

async function promptInput(arg: ArgDef, current: ArgValue): Promise<PromptResult> {
  const value = await vscode.window.showInputBox({
    title: describe(arg),
    prompt: arg.description,
    placeHolder: arg.placeholder,
    value: typeof current === "string" ? current : undefined,
    ignoreFocusOut: true,
    validateInput: (input) =>
      arg.required && input.trim().length === 0 ? `${describe(arg)} is required.` : undefined,
  });
  return value === undefined ? CANCELLED : value;
}

async function promptPick(
  arg: ArgDef,
  current: ArgValue,
  options: PickOption[],
): Promise<PromptResult> {
  const items = options.map((option) => ({
    label: valueOf(option) === current ? `$(check) ${option.label}` : option.label,
    description: option.description,
    value: valueOf(option),
  }));
  if (!arg.required) {
    items.push({ label: "$(circle-slash) (none)", description: "Omit this argument", value: "" });
  }

  const picked = await vscode.window.showQuickPick(items, {
    title: describe(arg),
    placeHolder: arg.description ?? `Choose a value for ${describe(arg)}`,
    ignoreFocusOut: true,
  });
  return picked === undefined ? CANCELLED : picked.value;
}

async function promptMultiPick(
  arg: ArgDef,
  current: ArgValue,
  options: PickOption[],
): Promise<PromptResult> {
  const selected = new Set(Array.isArray(current) ? current : []);
  const items = options.map((option) => ({
    label: option.label,
    description: option.description,
    value: valueOf(option),
    picked: selected.has(valueOf(option)),
  }));

  const picked = await vscode.window.showQuickPick(items, {
    title: describe(arg),
    placeHolder: arg.description ?? "Space to toggle, Enter to confirm",
    canPickMany: true,
    ignoreFocusOut: true,
  });
  return picked === undefined ? CANCELLED : picked.map((item) => item.value);
}

async function promptFlag(arg: ArgDef, current: ArgValue): Promise<PromptResult> {
  const isOn = current === true;
  const picked = await vscode.window.showQuickPick(
    [
      { label: isOn ? "$(check) On" : "On", description: arg.flag ?? arg.id, value: true },
      { label: isOn ? "Off" : "$(check) Off", description: "Do not pass this flag", value: false },
    ],
    { title: describe(arg), placeHolder: arg.description, ignoreFocusOut: true },
  );
  return picked === undefined ? CANCELLED : picked.value;
}

/** Asks the user for one argument's value. Returns CANCELLED if they dismissed the prompt. */
export async function promptArg(
  arg: ArgDef,
  current: ArgValue,
  folderPath: string,
): Promise<PromptResult> {
  switch (arg.kind) {
    case "input":
      return promptInput(arg, current);

    case "pick":
      return promptPick(arg, current, normalizeOptions(arg.options ?? []));

    case "multiPick":
      return promptMultiPick(arg, current, normalizeOptions(arg.options ?? []));

    case "flag":
      return promptFlag(arg, current);

    case "shellPick": {
      const cwd = arg.cwd ? vscode.Uri.joinPath(vscode.Uri.file(folderPath), arg.cwd).fsPath : folderPath;
      let options: PickOption[];
      try {
        options = await vscode.window.withProgress(
          { location: { viewId: "cockpit.commands" }, title: `Loading ${describe(arg)}...` },
          () => loadShellOptions(arg, cwd),
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(
          `Cockpit: could not load options for "${describe(arg)}": ${message}`,
        );
        return CANCELLED;
      }
      if (options.length === 0) {
        vscode.window.showWarningMessage(
          `Cockpit: "${arg.command}" produced no options for "${describe(arg)}".`,
        );
        return CANCELLED;
      }
      return promptPick(arg, current, options);
    }

    default:
      return CANCELLED;
  }
}

/** The value to start from: what was remembered, else the declared default. */
export function initialValue(arg: ArgDef, remembered: ArgValue): ArgValue {
  return remembered !== undefined ? remembered : arg.default;
}

/** Short human-readable rendering of a value, for the tree row. */
export function renderValue(value: ArgValue): string {
  if (value === undefined || value === "") {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "on" : "off";
  }
  if (Array.isArray(value)) {
    return value.length === 0 ? "" : value.join(", ");
  }
  return value;
}
