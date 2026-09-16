import * as vscode from "vscode";
import { CANCELLED, initialValue, promptArg } from "./args";
import { addCommandFlow } from "./authoring";
import { DEFAULT_CONFIG_TEMPLATE, configFileSetting, configUriFor } from "./config";
import { exportConfigFlow, importConfigFlow } from "./importExport";
import { build, run } from "./runner";
import { ValueStore } from "./state";
import { CockpitTreeProvider, type ArgNode, type CommandNode } from "./tree";
import type { ArgValue } from "./types";

export function activate(context: vscode.ExtensionContext): void {
  const store = new ValueStore(context.workspaceState);
  const provider = new CockpitTreeProvider(store);

  const view = vscode.window.createTreeView("cockpit.commands", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });
  context.subscriptions.push(view);

  const folderKey = (folder: vscode.WorkspaceFolder): string => folder.uri.toString();

  /** Current values for every argument of a command. */
  const currentValues = (node: CommandNode): Record<string, ArgValue> => {
    const key = folderKey(node.folder);
    const values: Record<string, ArgValue> = {};
    for (const arg of node.command.args) {
      values[arg.id] = initialValue(arg, store.get(key, node.command.id, arg.id));
    }
    return values;
  };

  /** The folder's config file, whether or not it has been created yet. */
  const configUriForFolder = (folder: vscode.WorkspaceFolder): vscode.Uri =>
    provider.configs.find((entry) => entry.folder === folder)?.configUri ?? configUriFor(folder);

  const shouldRemember = (remember: boolean | undefined): boolean =>
    remember ?? vscode.workspace.getConfiguration("cockpit").get<boolean>("rememberArguments", true);

  const editArg = async (node: ArgNode): Promise<boolean> => {
    const key = folderKey(node.folder);
    const current = initialValue(node.arg, store.get(key, node.command.id, node.arg.id));
    const result = await promptArg(node.arg, current, node.folder.uri.fsPath);
    if (result === CANCELLED) {
      return false;
    }
    if (shouldRemember(node.arg.remember)) {
      await store.set(key, node.command.id, node.arg.id, result);
    }
    provider.redraw();
    return true;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("cockpit.refresh", () => provider.refresh()),

    vscode.commands.registerCommand("cockpit.run", async (node?: CommandNode) => {
      if (!node) {
        return;
      }
      const key = folderKey(node.folder);
      const values = currentValues(node);

      // Only interrupt for arguments that are required and still empty.
      for (const arg of node.command.args) {
        const value = values[arg.id];
        const isEmpty =
          value === undefined ||
          value === "" ||
          (Array.isArray(value) && value.length === 0);
        if (!arg.required || !isEmpty) {
          continue;
        }
        const result = await promptArg(arg, value, node.folder.uri.fsPath);
        if (result === CANCELLED) {
          return;
        }
        values[arg.id] = result;
        if (shouldRemember(arg.remember)) {
          await store.set(key, node.command.id, arg.id, result);
        }
      }

      provider.redraw();
      try {
        const launched = await run(node.command, values, node.folder);
        if (launched && node.command.resetAfterRun) {
          await store.reset(key, node.command.id);
          provider.redraw();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Cockpit: ${message}`);
      }
    }),

    vscode.commands.registerCommand("cockpit.editArg", async (node?: ArgNode) => {
      if (node) {
        await editArg(node);
      }
    }),

    vscode.commands.registerCommand("cockpit.clearArg", async (node?: ArgNode) => {
      if (!node) {
        return;
      }
      await store.set(folderKey(node.folder), node.command.id, node.arg.id, undefined);
      provider.redraw();
    }),

    vscode.commands.registerCommand("cockpit.resetArgs", async (node?: CommandNode) => {
      if (!node) {
        return;
      }
      await store.reset(folderKey(node.folder), node.command.id);
      provider.redraw();
    }),

    vscode.commands.registerCommand("cockpit.copyCommandLine", async (node?: CommandNode) => {
      if (!node) {
        return;
      }
      const { preview } = build(node.command, currentValues(node));
      await vscode.env.clipboard.writeText(preview);
      vscode.window.showInformationMessage(`Copied: ${preview}`);
    }),

    vscode.commands.registerCommand("cockpit.openConfig", async () => {
      const [first] = provider.configs;
      if (first) {
        await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(first.configUri));
        return;
      }
      await vscode.commands.executeCommand("cockpit.createConfig");
    }),

    vscode.commands.registerCommand("cockpit.addCommand", async () => {
      const folder = await pickFolder();
      if (!folder) {
        return;
      }
      try {
        if (await addCommandFlow(folder, configUriForFolder(folder))) {
          await provider.refresh();
          vscode.window.showInformationMessage("Cockpit: command added.");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Cockpit: could not add the command - ${message}`);
      }
    }),

    vscode.commands.registerCommand("cockpit.exportConfig", async () => {
      const folder = await pickFolder();
      if (!folder) {
        return;
      }
      try {
        if (await exportConfigFlow(folder, configUriForFolder(folder))) {
          vscode.window.showInformationMessage("Cockpit: config exported.");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Cockpit: could not export the config - ${message}`);
      }
    }),

    vscode.commands.registerCommand("cockpit.importConfig", async () => {
      const folder = await pickFolder();
      if (!folder) {
        return;
      }
      try {
        if (await importConfigFlow(folder, configUriForFolder(folder))) {
          await provider.refresh();
          vscode.window.showInformationMessage("Cockpit: config imported.");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Cockpit: could not import the config - ${message}`);
      }
    }),

    vscode.commands.registerCommand("cockpit.createConfig", async () => {
      const folder = await pickFolder();
      if (!folder) {
        return;
      }
      const uri = configUriFor(folder);
      try {
        await vscode.workspace.fs.stat(uri);
      } catch {
        await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(DEFAULT_CONFIG_TEMPLATE));
      }
      await provider.refresh();
      await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
    }),
  );

  // Keep the tree in step with the config file.
  const watcher = vscode.workspace.createFileSystemWatcher(`**/${configFileSetting()}`);
  watcher.onDidChange(() => provider.refresh());
  watcher.onDidCreate(() => provider.refresh());
  watcher.onDidDelete(() => provider.refresh());
  context.subscriptions.push(watcher);

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => provider.refresh()),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("cockpit")) {
        provider.refresh();
      }
    }),
  );

  void provider.refresh();
}

async function pickFolder(): Promise<vscode.WorkspaceFolder | undefined> {
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 0) {
    vscode.window.showErrorMessage("Cockpit: open a folder first.");
    return undefined;
  }
  if (folders.length === 1) {
    return folders[0];
  }
  const picked = await vscode.window.showQuickPick(
    folders.map((folder) => ({ label: folder.name, folder })),
    { title: "Which folder should hold the Cockpit config?" },
  );
  return picked?.folder;
}

export function deactivate(): void {
  // Nothing to clean up - everything is in context.subscriptions.
}
