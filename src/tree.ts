import * as vscode from "vscode";
import { initialValue, renderValue } from "./args";
import { loadAll } from "./config";
import type { ValueStore } from "./state";
import type { ArgDef, CommandDef, LoadedConfig } from "./types";

export interface CommandNode {
  type: "command";
  folder: vscode.WorkspaceFolder;
  command: CommandDef;
}

export interface ArgNode {
  type: "arg";
  folder: vscode.WorkspaceFolder;
  command: CommandDef;
  arg: ArgDef;
}

interface GroupNode {
  type: "group";
  folder: vscode.WorkspaceFolder;
  label: string;
  commands: CommandDef[];
}

interface FolderNode {
  type: "folder";
  loaded: LoadedConfig;
}

interface ProblemNode {
  type: "problem";
  folder: vscode.WorkspaceFolder;
  message: string;
}

export type CockpitNode = CommandNode | ArgNode | GroupNode | FolderNode | ProblemNode;

const KIND_ICONS: Record<ArgDef["kind"], string> = {
  input: "edit",
  pick: "list-selection",
  shellPick: "terminal",
  flag: "check",
  multiPick: "checklist",
};

/**
 * A stable id per node, so VS Code can correlate a freshly-constructed node
 * (getChildren() builds a new object on every call - there is no reused
 * reference) with the row it already has on screen. Without this, firing
 * onDidChangeTreeData(node) with a structurally-equal-but-not-reference-equal
 * node is silently a no-op: VS Code cannot tell it is the same row, so an
 * edited value never appears until something forces a full-tree rebuild.
 * It also keeps expand/collapse state and scroll position across refreshes.
 */
function nodeId(node: CockpitNode): string {
  const folder = node.type === "folder" ? node.loaded.folder : node.folder;
  const base = folder.uri.toString();
  switch (node.type) {
    case "folder":
      return base;
    case "group":
      return `${base}::group:${node.label}`;
    case "command":
      return `${base}::cmd:${node.command.id}`;
    case "arg":
      return `${base}::cmd:${node.command.id}::arg:${node.arg.id}`;
    case "problem":
      return `${base}::problem:${node.message}`;
  }
}

export class CockpitTreeProvider implements vscode.TreeDataProvider<CockpitNode> {
  private readonly emitter = new vscode.EventEmitter<CockpitNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  private loaded: LoadedConfig[] = [];

  constructor(private readonly store: ValueStore) {}

  async refresh(): Promise<void> {
    this.loaded = await loadAll();
    const total = this.loaded.reduce((sum, entry) => sum + entry.config.commands.length, 0);
    await vscode.commands.executeCommand("setContext", "cockpit.hasCommands", total > 0);
    this.emitter.fire(undefined);
  }

  /** Redraw a single command subtree after one of its values changed. */
  refreshCommand(node: CommandNode): void {
    this.emitter.fire(node);
  }

  find(folderName: string, commandId: string): CommandNode | undefined {
    for (const entry of this.loaded) {
      if (entry.folder.name !== folderName) {
        continue;
      }
      const command = entry.config.commands.find((candidate) => candidate.id === commandId);
      if (command) {
        return { type: "command", folder: entry.folder, command };
      }
    }
    return undefined;
  }

  get configs(): LoadedConfig[] {
    return this.loaded;
  }

  getTreeItem(node: CockpitNode): vscode.TreeItem {
    const item = this.buildTreeItem(node);
    // Centralised so every branch below gets one - see nodeId() for why.
    item.id = nodeId(node);
    return item;
  }

  private buildTreeItem(node: CockpitNode): vscode.TreeItem {
    switch (node.type) {
      case "folder": {
        const item = new vscode.TreeItem(
          node.loaded.folder.name,
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.iconPath = new vscode.ThemeIcon("folder");
        item.contextValue = "cockpitFolder";
        return item;
      }

      case "group": {
        const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded);
        item.iconPath = new vscode.ThemeIcon("folder-opened");
        item.contextValue = "cockpitGroup";
        return item;
      }

      case "command": {
        const hasArgs = node.command.args.length > 0;
        const item = new vscode.TreeItem(
          node.command.label,
          hasArgs
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None,
        );
        item.description = node.command.description;
        item.iconPath = new vscode.ThemeIcon(node.command.icon ?? "play-circle");
        item.contextValue = hasArgs ? "cockpitCommandWithArgs" : "cockpitCommand";
        item.tooltip = new vscode.MarkdownString(
          [
            `**${node.command.label}**`,
            node.command.description ?? "",
            "",
            "```",
            node.command.command,
            "```",
          ].join("\n"),
        );
        item.command = {
          command: "cockpit.run",
          title: "Run",
          arguments: [node],
        };
        return item;
      }

      case "arg": {
        const folderKey = node.folder.uri.toString();
        const remembered = this.store.get(folderKey, node.command.id, node.arg.id);
        const value = initialValue(node.arg, remembered);
        const rendered = renderValue(value);

        const item = new vscode.TreeItem(
          node.arg.label ?? node.arg.id,
          vscode.TreeItemCollapsibleState.None,
        );
        item.description = rendered === "" ? "not set" : rendered;
        item.iconPath = new vscode.ThemeIcon(KIND_ICONS[node.arg.kind] ?? "symbol-parameter");
        item.contextValue = "cockpitArg";
        item.tooltip = new vscode.MarkdownString(
          [
            `**${node.arg.label ?? node.arg.id}** *(${node.arg.kind})*`,
            node.arg.description ?? "",
            node.arg.flag ? `\n\nEmitted as \`${node.arg.flag}\`` : "",
          ].join("\n"),
        );
        item.command = {
          command: "cockpit.editArg",
          title: "Edit",
          arguments: [node],
        };
        return item;
      }

      case "problem": {
        const item = new vscode.TreeItem(node.message, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon(
          "warning",
          new vscode.ThemeColor("problemsWarningIcon.foreground"),
        );
        item.contextValue = "cockpitProblem";
        item.command = { command: "cockpit.openConfig", title: "Open config" };
        return item;
      }
    }
  }

  getChildren(node?: CockpitNode): CockpitNode[] {
    if (!node) {
      return this.rootChildren();
    }

    switch (node.type) {
      case "folder":
        return this.folderChildren(node.loaded);
      case "group":
        return node.commands.map((command) => ({
          type: "command" as const,
          folder: node.folder,
          command,
        }));
      case "command":
        return node.command.args.map((arg) => ({
          type: "arg" as const,
          folder: node.folder,
          command: node.command,
          arg,
        }));
      default:
        return [];
    }
  }

  private rootChildren(): CockpitNode[] {
    const withContent = this.loaded.filter(
      (entry) => entry.config.commands.length > 0 || entry.errors.length > 0,
    );
    if (withContent.length === 0) {
      return [];
    }
    if (withContent.length === 1) {
      return this.folderChildren(withContent[0]);
    }
    return withContent.map((loaded) => ({ type: "folder" as const, loaded }));
  }

  private folderChildren(loaded: LoadedConfig): CockpitNode[] {
    const nodes: CockpitNode[] = loaded.errors.map((message) => ({
      type: "problem" as const,
      folder: loaded.folder,
      message,
    }));

    const grouped = new Map<string, CommandDef[]>();
    const ungrouped: CommandDef[] = [];

    for (const command of loaded.config.commands) {
      if (command.group) {
        const bucket = grouped.get(command.group) ?? [];
        bucket.push(command);
        grouped.set(command.group, bucket);
      } else {
        ungrouped.push(command);
      }
    }

    for (const [label, commands] of grouped) {
      nodes.push({ type: "group", folder: loaded.folder, label, commands });
    }
    for (const command of ungrouped) {
      nodes.push({ type: "command", folder: loaded.folder, command });
    }

    return nodes;
  }
}
