// Simulates what the VS Code extension host does: resolve "vscode", load the
// built bundle, call activate(). Catches module-resolution and top-level errors.
const Module = require("node:module");
const path = require("node:path");

const disposable = { dispose() {} };
const emitterEvent = () => disposable;

class EventEmitter {
  constructor() { this.event = emitterEvent; }
  fire() {}
  dispose() {}
}

class TreeItem {
  constructor(label, collapsibleState) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

const registered = { commands: [], views: [], watchers: 0 };

const vscode = {
  EventEmitter,
  TreeItem,
  ThemeIcon: class { constructor(id, color) { this.id = id; this.color = color; } },
  ThemeColor: class { constructor(id) { this.id = id; } },
  MarkdownString: class { constructor(v) { this.value = v; } },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  ShellQuoting: { Escape: 1, Strong: 2, Weak: 3 },
  ShellExecution: class {},
  Task: class {},
  TaskRevealKind: { Always: 1 },
  TaskPanelKind: { Dedicated: 2 },
  tasks: { executeTask: async () => {} },
  Uri: {
    file: (p) => ({ fsPath: p, toString: () => "file://" + p }),
    joinPath: (base, ...parts) => ({
      fsPath: path.join(base.fsPath || "/", ...parts),
      toString: () => "file://" + path.join(base.fsPath || "/", ...parts),
    }),
  },
  window: {
    createTreeView: (id) => { registered.views.push(id); return disposable; },
    showErrorMessage: () => {},
    showWarningMessage: () => {},
    showInformationMessage: () => {},
    showQuickPick: async () => undefined,
    showInputBox: async () => undefined,
    showTextDocument: async () => {},
    withProgress: async (_o, fn) => fn(),
  },
  commands: {
    registerCommand: (id) => { registered.commands.push(id); return disposable; },
    executeCommand: async () => {},
  },
  workspace: {
    workspaceFolders: [
      { name: "demo", uri: { fsPath: process.cwd(), toString: () => "file://demo" }, index: 0 },
    ],
    getConfiguration: () => ({ get: (_k, d) => d }),
    createFileSystemWatcher: () => {
      registered.watchers += 1;
      return { onDidChange: emitterEvent, onDidCreate: emitterEvent, onDidDelete: emitterEvent, dispose() {} };
    },
    onDidChangeWorkspaceFolders: emitterEvent,
    onDidChangeConfiguration: emitterEvent,
    openTextDocument: async () => ({}),
    fs: {
      readFile: async () => { const e = new Error("ENOENT"); throw e; },
      writeFile: async () => {},
      stat: async () => { throw new Error("ENOENT"); },
    },
  },
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "vscode") return vscode;
  return origLoad.call(this, request, parent, isMain);
};

const bundlePath = process.argv[2] || require("node:path").resolve(__dirname, "../dist/extension.js");
let ext;
try {
  ext = require(bundlePath);
} catch (err) {
  console.error("LOAD FAILED: " + err.message);
  process.exit(1);
}

if (typeof ext.activate !== "function") {
  console.error("FAILED: bundle exports no activate()");
  process.exit(1);
}

const context = {
  subscriptions: [],
  workspaceState: { get: (_k, d) => d, update: async () => {} },
};

Promise.resolve()
  .then(() => ext.activate(context))
  .then(() => new Promise((r) => setTimeout(r, 300)))
  .then(() => {
    console.log("activate() completed without throwing");
    console.log("  tree views registered : " + registered.views.join(", "));
    console.log("  commands registered   : " + registered.commands.length);
    registered.commands.forEach((c) => console.log("      " + c));
    console.log("  file watchers         : " + registered.watchers);
    console.log("  disposables tracked   : " + context.subscriptions.length);
  })
  .catch((err) => {
    console.error("ACTIVATE THREW: " + (err && err.message));
    console.error(err && err.stack);
    process.exit(1);
  });
