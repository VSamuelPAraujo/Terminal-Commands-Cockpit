import * as vscode from "vscode";
import { applyEdits, modify, parse as parseJsonc } from "jsonc-parser";
import { tokenize } from "./runner";
import type { ArgDef, ArgKind, CockpitConfig, CommandDef } from "./types";

/** One piece of a pasted command line that could become an editable argument. */
export interface Candidate {
  /** The flag token, e.g. "-TargetEnv". Absent for a positional value. */
  flag?: string;
  /** The value that followed the flag, if any. */
  value?: string;
  /** True when the flag carries no value, e.g. "--dry-run". */
  isSwitch: boolean;
  kindGuess: ArgKind;
  id: string;
  label: string;
}

export interface ParsedCommandLine {
  /** The fixed part, e.g. "npm run deploy --". */
  base: string;
  candidates: Candidate[];
}

function isFlag(token: string): boolean {
  return /^-{1,2}[^-\d\s]/.test(token);
}

/** "-TargetEnv" -> "targetEnv"; "--dry-run" -> "dryRun" */
function toId(flag: string): string {
  const bare = flag.replace(/^-+/, "");
  const camel = bare.replace(/[-_]+(.)/g, (_match, char: string) => char.toUpperCase());
  return camel.charAt(0).toLowerCase() + camel.slice(1);
}

/** "-TargetEnv" -> "Target env"; "--dry-run" -> "Dry run" */
function toLabel(flag: string): string {
  const bare = flag.replace(/^-+/, "").replace(/[-_]+/g, " ");
  const spaced = bare.replace(/([a-z\d])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function guessKind(flag: string | undefined, value: string | undefined, isSwitch: boolean): ArgKind {
  if (isSwitch) {
    return "flag";
  }
  if (value?.includes(",")) {
    return "multiPick";
  }
  // "-TagName" names something being created, so it cannot be picked from a list.
  if (flag && /name$/i.test(flag)) {
    return "input";
  }
  if (flag && /branch|ref|tag|revision/i.test(flag)) {
    return "shellPick";
  }
  return "input";
}

/**
 * Splits a pasted command line into a fixed base plus the parts that look like
 * arguments. Leading non-flag tokens (and a bare "--" passthrough) stay fixed.
 */
export function parseCommandLine(line: string): ParsedCommandLine {
  const tokens = tokenize(line);
  const base: string[] = [];
  const candidates: Candidate[] = [];

  let index = 0;
  while (index < tokens.length && (!isFlag(tokens[index]) || tokens[index] === "--")) {
    base.push(tokens[index]);
    index += 1;
  }

  let positional = 0;
  while (index < tokens.length) {
    const token = tokens[index];

    if (isFlag(token)) {
      const next = tokens[index + 1];
      const hasValue = next !== undefined && !isFlag(next);
      const isSwitch = !hasValue;
      candidates.push({
        flag: token,
        value: hasValue ? next : undefined,
        isSwitch,
        kindGuess: guessKind(token, hasValue ? next : undefined, isSwitch),
        id: toId(token),
        label: toLabel(token),
      });
      index += hasValue ? 2 : 1;
      continue;
    }

    positional += 1;
    candidates.push({
      value: token,
      isSwitch: false,
      kindGuess: guessKind(undefined, token, false),
      id: `value${positional}`,
      label: `Value ${positional}`,
    });
    index += 1;
  }

  return { base: base.join(" "), candidates };
}

const KIND_CHOICES: { label: string; detail: string; kind: ArgKind }[] = [
  { label: "$(edit) Text input", detail: "A free-text box", kind: "input" },
  { label: "$(list-selection) Dropdown", detail: "A fixed list of choices", kind: "pick" },
  {
    label: "$(terminal) Dropdown from a command",
    detail: "Options come from a command's output, one per line",
    kind: "shellPick",
  },
  {
    label: "$(checklist) Multi-select",
    detail: "Pick several values, joined by a separator",
    kind: "multiPick",
  },
  { label: "$(check) On/off switch", detail: "Appends the flag when on", kind: "flag" },
];

const SHELL_SUGGESTIONS = [
  "git for-each-ref --format=%(refname:short) refs/heads",
  "git tag --sort=-creatordate",
  "git remote",
];

/** Asks the user how one candidate should behave, returning the finished ArgDef. */
async function refineCandidate(
  candidate: Candidate,
  folderPath: string,
): Promise<ArgDef | undefined> {
  const ordered = [
    ...KIND_CHOICES.filter((choice) => choice.kind === candidate.kindGuess),
    ...KIND_CHOICES.filter((choice) => choice.kind !== candidate.kindGuess),
  ];

  const kindPick = await vscode.window.showQuickPick(
    ordered.map((choice, position) => ({
      label: choice.label,
      detail: position === 0 ? `${choice.detail}  •  suggested` : choice.detail,
      // Not named `kind`: QuickPickItem.kind already means separator-vs-item.
      argKind: choice.kind,
    })),
    {
      title: `${candidate.flag ?? candidate.value} — which control?`,
      placeHolder: "How should this argument be filled in?",
      ignoreFocusOut: true,
    },
  );
  if (!kindPick) {
    return undefined;
  }

  const label = await vscode.window.showInputBox({
    title: `${candidate.flag ?? candidate.value} — label`,
    prompt: "Shown in the sidebar",
    value: candidate.label,
    ignoreFocusOut: true,
  });
  if (label === undefined) {
    return undefined;
  }

  const arg: ArgDef = {
    id: candidate.id,
    kind: kindPick.argKind,
    label,
    ...(candidate.flag ? { flag: candidate.flag } : {}),
  };

  if (kindPick.argKind === "shellPick") {
    const suggestions = SHELL_SUGGESTIONS.map((command) => ({
      label: command,
      description: "suggestion",
    }));
    const chosen = await vscode.window.showQuickPick(
      [...suggestions, { label: "$(pencil) Enter a different command...", description: "" }],
      { title: `${label} — which command lists the options?`, ignoreFocusOut: true },
    );
    if (!chosen) {
      return undefined;
    }
    let command = chosen.label;
    if (chosen.label.startsWith("$(pencil)")) {
      const typed = await vscode.window.showInputBox({
        title: `${label} — command`,
        prompt: "Each non-empty line of its output becomes one option",
        placeHolder: SHELL_SUGGESTIONS[0],
        ignoreFocusOut: true,
      });
      if (!typed) {
        return undefined;
      }
      command = typed;
    }
    arg.command = command;
    void folderPath;
  }

  if (kindPick.argKind === "pick" || kindPick.argKind === "multiPick") {
    const typed = await vscode.window.showInputBox({
      title: `${label} — options`,
      prompt: "Comma-separated list of the choices to offer",
      value: candidate.value ?? "",
      ignoreFocusOut: true,
      validateInput: (input) =>
        input.trim().length === 0 ? "Give at least one option." : undefined,
    });
    if (typed === undefined) {
      return undefined;
    }
    arg.options = typed
      .split(",")
      .map((option) => option.trim())
      .filter((option) => option.length > 0);
  }

  if (kindPick.argKind === "input" && candidate.value) {
    arg.placeholder = candidate.value;
  }

  return arg;
}

/** Appends a command to the config file, preserving its comments and formatting. */
async function appendCommand(uri: vscode.Uri, command: CommandDef): Promise<void> {
  let text: string;
  try {
    text = new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
  } catch {
    text = '{\n  "version": 1,\n  "commands": []\n}\n';
  }

  const existing = parseJsonc(text) as Partial<CockpitConfig> | undefined;
  const count = Array.isArray(existing?.commands) ? existing.commands.length : 0;

  const edits = modify(text, ["commands", count], command, {
    formattingOptions: { insertSpaces: true, tabSize: 2 },
  });
  const updated = applyEdits(text, edits);

  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(updated));
}

/**
 * The paste-to-parameterize flow: paste a command line, tick the parts that
 * should become editable, choose a control for each, and it is written out.
 */
export async function addCommandFlow(
  folder: vscode.WorkspaceFolder,
  configUri: vscode.Uri,
): Promise<boolean> {
  const pasted = await vscode.window.showInputBox({
    title: "Add command — 1 of 3",
    prompt: "Paste the command line you normally run",
    placeHolder: 'npm run deploy -- --env staging --only api,web --dry-run',
    ignoreFocusOut: true,
    validateInput: (input) =>
      input.trim().length === 0 ? "Paste a command to continue." : undefined,
  });
  if (!pasted) {
    return false;
  }

  const parsed = parseCommandLine(pasted);

  let args: ArgDef[] = [];
  if (parsed.candidates.length > 0) {
    const picked = await vscode.window.showQuickPick(
      parsed.candidates.map((candidate) => ({
        label: candidate.flag ?? candidate.value ?? "",
        description: candidate.isSwitch ? "switch" : candidate.value,
        detail: `Suggested: ${candidate.kindGuess}`,
        picked: true,
        candidate,
      })),
      {
        title: "Add command — 2 of 3",
        placeHolder: `Which parts stay editable?  Fixed: ${parsed.base}`,
        canPickMany: true,
        ignoreFocusOut: true,
      },
    );
    if (!picked) {
      return false;
    }

    for (const item of picked) {
      const arg = await refineCandidate(item.candidate, folder.uri.fsPath);
      if (!arg) {
        return false;
      }
      args.push(arg);
    }
  }

  // Anything not turned into an argument stays part of the fixed command line.
  const editableFlags = new Set(args.map((arg) => arg.flag).filter(Boolean));
  const leftovers = parsed.candidates
    .filter((candidate) => !candidate.flag || !editableFlags.has(candidate.flag))
    .filter((candidate) => !args.some((arg) => arg.id === candidate.id))
    .flatMap((candidate) => [candidate.flag, candidate.value].filter(Boolean) as string[]);

  const commandLine = [parsed.base, ...leftovers].filter(Boolean).join(" ");

  const label = await vscode.window.showInputBox({
    title: "Add command — 3 of 3",
    prompt: "Name for this command, as it appears in the sidebar",
    value: parsed.base.replace(/^(bun|npm|pnpm|yarn|node)\s+(run\s+)?/, "").replace(/\s+--$/, ""),
    ignoreFocusOut: true,
    validateInput: (input) => (input.trim().length === 0 ? "Give it a name." : undefined),
  });
  if (!label) {
    return false;
  }

  const command: CommandDef = {
    id: label.toLowerCase().replace(/[^a-z\d]+/g, "-").replace(/^-|-$/g, ""),
    label,
    command: commandLine,
    args,
  };

  await appendCommand(configUri, command);
  return true;
}
