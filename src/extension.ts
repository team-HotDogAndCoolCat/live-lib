import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { LibraryTreeDataProvider } from "./libraryTree";
import { LibraryMetadataService } from "./registry";

export function activate(context: vscode.ExtensionContext) {
  const metadataService = new LibraryMetadataService();
  const treeDataProvider = new LibraryTreeDataProvider(metadataService);

  context.subscriptions.push(
    treeDataProvider,
    metadataService,
    vscode.window.registerTreeDataProvider("libExplorer", treeDataProvider),
    ...registerCommands(metadataService, treeDataProvider),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("liveLib.packageManager")) {
        treeDataProvider.refresh();
      }
    })
  );
}

export function deactivate() {}
