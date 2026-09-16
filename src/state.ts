import type * as vscode from "vscode";
import type { ArgValue } from "./types";

type CommandValues = Record<string, ArgValue>;

/** Remembers the last used argument values, per workspace folder and command. */
export class ValueStore {
  constructor(private readonly memento: vscode.Memento) {}

  private key(folderKey: string, commandId: string): string {
    return `cockpit.values:${folderKey}:${commandId}`;
  }

  all(folderKey: string, commandId: string): CommandValues {
    return this.memento.get<CommandValues>(this.key(folderKey, commandId), {});
  }

  get(folderKey: string, commandId: string, argId: string): ArgValue {
    return this.all(folderKey, commandId)[argId];
  }

  async set(folderKey: string, commandId: string, argId: string, value: ArgValue): Promise<void> {
    const values: CommandValues = { ...this.all(folderKey, commandId) };
    if (value === undefined) {
      delete values[argId];
    } else {
      values[argId] = value;
    }
    await this.memento.update(this.key(folderKey, commandId), values);
  }

  async reset(folderKey: string, commandId: string): Promise<void> {
    await this.memento.update(this.key(folderKey, commandId), undefined);
  }
}
