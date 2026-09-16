import * as vscode from "vscode";
import { applyEdits, modify } from "jsonc-parser";
import { parseConfigText } from "./config";
import type { CommandDef } from "./types";

const FILTERS = { "Cockpit config": ["jsonc", "json"] };

async function readText(uri: vscode.Uri): Promise<string | undefined> {
  try {
    return new TextDecoder().decode(await vscode.workspace.fs.readFile(uri));
  } catch {
    return undefined;
  }
}

/**
 * Copies a folder's config file, comments and formatting intact, to a location
 * the user picks - for backing it up, sharing it outside the repo, or seeding
 * another project.
 */
export async function exportConfigFlow(
  folder: vscode.WorkspaceFolder,
  configUri: vscode.Uri,
): Promise<boolean> {
  const text = await readText(configUri);
  if (text === undefined) {
    vscode.window.showErrorMessage(`Cockpit: no config file yet in "${folder.name}".`);
    return false;
  }

  const suggested = vscode.Uri.file(`${folder.name}.cockpit.jsonc`);
  const destination = await vscode.window.showSaveDialog({
    title: "Export Cockpit config",
    defaultUri: suggested,
    filters: FILTERS,
  });
  if (!destination) {
    return false;
  }

  await vscode.workspace.fs.writeFile(destination, new TextEncoder().encode(text));
  return true;
}

/** Appends commands to a config file's "commands" array, preserving the rest of the file. */
function appendCommands(text: string, commands: CommandDef[]): string {
  let result = text;
  for (const command of commands) {
    const current = parseConfigText(result).config.commands.length;
    const edits = modify(result, ["commands", current], command, {
      formattingOptions: { insertSpaces: true, tabSize: 2 },
    });
    result = applyEdits(result, edits);
  }
  return result;
}

type ImportMode = "merge" | "replace";

async function pickMode(
  importedCount: number,
  existingCount: number,
): Promise<ImportMode | undefined> {
  const picked = await vscode.window.showQuickPick(
    [
      {
        label: "$(git-merge) Merge",
        description: `Add the ${importedCount} imported command(s) to the ${existingCount} already here`,
        mode: "merge" as const,
      },
      {
        label: "$(warning) Replace",
        description: `Discard the ${existingCount} command(s) already here`,
        mode: "replace" as const,
      },
    ],
    { title: "How should the imported commands be applied?", ignoreFocusOut: true },
  );
  return picked?.mode;
}

/**
 * Loads a config file the user picks and applies it to a folder's config,
 * either merging its commands in (skipping id collisions) or replacing the
 * folder's config outright.
 */
export async function importConfigFlow(
  folder: vscode.WorkspaceFolder,
  configUri: vscode.Uri,
): Promise<boolean> {
  const [source] = (await vscode.window.showOpenDialog({
    title: "Import Cockpit config",
    filters: FILTERS,
    canSelectMany: false,
  })) ?? [];
  if (!source) {
    return false;
  }

  const sourceText = await readText(source);
  if (sourceText === undefined) {
    vscode.window.showErrorMessage(`Cockpit: could not read "${source.fsPath}".`);
    return false;
  }

  const { config: imported, errors } = parseConfigText(sourceText);
  if (errors.length > 0) {
    vscode.window.showErrorMessage(`Cockpit: "${source.fsPath}" is not a valid config - ${errors[0]}`);
    return false;
  }
  if (imported.commands.length === 0) {
    vscode.window.showWarningMessage(`Cockpit: "${source.fsPath}" has no commands to import.`);
    return false;
  }

  const existingText = await readText(configUri);
  const existing = existingText ? parseConfigText(existingText).config : { commands: [] };

  if (existing.commands.length === 0) {
    // Nothing to merge with or replace - just adopt the imported file as-is.
    await vscode.workspace.fs.writeFile(configUri, new TextEncoder().encode(sourceText));
    return true;
  }

  const mode = await pickMode(imported.commands.length, existing.commands.length);
  if (!mode) {
    return false;
  }

  if (mode === "replace") {
    await vscode.workspace.fs.writeFile(configUri, new TextEncoder().encode(sourceText));
    return true;
  }

  const existingIds = new Set(existing.commands.map((command) => command.id));
  const toAdd = imported.commands.filter((command) => !existingIds.has(command.id));
  const skipped = imported.commands.length - toAdd.length;

  if (toAdd.length === 0) {
    vscode.window.showWarningMessage(
      `Cockpit: every imported command id already exists in "${folder.name}" - nothing added.`,
    );
    return false;
  }

  const merged = appendCommands(existingText ?? "", toAdd);
  await vscode.workspace.fs.writeFile(configUri, new TextEncoder().encode(merged));

  if (skipped > 0) {
    vscode.window.showWarningMessage(
      `Cockpit: added ${toAdd.length} command(s) to "${folder.name}", skipped ${skipped} with an id that already exists.`,
    );
  }
  return true;
}
