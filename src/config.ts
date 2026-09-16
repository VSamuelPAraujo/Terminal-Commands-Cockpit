import * as vscode from "vscode";
import { parse as parseJsonc, type ParseError } from "jsonc-parser";
import type { ArgDef, CockpitConfig, CommandDef, LoadedConfig } from "./types";

const VALID_KINDS = new Set<string>(["input", "pick", "shellPick", "flag", "multiPick"]);

export function configFileSetting(): string {
  return vscode.workspace
    .getConfiguration("cockpit")
    .get<string>("configFile", ".vscode/cockpit.jsonc");
}

/** The configured path first, then its .json/.jsonc sibling so either extension works. */
function candidatePaths(): string[] {
  const configured = configFileSetting();
  const paths = [configured];
  if (configured.endsWith(".jsonc")) {
    paths.push(configured.slice(0, -"jsonc".length) + "json");
  } else if (configured.endsWith(".json")) {
    paths.push(configured.slice(0, -"json".length) + "jsonc");
  }
  return paths;
}

export function configUriFor(folder: vscode.WorkspaceFolder): vscode.Uri {
  return vscode.Uri.joinPath(folder.uri, ...configFileSetting().split("/"));
}

async function readFirstExisting(
  folder: vscode.WorkspaceFolder,
): Promise<{ uri: vscode.Uri; text: string } | undefined> {
  for (const relative of candidatePaths()) {
    const uri = vscode.Uri.joinPath(folder.uri, ...relative.split("/"));
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      return { uri, text: new TextDecoder().decode(bytes) };
    } catch {
      // Not there - try the next candidate.
    }
  }
  return undefined;
}

function validateArg(
  raw: unknown,
  commandId: string,
  index: number,
  errors: string[],
): ArgDef | undefined {
  if (typeof raw !== "object" || raw === null) {
    errors.push(`${commandId}: argument ${index} is not an object.`);
    return undefined;
  }
  const arg = raw as Partial<ArgDef>;
  if (!arg.id) {
    errors.push(`${commandId}: argument ${index} is missing "id".`);
    return undefined;
  }
  if (!arg.kind || !VALID_KINDS.has(arg.kind)) {
    const kinds = Array.from(VALID_KINDS).join(", ");
    errors.push(`${commandId}.${arg.id}: "kind" must be one of ${kinds}.`);
    return undefined;
  }
  if ((arg.kind === "pick" || arg.kind === "multiPick") && !arg.options?.length) {
    errors.push(`${commandId}.${arg.id}: "${arg.kind}" needs a non-empty "options" array.`);
    return undefined;
  }
  if (arg.kind === "shellPick" && !arg.command) {
    errors.push(`${commandId}.${arg.id}: "shellPick" needs a "command" to produce its options.`);
    return undefined;
  }
  return arg as ArgDef;
}

function validate(raw: unknown, errors: string[]): CockpitConfig {
  if (typeof raw !== "object" || raw === null) {
    errors.push("The config root must be an object.");
    return { commands: [] };
  }
  const root = raw as Partial<CockpitConfig>;
  if (!Array.isArray(root.commands)) {
    errors.push('The config needs a "commands" array.');
    return { commands: [] };
  }

  const seen = new Set<string>();
  const commands: CommandDef[] = [];

  root.commands.forEach((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      errors.push(`commands[${index}] is not an object.`);
      return;
    }
    const candidate = entry as Partial<CommandDef>;
    const id = candidate.id ?? candidate.label;
    if (!id) {
      errors.push(`commands[${index}] needs an "id" or a "label".`);
      return;
    }
    if (!candidate.command) {
      errors.push(`${id}: missing "command".`);
      return;
    }
    if (seen.has(id)) {
      errors.push(`Duplicate command id "${id}" - the second one is ignored.`);
      return;
    }
    seen.add(id);

    const args: ArgDef[] = [];
    for (const [argIndex, rawArg] of (candidate.args ?? []).entries()) {
      const arg = validateArg(rawArg, id, argIndex, errors);
      if (arg) {
        args.push(arg);
      }
    }

    commands.push({
      ...(candidate as CommandDef),
      id,
      label: candidate.label ?? id,
      args,
    });
  });

  return { version: root.version, commands };
}

export async function loadAll(): Promise<LoadedConfig[]> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  const loaded: LoadedConfig[] = [];

  for (const folder of folders) {
    const found = await readFirstExisting(folder);
    if (!found) {
      continue;
    }
    const errors: string[] = [];
    const parseErrors: ParseError[] = [];
    const raw = parseJsonc(found.text, parseErrors, { allowTrailingComma: true });
    if (parseErrors.length > 0) {
      errors.push(`${parseErrors.length} syntax error(s) - the file is not valid JSON.`);
    }
    loaded.push({ folder, configUri: found.uri, config: validate(raw, errors), errors });
  }

  return loaded;
}

/** Writes `commands` back into a config file, preserving nothing else. */
export function serializeConfig(config: CockpitConfig): string {
  return JSON.stringify({ version: 1, commands: config.commands }, null, 2) + "\n";
}

export const DEFAULT_CONFIG_TEMPLATE = [
  "{",
  "  // Terminal Commands Cockpit - every command below appears in the sidebar.",
  "  // Hover any property for docs; autocomplete is available via the bundled schema.",
  '  "version": 1,',
  '  "commands": [',
  "    {",
  '      "id": "example",',
  '      "label": "Example: greet",',
  '      "description": "Replace this with a command of your own.",',
  '      "icon": "rocket",',
  '      "command": "echo",',
  '      "args": [',
  "        {",
  '          "id": "name",',
  '          "kind": "input",',
  '          "label": "Name",',
  '          "placeholder": "Who should we greet?",',
  '          "default": "world"',
  "        }",
  "      ]",
  "    }",
  "  ]",
  "}",
  "",
].join("\n");
